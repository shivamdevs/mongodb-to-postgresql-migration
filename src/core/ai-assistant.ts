import OpenAI from 'openai';
import { CollectionSchema, PostgresTableSchema } from '../types';
import { Logger } from '../utils';

export class AIAssistant {
  private openai: OpenAI | null = null;
  private logger: Logger;

  constructor(apiKey: string | undefined, logger: Logger) {
    this.logger = logger;
    
    if (apiKey) {
      this.openai = new OpenAI({
        apiKey
      });
      this.logger.info('AI Assistant initialized with OpenAI');
    } else {
      this.logger.info('AI Assistant disabled - no API key provided');
    }
  }

  async interpretSchema(mongoSchema: CollectionSchema): Promise<PostgresTableSchema | null> {
    if (!this.openai) {
      return null;
    }

    try {
      this.logger.info(`Using AI to interpret schema for collection: ${mongoSchema.name}`);

      const prompt = `
        Analyze this MongoDB collection schema and suggest the best PostgreSQL table structure.
        
        Collection: ${mongoSchema.name}
        Fields: ${JSON.stringify(mongoSchema.fields, null, 2)}
        
        Please suggest:
        1. Appropriate PostgreSQL column types
        2. Which fields should be normalized into separate tables
        3. Foreign key relationships
        4. Indexes that should be created
        
        Respond in JSON format with the following structure:
        {
          "tableName": "suggested_table_name",
          "columns": [
            {
              "name": "column_name",
              "type": "POSTGRES_TYPE",
              "nullable": true/false,
              "primaryKey": true/false,
              "unique": true/false
            }
          ],
          "suggestions": {
            "normalizeFields": ["field1", "field2"],
            "indexes": ["field1", "field2"],
            "relationships": [
              {
                "field": "field_name",
                "referencesTable": "other_table",
                "referencesColumn": "id"
              }
            ]
          }
        }
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a database migration expert. Provide concise, practical suggestions for MongoDB to PostgreSQL schema mapping.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        this.logger.warn('No response from AI assistant');
        return null;
      }

      try {
        const suggestion = JSON.parse(content);
        this.logger.debug('AI suggestion received:', suggestion);
        
        return {
          name: suggestion.tableName || mongoSchema.name,
          columns: suggestion.columns || []
        };
      } catch (parseError) {
        this.logger.warn('Failed to parse AI response as JSON:', parseError);
        return null;
      }

    } catch (error) {
      this.logger.error('AI assistant error:', error);
      return null;
    }
  }

  async suggestDataTransformation(
    mongoData: unknown[], 
    targetSchema: PostgresTableSchema
  ): Promise<Record<string, unknown>[] | null> {
    if (!this.openai || mongoData.length === 0) {
      return null;
    }

    try {
      this.logger.info('Using AI to suggest data transformation');

      const sampleData = mongoData.slice(0, 3); // Use first 3 documents as sample
      
      const prompt = `
        Given this MongoDB data sample and PostgreSQL target schema, suggest how to transform the data.
        
        MongoDB Sample Data:
        ${JSON.stringify(sampleData, null, 2)}
        
        Target PostgreSQL Schema:
        ${JSON.stringify(targetSchema, null, 2)}
        
        Please provide transformation logic that maps MongoDB fields to PostgreSQL columns.
        Consider:
        1. Data type conversions
        2. Nested object flattening
        3. Array handling
        4. Null value handling
        
        Respond with a transformation function in JavaScript that can be applied to each document.
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a data transformation expert. Provide practical JavaScript code for transforming data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        this.logger.debug('AI transformation suggestion received');
        // In a real implementation, you might want to safely evaluate this code
        // For now, we'll just log it as a suggestion
        this.logger.info('AI suggested transformation logic:', content);
      }

      return null; // For safety, not executing AI-generated code
    } catch (error) {
      this.logger.error('AI transformation error:', error);
      return null;
    }
  }

  async analyzeRelationships(schemas: CollectionSchema[]): Promise<any> {
    if (!this.openai || schemas.length === 0) {
      return null;
    }

    try {
      this.logger.info('Using AI to analyze relationships between collections');

      const prompt = `
        Analyze these MongoDB collection schemas and identify potential relationships:
        
        ${schemas.map(schema => `
        Collection: ${schema.name}
        Fields: ${schema.fields.map(f => `${f.name} (${f.type})`).join(', ')}
        `).join('\n')}
        
        Identify:
        1. Foreign key relationships (ObjectId references)
        2. One-to-many relationships
        3. Many-to-many relationships
        4. Embedded vs. referenced data patterns
        
        Suggest how to maintain these relationships in PostgreSQL.
      `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a database design expert. Analyze collection relationships for migration planning.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        this.logger.info('AI relationship analysis:', content);
      }

      return content;
    } catch (error) {
      this.logger.error('AI relationship analysis error:', error);
      return null;
    }
  }
}