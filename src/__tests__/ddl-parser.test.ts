import { DDLParser } from '../utils/ddl-parser';
import { Logger } from '../utils';
import { TableRelationship } from '../types';

describe('DDLParser', () => {
  let parser: DDLParser;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('warn'); // Reduce noise in tests
    parser = new DDLParser(logger);
  });

  describe('parseRelationships', () => {
    it('should parse FOREIGN KEY constraints', () => {
      const ddl = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author_id INTEGER,
          FOREIGN KEY (author_id) REFERENCES users(id)
        );
      `;

      const relationships = parser.parseRelationships(ddl);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toEqual({
        tableName: 'posts',
        referencedTable: 'users',
        columnName: 'author_id',
        referencedColumn: 'id'
      });
    });

    it('should parse inline REFERENCES constraints', () => {
      const ddl = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author_id INTEGER REFERENCES users(id)
        );
      `;

      const relationships = parser.parseRelationships(ddl);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toEqual({
        tableName: 'posts',
        referencedTable: 'users',
        columnName: 'author_id',
        referencedColumn: 'id'
      });
    });

    it('should handle multiple foreign keys', () => {
      const ddl = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author_id INTEGER REFERENCES users(id),
          category_id INTEGER REFERENCES categories(id)
        );
      `;

      const relationships = parser.parseRelationships(ddl);

      expect(relationships).toHaveLength(2);
      expect(relationships.find(r => r.referencedTable === 'users')).toBeDefined();
      expect(relationships.find(r => r.referencedTable === 'categories')).toBeDefined();
    });

    it('should ignore comments in DDL', () => {
      const ddl = `
        -- Create users table
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        /* Create posts table
           with foreign key */
        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          author_id INTEGER REFERENCES users(id) -- Reference to users
        );
      `;

      const relationships = parser.parseRelationships(ddl);

      expect(relationships).toHaveLength(1);
      expect(relationships[0].tableName).toBe('posts');
    });
  });

  describe('getInsertionOrder', () => {
    it('should return tables in dependency order', () => {
      const tables = ['posts', 'users', 'comments'];
      const relationships = [
        { tableName: 'posts', referencedTable: 'users', columnName: 'author_id', referencedColumn: 'id' },
        { tableName: 'comments', referencedTable: 'posts', columnName: 'post_id', referencedColumn: 'id' },
        { tableName: 'comments', referencedTable: 'users', columnName: 'user_id', referencedColumn: 'id' }
      ];

      const order = parser.getInsertionOrder(tables, relationships);

      expect(order.indexOf('users')).toBeLessThan(order.indexOf('posts'));
      expect(order.indexOf('posts')).toBeLessThan(order.indexOf('comments'));
      expect(order.indexOf('users')).toBeLessThan(order.indexOf('comments'));
    });

    it('should handle tables with no dependencies', () => {
      const tables = ['users', 'categories', 'settings'];
      const relationships: TableRelationship[] = [];

      const order = parser.getInsertionOrder(tables, relationships);

      expect(order).toHaveLength(3);
      expect(order).toEqual(expect.arrayContaining(tables));
    });

    it('should handle circular dependencies gracefully', () => {
      const tables = ['table_a', 'table_b'];
      const relationships = [
        { tableName: 'table_a', referencedTable: 'table_b', columnName: 'b_id', referencedColumn: 'id' },
        { tableName: 'table_b', referencedTable: 'table_a', columnName: 'a_id', referencedColumn: 'id' }
      ];

      const order = parser.getInsertionOrder(tables, relationships);

      expect(order).toHaveLength(2);
      expect(order).toEqual(expect.arrayContaining(tables));
    });
  });
});