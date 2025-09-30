import { mapMongoTypeToPostgres, sanitizeIdentifier, inferTypeFromValue } from '../utils';

describe('Utility Functions', () => {
  describe('mapMongoTypeToPostgres', () => {
    it('should map string to TEXT', () => {
      expect(mapMongoTypeToPostgres('string')).toBe('TEXT');
    });

    it('should map number to DECIMAL', () => {
      expect(mapMongoTypeToPostgres('number')).toBe('DECIMAL');
    });

    it('should map boolean to BOOLEAN', () => {
      expect(mapMongoTypeToPostgres('boolean')).toBe('BOOLEAN');
    });

    it('should map date to TIMESTAMP', () => {
      expect(mapMongoTypeToPostgres('date')).toBe('TIMESTAMP');
    });

    it('should map objectId to UUID', () => {
      expect(mapMongoTypeToPostgres('objectId')).toBe('UUID');
    });

    it('should map object to JSONB', () => {
      expect(mapMongoTypeToPostgres('object')).toBe('JSONB');
    });

    it('should map array to JSONB when isArray is true', () => {
      expect(mapMongoTypeToPostgres('string', true)).toBe('JSONB');
    });

    it('should map binary to BYTEA', () => {
      expect(mapMongoTypeToPostgres('binary')).toBe('BYTEA');
    });

    it('should default to TEXT for unknown types', () => {
      expect(mapMongoTypeToPostgres('null')).toBe('TEXT');
    });
  });

  describe('sanitizeIdentifier', () => {
    it('should replace invalid characters with underscores', () => {
      expect(sanitizeIdentifier('user-name')).toBe('user_name');
      expect(sanitizeIdentifier('user@domain')).toBe('user_domain');
      expect(sanitizeIdentifier('user name')).toBe('user_name');
    });

    it('should handle names starting with numbers', () => {
      expect(sanitizeIdentifier('123table')).toBe('_123table');
    });

    it('should convert to lowercase', () => {
      expect(sanitizeIdentifier('UserName')).toBe('username');
    });

    it('should handle multiple invalid characters', () => {
      expect(sanitizeIdentifier('user-name@domain.com')).toBe('user_name_domain_com');
    });
  });

  describe('inferTypeFromValue', () => {
    it('should infer string type', () => {
      expect(inferTypeFromValue('hello')).toBe('string');
    });

    it('should infer number type', () => {
      expect(inferTypeFromValue(42)).toBe('number');
      expect(inferTypeFromValue(3.14)).toBe('number');
    });

    it('should infer boolean type', () => {
      expect(inferTypeFromValue(true)).toBe('boolean');
      expect(inferTypeFromValue(false)).toBe('boolean');
    });

    it('should infer date type', () => {
      expect(inferTypeFromValue(new Date())).toBe('date');
    });

    it('should infer array type', () => {
      expect(inferTypeFromValue([1, 2, 3])).toBe('array');
      expect(inferTypeFromValue([])).toBe('array');
    });

    it('should infer object type', () => {
      expect(inferTypeFromValue({ key: 'value' })).toBe('object');
    });

    it('should infer null type', () => {
      expect(inferTypeFromValue(null)).toBe('null');
      expect(inferTypeFromValue(undefined)).toBe('null');
    });

    it('should default to string for unknown types', () => {
      expect(inferTypeFromValue(Symbol('test'))).toBe('string');
    });
  });
});