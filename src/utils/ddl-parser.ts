import { TableRelationship } from '../types';
import { Logger } from './index';

export class DDLParser {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Parse DDL script to extract table relationships
   */
  parseRelationships(ddlContent: string): TableRelationship[] {
    const relationships: TableRelationship[] = [];
    
    try {
      // Remove comments and normalize whitespace
      const cleanedDDL = ddlContent
        .replace(/--.*$/gm, '') // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .replace(/\s+/g, ' ')
        .trim();

      // Find FOREIGN KEY constraints
      const foreignKeyRegex = /FOREIGN\s+KEY\s*\(\s*([^)]+)\s*\)\s+REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/gi;
      let match;

      while ((match = foreignKeyRegex.exec(cleanedDDL)) !== null) {
        const columnName = match[1].trim().replace(/["`]/g, '');
        const referencedTable = match[2].trim().replace(/["`]/g, '');
        const referencedColumn = match[3].trim().replace(/["`]/g, '');

        // Find the table name this constraint belongs to
        const tableName = this.findTableNameForConstraint(cleanedDDL, match.index);
        
        if (tableName) {
          relationships.push({
            tableName,
            referencedTable,
            columnName,
            referencedColumn
          });
        }
      }

      // Find inline REFERENCES constraints
      const inlineReferencesRegex = /(\w+)\s+[^,)]*REFERENCES\s+([^\s(]+)\s*\(\s*([^)]+)\s*\)/gi;
      
      while ((match = inlineReferencesRegex.exec(cleanedDDL)) !== null) {
        const columnName = match[1].trim();
        const referencedTable = match[2].trim().replace(/["`]/g, '');
        const referencedColumn = match[3].trim().replace(/["`]/g, '');

        const tableName = this.findTableNameForConstraint(cleanedDDL, match.index);
        
        if (tableName) {
          relationships.push({
            tableName,
            referencedTable,
            columnName,
            referencedColumn
          });
        }
      }

      this.logger.info(`Parsed ${relationships.length} table relationships from DDL`);
      relationships.forEach(rel => {
        this.logger.debug(`Relationship: ${rel.tableName}.${rel.columnName} -> ${rel.referencedTable}.${rel.referencedColumn}`);
      });

    } catch (error) {
      this.logger.error('Failed to parse DDL relationships:', error);
    }

    return relationships;
  }

  /**
   * Find the table name that a constraint belongs to by looking backwards in the DDL
   */
  private findTableNameForConstraint(ddlContent: string, constraintIndex: number): string | null {
    const beforeConstraint = ddlContent.substring(0, constraintIndex);
    
    // Look for the last CREATE TABLE statement before this constraint
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/gi;
    let match;
    let lastTableName = null;

    while ((match = createTableRegex.exec(beforeConstraint)) !== null) {
      lastTableName = match[1].trim().replace(/["`]/g, '');
    }

    return lastTableName;
  }

  /**
   * Create a topological sort order for tables based on their dependencies
   */
  getInsertionOrder(tables: string[], relationships: TableRelationship[]): string[] {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Initialize graph
    tables.forEach(table => {
      graph.set(table, new Set());
      inDegree.set(table, 0);
    });

    // Build dependency graph
    relationships.forEach(rel => {
      if (graph.has(rel.tableName) && graph.has(rel.referencedTable)) {
        // rel.tableName depends on rel.referencedTable
        graph.get(rel.referencedTable)!.add(rel.tableName);
        inDegree.set(rel.tableName, (inDegree.get(rel.tableName) || 0) + 1);
      }
    });

    // Topological sort using Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    // Find all tables with no dependencies
    inDegree.forEach((degree, table) => {
      if (degree === 0) {
        queue.push(table);
      }
    });

    while (queue.length > 0) {
      const table = queue.shift()!;
      result.push(table);

      // Remove this table from graph and decrease in-degree of dependent tables
      graph.get(table)!.forEach(dependentTable => {
        inDegree.set(dependentTable, inDegree.get(dependentTable)! - 1);
        if (inDegree.get(dependentTable) === 0) {
          queue.push(dependentTable);
        }
      });
    }

    // Check for circular dependencies
    if (result.length !== tables.length) {
      this.logger.warn('Circular dependencies detected in table relationships');
      // Return tables that could be sorted + remaining tables
      const remaining = tables.filter(table => !result.includes(table));
      result.push(...remaining);
    }

    this.logger.info(`Table insertion order: ${result.join(' -> ')}`);
    return result;
  }
}