import { MongoFieldType, PostgresColumnType } from '../types';

export class Logger {
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = logLevel;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

export function mapMongoTypeToPostgres(mongoType: MongoFieldType, isArray = false): PostgresColumnType {
  const baseType = (() => {
    switch (mongoType) {
      case 'string':
        return 'TEXT';
      case 'number':
        return 'DECIMAL';
      case 'boolean':
        return 'BOOLEAN';
      case 'date':
        return 'TIMESTAMP';
      case 'objectId':
        return 'UUID';
      case 'object':
      case 'array':
        return 'JSONB';
      case 'binary':
        return 'BYTEA';
      case 'null':
      default:
        return 'TEXT';
    }
  })();

  return isArray ? 'JSONB' : baseType;
}

export function sanitizeIdentifier(name: string): string {
  // Replace invalid characters and ensure valid PostgreSQL identifier
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&')
    .toLowerCase();
}

export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

export function inferTypeFromValue(value: unknown): MongoFieldType {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (value instanceof Date) {
    return 'date';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object') {
    // Check if it's an ObjectId-like string
    if (value && typeof value === 'object' && 'toString' in value) {
      const str = value.toString();
      if (/^[a-fA-F0-9]{24}$/.test(str)) {
        return 'objectId';
      }
    }
    return 'object';
  }

  return 'string';
}

// Export DDLParser
export { DDLParser } from './ddl-parser';