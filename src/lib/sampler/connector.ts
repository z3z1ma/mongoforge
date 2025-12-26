/**
 * MongoDB connection management with pooling
 */

import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../../utils/logger.js';
import { MongoConnection } from './types.js';

export class MongoConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;

  /**
   * Connect to MongoDB with connection pooling
   */
  async connect(config: MongoConnection): Promise<void> {
    try {
      const sanitized = this.sanitizeUri(config.uri);
      logger.info('Connecting to MongoDB: ' + sanitized);

      this.client = new MongoClient(config.uri, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      await this.client.connect();
      this.db = this.client.db(config.database);

      logger.info('Connected to database: ' + config.database);
    } catch (error) {
      logger.error('MongoDB connection failed', error);
      throw new Error('Failed to connect to MongoDB: ' + (error as Error).message);
    }
  }

  /**
   * Get collection instance
   */
  getCollection(collectionName: string): Collection {
    if (!this.db) {
      throw new Error('Not connected to MongoDB. Call connect() first.');
    }

    return this.db.collection(collectionName);
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info('MongoDB connection closed');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  /**
   * Sanitize URI for logging (remove credentials)
   */
  private sanitizeUri(uri: string): string {
    try {
      const url = new URL(uri);
      if (url.username || url.password) {
        return uri.replace(/:\/\/[^@]+@/, '://***:***@');
      }
      return uri;
    } catch {
      return 'mongodb://***';
    }
  }
}

/**
 * Factory function for creating connector instances
 */
export async function createConnector(config: MongoConnection): Promise<MongoConnector> {
  const connector = new MongoConnector();
  await connector.connect(config);
  return connector;
}
