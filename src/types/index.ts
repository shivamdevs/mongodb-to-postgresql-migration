export interface MigrationConfig {
  mongoUrl: string;
  postgresUrl: string;
  mode: 'auto-tables' | 'pre-existing';
  openAiApiKey?: string;
  postgresDDL?: string;
  batchSize?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface CollectionSchema {
  name: string;
  fields: FieldSchema[];
  indexes?: IndexSchema[];
}

export interface FieldSchema {
  name: string;
  type: MongoFieldType;
  isRequired: boolean;
  isArray: boolean;
  nestedFields?: FieldSchema[];
}

export interface IndexSchema {
  fields: string[];
  unique: boolean;
  name?: string;
}

export type MongoFieldType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'objectId' 
  | 'object' 
  | 'array' 
  | 'null' 
  | 'binary';

export interface PostgresTableSchema {
  name: string;
  columns: ColumnSchema[];
  constraints?: ConstraintSchema[];
}

export interface ColumnSchema {
  name: string;
  type: PostgresColumnType;
  nullable: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface ConstraintSchema {
  name: string;
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
  columns: string[];
  references?: {
    table: string;
    columns: string[];
  };
}

export type PostgresColumnType = 
  | 'TEXT' 
  | 'VARCHAR' 
  | 'INTEGER' 
  | 'BIGINT' 
  | 'DECIMAL' 
  | 'BOOLEAN' 
  | 'TIMESTAMP' 
  | 'DATE' 
  | 'UUID' 
  | 'JSONB' 
  | 'BYTEA';

export interface MigrationResult {
  success: boolean;
  migratedCollections: string[];
  errors: string[];
  totalDocuments: number;
  migrationTime: number;
}

export interface TableRelationship {
  tableName: string;
  referencedTable: string;
  columnName: string;
  referencedColumn: string;
}

export interface ColumnMapping {
  mongoField: string;
  postgresColumn: string;
  transformation?: string;
}