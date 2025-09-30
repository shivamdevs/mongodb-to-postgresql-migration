import { migrate } from '../src/index';

async function basicMigration() {
  console.log('Starting basic migration...');
  
  try {
    const result = await migrate({
      mongoUrl: 'mongodb://localhost:27017/sample_app',
      postgresUrl: 'postgresql://postgres:password@localhost:5432/sample_app',
      mode: 'auto-tables',
      batchSize: 1000,
      logLevel: 'info'
    });

    if (result.success) {
      console.log('✅ Migration completed successfully!');
      console.log(`📊 Total documents migrated: ${result.totalDocuments}`);
      console.log(`📁 Collections migrated: ${result.migratedCollections.join(', ')}`);
      console.log(`⏱️  Migration time: ${result.migrationTime}ms`);
    } else {
      console.log('❌ Migration failed with errors:');
      result.errors.forEach(error => console.error(`  - ${error}`));
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Run the migration
basicMigration();