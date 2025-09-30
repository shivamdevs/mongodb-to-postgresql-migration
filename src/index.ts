import { MigrationEngine } from './core/migration-engine';
import { MigrationConfig, MigrationResult } from './types';

/**
 * Migrate data from MongoDB to PostgreSQL
 * 
 * @param config Migration configuration
 * @returns Promise<MigrationResult> Migration result with status and statistics
 * 
 * @example
 * ```typescript
 * import { migrate } from 'mongodb-to-postgresql-migration';
 * 
 * const result = await migrate({
 *   mongoUrl: 'mongodb://localhost:27017/mydb',
 *   postgresUrl: 'postgresql://user:pass@localhost:5432/mydb',
 *   mode: 'auto-tables',
 *   openAiApiKey: process.env.OPENAI_API_KEY, // optional
 *   postgresDDL: './schema.sql', // optional
 *   batchSize: 1000,
 *   logLevel: 'info'
 * });
 * 
 * console.log(`Migration completed: ${result.success}`);
 * console.log(`Migrated collections: ${result.migratedCollections.join(', ')}`);
 * console.log(`Total documents: ${result.totalDocuments}`);
 * ```
 */
export async function migrate(config: MigrationConfig): Promise<MigrationResult> {
  const engine = new MigrationEngine(config);
  return await engine.migrate(config);
}

// Export types for TypeScript users
export * from './types';

// Export utility functions that might be useful
export { Logger, mapMongoTypeToPostgres, sanitizeIdentifier, DDLParser } from './utils';

// Export core classes for advanced usage
export { MongoAnalyzer } from './core/mongo-analyzer';
export { PostgresManager } from './core/postgres-manager';
export { AIAssistant } from './core/ai-assistant';
export { MigrationEngine } from './core/migration-engine';