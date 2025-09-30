import { MigrationConfig, MigrationResult, CollectionSchema, TableRelationship, ColumnMapping, PostgresTableSchema } from '../types';
import { Logger, DDLParser } from '../utils';
import { MongoAnalyzer } from './mongo-analyzer';
import { PostgresManager } from './postgres-manager';
import { AIAssistant } from './ai-assistant';
import { promises as fs } from 'fs';

export class MigrationEngine {
  private logger: Logger;
  private mongoAnalyzer: MongoAnalyzer;
  private postgresManager: PostgresManager;
  private aiAssistant: AIAssistant;
  private ddlParser: DDLParser;
  private tableRelationships: TableRelationship[] = [];

  constructor(config: MigrationConfig) {
    this.logger = new Logger(config.logLevel || 'info');
    this.mongoAnalyzer = new MongoAnalyzer(this.logger);
    this.postgresManager = new PostgresManager(this.logger);
    this.aiAssistant = new AIAssistant(config.openAiApiKey, this.logger);
    this.ddlParser = new DDLParser(this.logger);
  }

  async migrate(config: MigrationConfig): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migratedCollections: [],
      errors: [],
      totalDocuments: 0,
      migrationTime: 0
    };

    try {
      this.logger.info('Starting MongoDB to PostgreSQL migration');
      this.logger.info(`Mode: ${config.mode}`);
      this.logger.info(`Batch size: ${config.batchSize || 1000}`);

      // Connect to databases
      await this.mongoAnalyzer.connect(config.mongoUrl);
      await this.postgresManager.connect(config.postgresUrl);

      // Execute DDL script if provided and in auto-tables mode
      if (config.postgresDDL) {
        if (config.mode === 'auto-tables') {
          await this.executeDDLScript(config.postgresDDL);
        } else {
          // For pre-existing mode, parse DDL for relationships but don't execute
          await this.parseDDLForRelationships(config.postgresDDL);
        }
      }

      // Get collections to migrate
      const collections = await this.mongoAnalyzer.getCollections();
      this.logger.info(`Found ${collections.length} collections to migrate`);

      if (config.mode === 'auto-tables') {
        await this.migrateWithAutoTables(collections, config, result);
      } else {
        await this.migrateWithExistingTables(collections, config, result);
      }

      result.success = result.errors.length === 0;
      result.migrationTime = Date.now() - startTime;

      this.logger.info('Migration completed');
      this.logger.info(`Total documents migrated: ${result.totalDocuments}`);
      this.logger.info(`Migration time: ${result.migrationTime}ms`);

      if (result.errors.length > 0) {
        this.logger.warn(`Migration completed with ${result.errors.length} errors`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      this.logger.error('Migration failed:', error);
    } finally {
      // Cleanup connections
      await this.mongoAnalyzer.disconnect();
      await this.postgresManager.disconnect();
    }

    return result;
  }

  private async executeDDLScript(ddlPath: string): Promise<void> {
    try {
      // Check if file exists
      await fs.access(ddlPath);
      this.logger.info(`Executing DDL script: ${ddlPath}`);
      await this.postgresManager.executeDDL(ddlPath);
      
      // Parse relationships from DDL for dependency ordering
      await this.parseDDLForRelationships(ddlPath);
    } catch (error) {
      this.logger.error(`Failed to execute DDL script ${ddlPath}:`, error);
      throw error;
    }
  }

  private async parseDDLForRelationships(ddlPath: string): Promise<void> {
    try {
      await fs.access(ddlPath);
      const ddlContent = await fs.readFile(ddlPath, 'utf-8');
      this.tableRelationships = this.ddlParser.parseRelationships(ddlContent);
      this.logger.info(`Parsed ${this.tableRelationships.length} table relationships from DDL`);
    } catch (error) {
      this.logger.error(`Failed to parse DDL relationships from ${ddlPath}:`, error);
      // Don't throw error - relationships are optional
    }
  }

  private async migrateWithAutoTables(
    collections: string[], 
    config: MigrationConfig, 
    result: MigrationResult
  ): Promise<void> {
    this.logger.info('Starting auto-tables migration mode');

    const schemas: CollectionSchema[] = [];

    // Analyze all collections first
    for (const collectionName of collections) {
      try {
        const schema = await this.mongoAnalyzer.analyzeCollection(collectionName);
        schemas.push(schema);
      } catch (error) {
        const errorMessage = `Failed to analyze collection ${collectionName}: ${error}`;
        result.errors.push(errorMessage);
        this.logger.error(errorMessage);
        continue;
      }
    }

    // Use AI to analyze relationships if available
    if (config.openAiApiKey && schemas.length > 1) {
      await this.aiAssistant.analyzeRelationships(schemas);
    }

    // Get migration order based on dependencies
    const collectionNames = schemas.map(s => s.name);
    const migrationOrder = this.ddlParser.getInsertionOrder(collectionNames, this.tableRelationships);

    // Create tables and migrate data in dependency order
    for (const collectionName of migrationOrder) {
      const schema = schemas.find(s => s.name === collectionName);
      if (schema) {
        try {
          await this.migrateCollection(schema, config, result);
        } catch (error) {
          const errorMessage = `Failed to migrate collection ${schema.name}: ${error}`;
          result.errors.push(errorMessage);
          this.logger.error(errorMessage);
        }
      }
    }
  }

  private async migrateWithExistingTables(
    collections: string[], 
    config: MigrationConfig, 
    result: MigrationResult
  ): Promise<void> {
    this.logger.info('Starting pre-existing tables migration mode');

    // Get migration order based on dependencies
    const migrationOrder = this.ddlParser.getInsertionOrder(collections, this.tableRelationships);

    for (const collectionName of migrationOrder) {
      try {
        // Check if corresponding table exists
        const tableExists = await this.postgresManager.tableExists(collectionName);
        
        if (!tableExists) {
          this.logger.warn(`Table ${collectionName} does not exist, skipping collection`);
          continue;
        }

        // Analyze collection schema
        const mongoSchema = await this.mongoAnalyzer.analyzeCollection(collectionName);
        
        // Get PostgreSQL table schema
        const pgSchema = await this.postgresManager.getTableSchema(collectionName);
        
        if (!pgSchema) {
          this.logger.warn(`Could not get schema for table ${collectionName}`);
          continue;
        }

        // Get a sample document for AI analysis
        const sampleDoc = await this.mongoAnalyzer.getSingleDocument(collectionName);
        
        if (!sampleDoc) {
          this.logger.warn(`Collection ${collectionName} is empty, skipping`);
          continue;
        }

        // Migrate data with schema mapping
        await this.migrateCollectionToExistingTable(
          mongoSchema, 
          pgSchema, 
          sampleDoc, 
          config, 
          result
        );

      } catch (error) {
        const errorMessage = `Failed to migrate collection ${collectionName}: ${error}`;
        result.errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }
  }

  private async migrateCollection(
    schema: CollectionSchema, 
    config: MigrationConfig, 
    result: MigrationResult
  ): Promise<void> {
    this.logger.info(`Migrating collection: ${schema.name}`);

    // Use AI to suggest better schema if available
    let targetSchema = null;
    if (config.openAiApiKey) {
      targetSchema = await this.aiAssistant.interpretSchema(schema);
    }

    // Create table from schema
    await this.postgresManager.createTableFromSchema(schema);

    // Get document count
    const totalDocs = await this.mongoAnalyzer.getDocumentCount(schema.name);
    this.logger.info(`Collection ${schema.name} has ${totalDocs} documents`);

    // Migrate documents in batches
    const batchSize = config.batchSize || 1000;
    let migratedCount = 0;

    for (let skip = 0; skip < totalDocs; skip += batchSize) {
      const documents = await this.mongoAnalyzer.getDocuments(schema.name, skip, batchSize);
      
      if (documents.length === 0) break;

      // Use AI for data transformation if available
      let transformedDocs = documents;
      if (config.openAiApiKey && targetSchema) {
        const aiTransformed = await this.aiAssistant.suggestDataTransformation(documents, targetSchema);
        if (aiTransformed) {
          transformedDocs = aiTransformed;
        }
      }

      await this.postgresManager.insertDocuments(schema.name, transformedDocs);
      migratedCount += documents.length;
      
      this.logger.debug(`Migrated ${migratedCount}/${totalDocs} documents for ${schema.name}`);
    }

    result.migratedCollections.push(schema.name);
    result.totalDocuments += migratedCount;
    
    this.logger.info(`Completed migration for collection: ${schema.name} (${migratedCount} documents)`);
  }

  private async migrateCollectionToExistingTable(
    mongoSchema: CollectionSchema,
    pgSchema: PostgresTableSchema,
    sampleDocument: Record<string, unknown>,
    config: MigrationConfig,
    result: MigrationResult
  ): Promise<void> {
    this.logger.info(`Migrating collection ${mongoSchema.name} to existing table`);

    // Get AI-assisted column mappings if available
    let columnMappings: ColumnMapping[] | null = null;
    if (config.openAiApiKey) {
      columnMappings = await this.aiAssistant.suggestColumnMapping(sampleDocument, pgSchema);
    }

    // Fallback to basic field mapping if no AI mappings
    if (!columnMappings || columnMappings.length === 0) {
      columnMappings = this.createBasicColumnMappings(mongoSchema, pgSchema);
    }

    this.logger.info(`Using ${columnMappings.length} column mappings for ${mongoSchema.name}`);

    // Get document count
    const totalDocs = await this.mongoAnalyzer.getDocumentCount(mongoSchema.name);
    this.logger.info(`Collection ${mongoSchema.name} has ${totalDocs} documents`);

    // Migrate documents in batches
    const batchSize = config.batchSize || 1000;
    let migratedCount = 0;

    for (let skip = 0; skip < totalDocs; skip += batchSize) {
      const documents = await this.mongoAnalyzer.getDocuments(mongoSchema.name, skip, batchSize);
      
      if (documents.length === 0) break;

      await this.postgresManager.insertDocumentsWithMapping(
        mongoSchema.name, 
        documents, 
        columnMappings
      );
      migratedCount += documents.length;
      
      this.logger.debug(`Migrated ${migratedCount}/${totalDocs} documents for ${mongoSchema.name}`);
    }

    result.migratedCollections.push(mongoSchema.name);
    result.totalDocuments += migratedCount;
    
    this.logger.info(`Completed migration for collection: ${mongoSchema.name} (${migratedCount} documents)`);
  }

  /**
   * Create basic column mappings by matching field names
   */
  private createBasicColumnMappings(
    mongoSchema: CollectionSchema, 
    pgSchema: PostgresTableSchema
  ): ColumnMapping[] {
    const mappings: ColumnMapping[] = [];
    const pgColumns = new Set(pgSchema.columns.map(col => col.name));

    // Map _id to common PostgreSQL ID columns
    const idColumn = pgSchema.columns.find(col => 
      col.name.toLowerCase().includes('id') && (col.unique || col.primaryKey)
    );
    if (idColumn) {
      mappings.push({
        mongoField: '_id',
        postgresColumn: idColumn.name
      });
    }

    // Map other fields by name similarity
    for (const field of mongoSchema.fields) {
      if (field.name === '_id') continue;

      // Try exact match first
      const sanitizedFieldName = field.name.replace(/\./g, '_').toLowerCase();
      if (pgColumns.has(sanitizedFieldName)) {
        mappings.push({
          mongoField: field.name,
          postgresColumn: sanitizedFieldName
        });
        continue;
      }

      // Try partial matches
      const matchingColumn = pgSchema.columns.find(col => 
        col.name.toLowerCase().includes(sanitizedFieldName) ||
        sanitizedFieldName.includes(col.name.toLowerCase())
      );
      
      if (matchingColumn) {
        mappings.push({
          mongoField: field.name,
          postgresColumn: matchingColumn.name
        });
      }
    }

    return mappings;
  }
}