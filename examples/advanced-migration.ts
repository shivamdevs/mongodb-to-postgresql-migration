import { migrate } from '../src/index';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function advancedMigration() {
  console.log('Starting advanced migration with AI assistance...');
  
  try {
    const result = await migrate({
      mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/ecommerce',
      postgresUrl: process.env.POSTGRES_URL || 'postgresql://postgres:password@localhost:5432/ecommerce',
      mode: 'auto-tables',
      openAiApiKey: process.env.OPENAI_API_KEY, // AI-assisted migration
      postgresDDL: './schema.sql', // Custom schema
      batchSize: 2000,
      logLevel: 'debug'
    });

    if (result.success) {
      console.log('🎉 Advanced migration completed successfully!');
      console.log(`📊 Total documents migrated: ${result.totalDocuments}`);
      console.log(`📁 Collections migrated: ${result.migratedCollections.join(', ')}`);
      console.log(`⏱️  Migration time: ${(result.migrationTime / 1000).toFixed(2)}s`);
      
      // Log performance metrics
      const docsPerSecond = Math.round(result.totalDocuments / (result.migrationTime / 1000));
      console.log(`🚀 Performance: ${docsPerSecond} documents/second`);
    } else {
      console.log('❌ Advanced migration failed with errors:');
      result.errors.forEach((error, index) => {
        console.error(`  ${index + 1}. ${error}`);
      });
    }
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Run the migration
advancedMigration();