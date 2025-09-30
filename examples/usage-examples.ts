import { migrate } from '../index';

/**
 * Example demonstrating all the fixes implemented for MongoDB to PostgreSQL migration
 */

// Example 1: Auto-tables mode with DDL and dependency-aware insertion
export async function exampleAutoTablesWithDDL() {
  try {
    const result = await migrate({
      mongoUrl: 'mongodb://localhost:27017/ecommerce',
      postgresUrl: 'postgresql://postgres:password@localhost:5432/ecommerce',
      mode: 'auto-tables',
      postgresDDL: './examples/ecommerce-schema.sql', // DDL executed and parsed for relationships
      openAiApiKey: process.env.OPENAI_API_KEY,
      batchSize: 1000,
      logLevel: 'info'
    });

    console.log('Auto-tables migration completed!');
    console.log(`Migrated collections: ${result.migratedCollections.join(', ')}`);
    console.log(`Total documents: ${result.totalDocuments}`);
    console.log(`Migration time: ${result.migrationTime}ms`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Example 2: Pre-existing tables mode with AI-assisted column mapping
export async function examplePreExistingTablesWithAI() {
  try {
    const result = await migrate({
      mongoUrl: 'mongodb://localhost:27017/blog',
      postgresUrl: 'postgresql://postgres:password@localhost:5432/blog',
      mode: 'pre-existing', // Tables already exist
      postgresDDL: './examples/blog-schema.sql', // DDL parsed for relationships but NOT executed
      openAiApiKey: process.env.OPENAI_API_KEY, // AI helps map MongoDB fields to PostgreSQL columns
      batchSize: 500,
      logLevel: 'debug'
    });

    console.log('Pre-existing tables migration completed!');
    console.log(`Migrated collections: ${result.migratedCollections.join(', ')}`);
    console.log(`Total documents: ${result.totalDocuments}`);
    console.log(`Migration time: ${result.migrationTime}ms`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Example 3: Migration without DDL (basic mode)
export async function exampleBasicMigration() {
  try {
    const result = await migrate({
      mongoUrl: 'mongodb://localhost:27017/simple',
      postgresUrl: 'postgresql://postgres:password@localhost:5432/simple',
      mode: 'auto-tables',
      batchSize: 2000,
      logLevel: 'info'
    });

    console.log('Basic migration completed!');
    console.log(`Migrated collections: ${result.migratedCollections.join(', ')}`);
    console.log(`Total documents: ${result.totalDocuments}`);
    console.log(`Migration time: ${result.migrationTime}ms`);
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Example DDL schema that demonstrates relationships
export const exampleDDLSchema = `
-- Users table (no dependencies)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table (no dependencies) 
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table (depends on categories)
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table (depends on users)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  total_amount DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items table (depends on both orders and products)
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
`;

/**
 * This schema demonstrates:
 * 1. Proper dependency chain: categories -> products -> order_items
 *                           users -> orders -> order_items  
 * 2. Multiple foreign key relationships
 * 3. Performance indexes
 * 4. Default values and constraints
 * 
 * The migration engine will:
 * - Parse these relationships from DDL
 * - Create proper insertion order: [users, categories] -> [products, orders] -> [order_items]
 * - Handle the complex dependencies automatically
 */

// Example of how column mapping works in pre-existing mode
export const columnMappingExample = {
  mongoDocument: {
    _id: "507f1f77bcf86cd799439011",
    username: "johndoe",
    email: "john@example.com", 
    profile: {
      fullName: "John Doe",
      age: 30
    },
    createdAt: "2023-01-15T10:30:00Z"
  },
  
  postgresSchema: {
    tableName: "users",
    columns: [
      { name: "id", type: "SERIAL", primaryKey: true },
      { name: "user_id", type: "TEXT", unique: true }, // Maps to MongoDB _id
      { name: "username", type: "VARCHAR", nullable: false },
      { name: "email", type: "VARCHAR", nullable: false },
      { name: "full_name", type: "TEXT", nullable: true }, // Maps to profile.fullName
      { name: "user_age", type: "INTEGER", nullable: true }, // Maps to profile.age
      { name: "registration_date", type: "TIMESTAMP", nullable: true } // Maps to createdAt
    ]
  },
  
  aiSuggestedMapping: [
    { mongoField: "_id", postgresColumn: "user_id" },
    { mongoField: "username", postgresColumn: "username" },
    { mongoField: "email", postgresColumn: "email" },
    { mongoField: "profile.fullName", postgresColumn: "full_name" },
    { mongoField: "profile.age", postgresColumn: "user_age" },
    { mongoField: "createdAt", postgresColumn: "registration_date" }
  ]
};

console.log('MongoDB to PostgreSQL Migration Examples Loaded');
console.log('Key features implemented:');
console.log('✅ ES Module support (no more warnings)');
console.log('✅ Pre-existing tables mode (DDL parsed but not executed)');
console.log('✅ AI-assisted column mapping for schema mismatches');
console.log('✅ DDL relationship parsing and dependency analysis');
console.log('✅ Dependency-aware insertion with topological sorting');
console.log('✅ Flexible mongo_id column handling');
console.log('✅ Enhanced error handling and logging');