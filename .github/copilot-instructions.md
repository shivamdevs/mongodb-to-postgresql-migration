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

## Modes

1. **Pre-existing tables**
   Use this mode if your MongoDB and PostgreSQL tables already exist. The package will handle differences in column names and structures while migrating data.

2. **Auto-generated tables**
   Use this mode if you only have MongoDB documents and want PostgreSQL tables to be created automatically. The package will generate tables and map data one-to-one.

---

## Optional Features

-   **AI-assisted migration**:
    By providing an `OPENAI_API_KEY`, AI can assist in interpreting MongoDB schemas and relationships for smoother migration.

-   **PostgreSQL DDL script**:
    Pass a DDL script to help the package understand table relationships that cannot be inferred automatically. The script can include multiple tables, schemas, views, constraints, and other PostgreSQL logic.

---

## License

MIT
