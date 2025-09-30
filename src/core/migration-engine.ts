import { MigrationConfig, MigrationResult, CollectionSchema } from '../types';
import { Logger } from '../utils';
import { MongoAnalyzer } from './mongo-analyzer';
import { PostgresManager } from './postgres-manager';
import { AIAssistant } from './ai-assistant';
import { promises as fs } from 'fs';

export class MigrationEngine {
  private logger: Logger;
  private mongoAnalyzer: MongoAnalyzer;
  private postgresManager: PostgresManager;
  private aiAssistant: AIAssistant;

  constructor(config: MigrationConfig) {
    this.logger = new Logger(config.logLevel || 'info');
    this.mongoAnalyzer = new MongoAnalyzer(this.logger);
    this.postgresManager = new PostgresManager(this.logger);
    this.aiAssistant = new AIAssistant(config.openAiApiKey, this.logger);
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

      // Execute DDL script if provided
      if (config.postgresDDL) {
        await this.executeDDLScript(config.postgresDDL);
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
    } catch (error) {
      this.logger.error(`Failed to execute DDL script ${ddlPath}:`, error);
      throw error;
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

    // Create tables and migrate data
    for (const schema of schemas) {
      try {
        await this.migrateCollection(schema, config, result);
      } catch (error) {
        const errorMessage = `Failed to migrate collection ${schema.name}: ${error}`;
        result.errors.push(errorMessage);
        this.logger.error(errorMessage);
      }
    }
  }

  private async migrateWithExistingTables(
    collections: string[], 
    config: MigrationConfig, 
    result: MigrationResult
  ): Promise<void> {
    this.logger.info('Starting pre-existing tables migration mode');

    for (const collectionName of collections) {
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

        // Migrate data with schema mapping
        await this.migrateCollectionToExistingTable(mongoSchema, pgSchema, config, result);

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
    pgSchema: any,
    config: MigrationConfig,
    result: MigrationResult
  ): Promise<void> {
    this.logger.info(`Migrating collection ${mongoSchema.name} to existing table`);

    // Get document count
    const totalDocs = await this.mongoAnalyzer.getDocumentCount(mongoSchema.name);
    this.logger.info(`Collection ${mongoSchema.name} has ${totalDocs} documents`);

    // Migrate documents in batches
    const batchSize = config.batchSize || 1000;
    let migratedCount = 0;

    for (let skip = 0; skip < totalDocs; skip += batchSize) {
      const documents = await this.mongoAnalyzer.getDocuments(mongoSchema.name, skip, batchSize);
      
      if (documents.length === 0) break;

      await this.postgresManager.insertDocuments(mongoSchema.name, documents);
      migratedCount += documents.length;
      
      this.logger.debug(`Migrated ${migratedCount}/${totalDocs} documents for ${mongoSchema.name}`);
    }

    result.migratedCollections.push(mongoSchema.name);
    result.totalDocuments += migratedCount;
    
    this.logger.info(`Completed migration for collection: ${mongoSchema.name} (${migratedCount} documents)`);
  }
}