# MongoDB → PostgreSQL Migration Package: Fix Instructions

This document outlines the fixes and improvements to be implemented in the `mongodb-to-postgresql-migration` package.

---

## 1. Pre-existing Tables Mode

-   If `postgresDDL` (e.g., `'./schemas/complete-schema.sql'`) is provided **but the mode is `pre-existing`**, do **not create tables**.
-   Only perform data insertion and column mapping.
-   Skip table creation for pre-existing tables.

---

## 2. Schema Inference with AI

-   Fetch **a single document** from each MongoDB collection.
    -   If the collection is empty, skip it.
-   Fetch the corresponding PostgreSQL table schema using the `pg` package.
-   Pass both the MongoDB document and PostgreSQL schema to OpenAI for **column mapping interpretation**.

---

## 3. Relations from DDL Script

-   If a `schema.sql` file is provided, parse it to **identify table relationships**.
-   This helps determine **insert order** for dependent tables.

---

## 4. Dependency-Aware Insertion Loop

1. **First pass:** Insert rows for tables **without any relations**.
2. **Subsequent passes:** Insert rows for tables with dependencies.
    - Ensure that if Table A depends on Table B, and Table B depends on Table C, the insertion order respects this hierarchy.
3. Repeat until all tables are populated.

---

## 5. Node / ES Module Fix

-   Add `"type": "module"` to `package.json` to remove the following warning:

```

\[MODULE\_TYPELESS\_PACKAGE\_JSON] Warning: Module type of file ... is not specified and it doesn't parse as CommonJS.

```

---

## 6. Fix `mongo_id` Column Error

-   For pre-existing tables, do **not assume `mongo_id` exists**.
-   Use OpenAI mapping or the DDL schema to identify the correct target column for the MongoDB `_id`.
-   Ensure column mapping is validated before inserting documents.

---

## Notes

-   The migration should now correctly handle:

    -   Pre-existing tables
    -   Auto-generated tables
    -   Table dependencies
    -   Schema mismatches

-   These changes will make the package more robust, prevent insertion errors, and maintain relational integrity during migration.
