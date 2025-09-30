import { Client } from 'pg';
import { PostgresTableSchema, ColumnSchema, CollectionSchema, ColumnMapping } from '../types';
import { Logger, mapMongoTypeToPostgres, sanitizeIdentifier } from '../utils';
import { promises as fs } from 'fs';

export class PostgresManager {
  private client: Client | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async connect(postgresUrl: string): Promise<void> {
    try {
      this.client = new Client({
        connectionString: postgresUrl
      });
      await this.client.connect();
      this.logger.info('Connected to PostgreSQL');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.logger.info('Disconnected from PostgreSQL');
    }
  }

  async tableExists(tableName: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Not connected to PostgreSQL');
    }

    const result = await this.client.query(
      'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)',
      [tableName]
    );
    return result.rows[0].exists;
  }

  async getTableSchema(tableName: string): Promise<PostgresTableSchema | null> {
    if (!this.client) {
      throw new Error('Not connected to PostgreSQL');
    }

    const exists = await this.tableExists(tableName);
    if (!exists) {
      return null;
    }

    const columnsResult = await this.client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    const columns: ColumnSchema[] = columnsResult.rows.map(row => ({
      name: row.column_name,
      type: this.mapPostgresTypeToStandard(row.data_type),
      nullable: row.is_nullable === 'YES',
      primaryKey: false // Will be updated below
    }));

    // Get primary key information
    const pkResult = await this.client.query(`
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary
    `, [tableName]);

    const primaryKeyColumns = pkResult.rows.map(row => row.attname);
    columns.forEach(col => {
      if (primaryKeyColumns.includes(col.name)) {
        col.primaryKey = true;
      }
    });

    return {
      name: tableName,
      columns
    };
  }

  async createTableFromSchema(schema: CollectionSchema): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to PostgreSQL');
    }

    const tableName = sanitizeIdentifier(schema.name);
    this.logger.info(`Creating table: ${tableName}`);

    const columns: string[] = [];
    
    // Always add an ID column as primary key
    columns.push('id SERIAL PRIMARY KEY');

    // Add MongoDB _id as a separate column
    columns.push('mongo_id TEXT UNIQUE');

    for (const field of schema.fields) {
      if (field.name === '_id') continue; // Skip _id as we handle it separately
      
      const columnName = sanitizeIdentifier(field.name.replace(/\./g, '_'));
      const columnType = mapMongoTypeToPostgres(field.type, field.isArray);
      const nullable = field.isRequired ? 'NOT NULL' : 'NULL';
      
      columns.push(`${columnName} ${columnType} ${nullable}`);
    }

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columns.join(',\n        ')}
      )
    `;

    await this.client.query(createTableQuery);
    this.logger.info(`Table ${tableName} created successfully`);
  }

  async insertDocuments(tableName: string, documents: unknown[]): Promise<void> {
    if (!this.client || documents.length === 0) {
      return;
    }

    const sanitizedTableName = sanitizeIdentifier(tableName);
    
    // Get table schema to know which columns exist
    const tableSchema = await this.getTableSchema(sanitizedTableName);
    if (!tableSchema) {
      throw new Error(`Table ${sanitizedTableName} does not exist`);
    }

    const columnNames = tableSchema.columns
      .map(col => col.name)
      .filter(name => name !== 'id'); // Exclude auto-generated ID

    for (const doc of documents) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      
      for (let i = 0; i < columnNames.length; i++) {
        const columnName = columnNames[i];
        let value: unknown;

        if (columnName === 'mongo_id') {
          value = (doc as any)?._id?.toString() || null;
        } else {
          // Map column name back to document field
          const fieldName = columnName.replace(/_/g, '.');
          value = this.getNestedValue(doc, fieldName);
          
          // Convert complex objects to JSON
          if (value && typeof value === 'object' && !(value instanceof Date)) {
            value = JSON.stringify(value);
          }
        }

        values.push(value);
        placeholders.push(`$${i + 1}`);
      }

      const insertQuery = `
        INSERT INTO ${sanitizedTableName} (${columnNames.join(', ')})
        VALUES (${placeholders.join(', ')})
        ${columnNames.includes('mongo_id') ? 'ON CONFLICT (mongo_id) DO NOTHING' : ''}
      `;

      try {
        await this.client.query(insertQuery, values);
      } catch (error) {
        this.logger.error(`Failed to insert document into ${sanitizedTableName}:`, error);
        throw error;
      }
    }
  }

  /**
   * Insert documents with custom column mapping for pre-existing tables
   */
  async insertDocumentsWithMapping(
    tableName: string, 
    documents: unknown[], 
    columnMappings: ColumnMapping[]
  ): Promise<void> {
    if (!this.client || documents.length === 0) {
      return;
    }

    const sanitizedTableName = sanitizeIdentifier(tableName);
    
    // Get table schema to verify columns exist
    const tableSchema = await this.getTableSchema(sanitizedTableName);
    if (!tableSchema) {
      throw new Error(`Table ${sanitizedTableName} does not exist`);
    }

    const existingColumns = new Set(tableSchema.columns.map(col => col.name));
    
    // Filter mappings to only include existing columns
    const validMappings = columnMappings.filter(mapping => 
      existingColumns.has(mapping.postgresColumn)
    );

    if (validMappings.length === 0) {
      this.logger.warn(`No valid column mappings found for table ${tableName}`);
      return;
    }

    for (const doc of documents) {
      const values: unknown[] = [];
      const columnNames: string[] = [];
      const placeholders: string[] = [];
      
      for (let i = 0; i < validMappings.length; i++) {
        const mapping = validMappings[i];
        let value: unknown;

        if (mapping.mongoField === '_id') {
          value = (doc as any)?._id?.toString() || null;
        } else {
          value = this.getNestedValue(doc, mapping.mongoField);
          
          // Convert complex objects to JSON
          if (value && typeof value === 'object' && !(value instanceof Date)) {
            value = JSON.stringify(value);
          }
        }

        values.push(value);
        columnNames.push(mapping.postgresColumn);
        placeholders.push(`$${i + 1}`);
      }

      if (columnNames.length === 0) continue;

      // Find a unique constraint for conflict resolution
      const uniqueColumn = tableSchema.columns.find(col => col.unique || col.primaryKey);
      const conflictResolution = uniqueColumn ? 
        `ON CONFLICT (${uniqueColumn.name}) DO NOTHING` : '';

      const insertQuery = `
        INSERT INTO ${sanitizedTableName} (${columnNames.join(', ')})
        VALUES (${placeholders.join(', ')})
        ${conflictResolution}
      `;

      try {
        await this.client.query(insertQuery, values);
      } catch (error) {
        this.logger.error(`Failed to insert document into ${sanitizedTableName}:`, error);
        throw error;
      }
    }
  }

  async executeDDL(ddlPath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected to PostgreSQL');
    }

    try {
      const ddlContent = await fs.readFile(ddlPath, 'utf-8');
      this.logger.info(`Executing DDL script: ${ddlPath}`);
      
      // Split by semicolon and execute each statement
      const statements = ddlContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        await this.client.query(statement);
      }

      this.logger.info('DDL script executed successfully');
    } catch (error) {
      this.logger.error('Failed to execute DDL script:', error);
      throw error;
    }
  }

  private mapPostgresTypeToStandard(pgType: string): any {
    switch (pgType.toLowerCase()) {
      case 'text':
      case 'varchar':
      case 'character varying':
        return 'TEXT';
      case 'integer':
      case 'int4':
        return 'INTEGER';
      case 'bigint':
      case 'int8':
        return 'BIGINT';
      case 'numeric':
      case 'decimal':
        return 'DECIMAL';
      case 'boolean':
      case 'bool':
        return 'BOOLEAN';
      case 'timestamp':
      case 'timestamptz':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'uuid':
        return 'UUID';
      case 'jsonb':
        return 'JSONB';
      case 'bytea':
        return 'BYTEA';
      default:
        return 'TEXT';
    }
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return null;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as any)[key];
      } else {
        return null;
      }
    }

    return current;
  }
}