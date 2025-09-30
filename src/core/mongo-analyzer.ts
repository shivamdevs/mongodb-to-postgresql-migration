import { MongoClient, Db } from 'mongodb';
import { CollectionSchema, FieldSchema } from '../types';
import { Logger, inferTypeFromValue } from '../utils';

export class MongoAnalyzer {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async connect(mongoUrl: string): Promise<void> {
    try {
      this.client = new MongoClient(mongoUrl);
      await this.client.connect();
      const dbName = new URL(mongoUrl).pathname.slice(1);
      this.db = this.client.db(dbName);
      this.logger.info('Connected to MongoDB');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.logger.info('Disconnected from MongoDB');
    }
  }

  async getCollections(): Promise<string[]> {
    if (!this.db) {
      throw new Error('Not connected to MongoDB');
    }

    const collections = await this.db.listCollections().toArray();
    return collections.map(col => col.name);
  }

  async analyzeCollection(collectionName: string, sampleSize = 100): Promise<CollectionSchema> {
    if (!this.db) {
      throw new Error('Not connected to MongoDB');
    }

    this.logger.info(`Analyzing collection: ${collectionName}`);
    
    const collection = this.db.collection(collectionName);
    const documents = await collection.aggregate([
      { $sample: { size: sampleSize } }
    ]).toArray();

    if (documents.length === 0) {
      this.logger.warn(`Collection ${collectionName} is empty`);
      return {
        name: collectionName,
        fields: []
      };
    }

    const fieldMap = new Map<string, FieldSchema>();

    for (const doc of documents) {
      this.analyzeDocument(doc, fieldMap);
    }

    const fields = Array.from(fieldMap.values());
    
    // Get indexes
    const indexes = await collection.listIndexes().toArray();
    const indexSchemas = indexes
      .filter(idx => idx.name !== '_id_')
      .map(idx => ({
        fields: Object.keys(idx.key),
        unique: idx.unique || false,
        name: idx.name
      }));

    return {
      name: collectionName,
      fields,
      indexes: indexSchemas
    };
  }

  private analyzeDocument(doc: Record<string, unknown>, fieldMap: Map<string, FieldSchema>, prefix = ''): void {
    for (const [key, value] of Object.entries(doc)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      
      if (!fieldMap.has(fieldName)) {
        fieldMap.set(fieldName, {
          name: fieldName,
          type: inferTypeFromValue(value),
          isRequired: false,
          isArray: Array.isArray(value)
        });
      }

      const field = fieldMap.get(fieldName)!;
      
      // Update field based on current value
      if (value !== null && value !== undefined) {
        const currentType = inferTypeFromValue(value);
        if (field.type === 'null') {
          field.type = currentType;
        }
      }

      // Handle nested objects
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        this.analyzeDocument(value as Record<string, unknown>, fieldMap, fieldName);
      }

      // Handle arrays
      if (Array.isArray(value) && value.length > 0) {
        field.isArray = true;
        const firstItem = value[0];
        if (firstItem && typeof firstItem === 'object' && !(firstItem instanceof Date)) {
          this.analyzeDocument(firstItem as Record<string, unknown>, fieldMap, fieldName);
        }
      }
    }
  }

  async getDocumentCount(collectionName: string): Promise<number> {
    if (!this.db) {
      throw new Error('Not connected to MongoDB');
    }

    return await this.db.collection(collectionName).countDocuments();
  }

  async getDocuments(collectionName: string, skip = 0, limit = 1000): Promise<unknown[]> {
    if (!this.db) {
      throw new Error('Not connected to MongoDB');
    }

    return await this.db.collection(collectionName)
      .find({})
      .skip(skip)
      .limit(limit)
      .toArray();
  }
}