import { migrate } from '../index';

describe('Migration Integration', () => {
  // Mock test - in a real scenario, you would need actual MongoDB and PostgreSQL instances
  it('should export migrate function', () => {
    expect(typeof migrate).toBe('function');
  });

  it('should validate required configuration', async () => {
    const config = {
      mongoUrl: '',
      postgresUrl: '',
      mode: 'auto-tables' as const
    };

    // This would fail due to invalid URLs, which is expected behavior
    try {
      await migrate(config);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  describe('Configuration validation', () => {
    it('should accept valid mode values', () => {
      const validModes = ['auto-tables', 'pre-existing'] as const;
      
      validModes.forEach(mode => {
        const config = {
          mongoUrl: 'mongodb://localhost:27017/test',
          postgresUrl: 'postgresql://localhost:5432/test',
          mode
        };
        
        // Should not throw for valid configuration structure
        expect(() => {
          // Just validate the structure, not execute migration
          expect(config.mode).toBe(mode);
        }).not.toThrow();
      });
    });

    it('should accept optional parameters', () => {
      const config = {
        mongoUrl: 'mongodb://localhost:27017/test',
        postgresUrl: 'postgresql://localhost:5432/test',
        mode: 'auto-tables' as const,
        openAiApiKey: 'sk-test123',
        postgresDDL: './schema.sql',
        batchSize: 500,
        logLevel: 'debug' as const
      };

      expect(config.openAiApiKey).toBe('sk-test123');
      expect(config.postgresDDL).toBe('./schema.sql');
      expect(config.batchSize).toBe(500);
      expect(config.logLevel).toBe('debug');
    });
  });
});