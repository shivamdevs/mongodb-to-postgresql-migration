# mongodb-to-postgresql-migration

A simple and intelligent npm package to migrate data from **MongoDB** (NoSQL) to **PostgreSQL** (SQL) with minimal effort from the developer. This package automatically maps MongoDB schemas to PostgreSQL tables, migrates the data, and preserves relationships between tables wherever possible.

**Note:** This package is intended to copy a database from one place to another as a **1-to-1 clone**.

---

## Features

-   Written in **TypeScript** for type safety and better developer experience.
-   Automatically detects MongoDB schema and maps it to PostgreSQL tables.
-   Supports two migration modes:
    1. **Pre-existing tables:** Migrate data between MongoDB and PostgreSQL even if column names or structures differ.
    2. **Auto-generated tables:** Create PostgreSQL tables from MongoDB documents with one-to-one mapping.
-   Optional **AI-assisted migration** using OpenAI to interpret complex data structures.
-   Supports importing PostgreSQL **DDL scripts** (can contain multiple tables, schemas, views, constraints, and other logic) to preserve table relationships if they cannot be inferred automatically.

---

## Installation

```bash
npm install mongodb-to-postgresql-migration
```

---

## Usage

```ts
import { migrate } from "mongodb-to-postgresql-migration";

const mongoUrl = "mongodb://username:password@host:port/db";
const postgresUrl = "postgresql://username:password@host:port/db";

await migrate({
	mongoUrl,
	postgresUrl,
	mode: "auto-tables", // or 'pre-existing'
	openAiApiKey: process.env.OPENAI_API_KEY, // optional
	postgresDDL: "./ddl.sql", // optional, can include multiple tables, views, constraints, etc.
});

console.log("Migration completed successfully!");
```

---

## Configuration Options

The `migrate` function accepts a configuration object with the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `mongoUrl` | `string` | Yes | MongoDB connection string |
| `postgresUrl` | `string` | Yes | PostgreSQL connection string |
| `mode` | `'auto-tables' \| 'pre-existing'` | Yes | Migration mode |
| `openAiApiKey` | `string` | No | OpenAI API key for AI-assisted migration |
| `postgresDDL` | `string` | No | Path to PostgreSQL DDL script file |
| `batchSize` | `number` | No | Number of documents to process in each batch (default: 1000) |
| `logLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` | No | Logging level (default: 'info') |

---

## Migration Modes

### 1. Auto-generated tables (`auto-tables`)

Use this mode if you only have MongoDB documents and want PostgreSQL tables to be created automatically. The package will:

- Analyze MongoDB collection schemas by sampling documents
- Generate appropriate PostgreSQL table structures
- Create tables with proper column types
- Migrate all data with automatic type conversion

```ts
await migrate({
  mongoUrl: "mongodb://localhost:27017/myapp",
  postgresUrl: "postgresql://user:pass@localhost:5432/myapp",
  mode: "auto-tables"
});
```

### 2. Pre-existing tables (`pre-existing`)

Use this mode if your PostgreSQL tables already exist. The package will:

- Map MongoDB collections to existing PostgreSQL tables
- Handle differences in column names and structures
- Migrate data while preserving existing table schema

```ts
await migrate({
  mongoUrl: "mongodb://localhost:27017/myapp",
  postgresUrl: "postgresql://user:pass@localhost:5432/myapp",
  mode: "pre-existing"
});
```

---

## Advanced Features

### AI-Assisted Migration

By providing an OpenAI API key, the package can use artificial intelligence to:

- Interpret complex MongoDB schema structures
- Suggest optimal PostgreSQL table designs
- Identify relationships between collections
- Provide recommendations for data transformation

```ts
await migrate({
  mongoUrl: "mongodb://localhost:27017/myapp",
  postgresUrl: "postgresql://user:pass@localhost:5432/myapp",
  mode: "auto-tables",
  openAiApiKey: process.env.OPENAI_API_KEY
});
```

### PostgreSQL DDL Scripts

You can provide a DDL script to define custom table structures, relationships, and constraints:

```ts
await migrate({
  mongoUrl: "mongodb://localhost:27017/myapp",
  postgresUrl: "postgresql://user:pass@localhost:5432/myapp",
  mode: "auto-tables",
  postgresDDL: "./database-schema.sql"
});
```

Example DDL script:
```sql
-- Create users table with constraints
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create posts table with foreign key
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  mongo_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  author_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_users_email ON users(email);
```

---

## Data Type Mapping

The package automatically maps MongoDB data types to appropriate PostgreSQL types:

| MongoDB Type | PostgreSQL Type | Notes |
|--------------|-----------------|-------|
| `string` | `TEXT` | Variable length text |
| `number` | `DECIMAL` | Supports integers and decimals |
| `boolean` | `BOOLEAN` | True/false values |
| `date` | `TIMESTAMP` | Date and time |
| `ObjectId` | `UUID` | Unique identifiers |
| `object` | `JSONB` | JSON documents with indexing |
| `array` | `JSONB` | Arrays stored as JSON |
| `binary` | `BYTEA` | Binary data |

---

## Error Handling

The migration function returns a detailed result object:

```ts
interface MigrationResult {
  success: boolean;
  migratedCollections: string[];
  errors: string[];
  totalDocuments: number;
  migrationTime: number; // in milliseconds
}

const result = await migrate(config);

if (result.success) {
  console.log(`Successfully migrated ${result.totalDocuments} documents`);
  console.log(`Collections: ${result.migratedCollections.join(', ')}`);
} else {
  console.error('Migration failed with errors:');
  result.errors.forEach(error => console.error(error));
}
```

---

## Performance Considerations

- **Batch Processing**: Documents are processed in configurable batches (default: 1000) to manage memory usage
- **Indexing**: The package preserves MongoDB indexes where possible
- **Connection Pooling**: Efficient database connection management
- **Error Recovery**: Continues migration even if individual documents fail

---

## Examples

### Basic Migration
```ts
import { migrate } from 'mongodb-to-postgresql-migration';

const result = await migrate({
  mongoUrl: 'mongodb://localhost:27017/ecommerce',
  postgresUrl: 'postgresql://postgres:password@localhost:5432/ecommerce',
  mode: 'auto-tables',
  batchSize: 500,
  logLevel: 'debug'
});

console.log(`Migration completed in ${result.migrationTime}ms`);
```

### Migration with AI and Custom Schema
```ts
import { migrate } from 'mongodb-to-postgresql-migration';

const result = await migrate({
  mongoUrl: 'mongodb://localhost:27017/complex-app',
  postgresUrl: 'postgresql://postgres:password@localhost:5432/complex-app',
  mode: 'auto-tables',
  openAiApiKey: process.env.OPENAI_API_KEY,
  postgresDDL: './schemas/complete-schema.sql',
  batchSize: 2000,
  logLevel: 'info'
});

if (result.success) {
  console.log('✅ Migration successful!');
  console.log(`📊 Migrated ${result.totalDocuments} documents`);
  console.log(`📁 Collections: ${result.migratedCollections.join(', ')}`);
} else {
  console.log('❌ Migration failed');
  result.errors.forEach(error => console.error(error));
}
```

---

## Requirements

- Node.js 14.0.0 or higher
- MongoDB 3.6 or higher
- PostgreSQL 10 or higher
- TypeScript 4.0 or higher (for TypeScript projects)

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## License

MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

If you encounter any issues or have questions, please file an issue on the [GitHub repository](https://github.com/shivamdevs/mongodb-to-postgresql-migration/issues).
