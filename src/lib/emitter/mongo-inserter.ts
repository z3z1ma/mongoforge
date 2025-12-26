import { MongoClient, Collection, BulkWriteOptions, Document } from 'mongodb';
import { Readable } from 'stream';
import { logger } from '../../utils/logger.js';

/**
 * Configuration options for MongoDB insertion
 */
export interface MongoInserterConfig {
  uri: string;
  database: string;
  collection: string;
  collectionSuffix?: string;
  batchSize?: number;
  writeConcern?: string;
  orderedInserts?: boolean;
}

/**
 * Insertion result metrics
 */
export interface InsertionMetrics {
  totalDocuments: number;
  insertedDocuments: number;
  failedInserts: number;
  durationMs: number;
}

/**
 * MongoDB Bulk Insertion Emitter
 * Handles streaming document insertion with advanced configuration
 */
export class MongoInserter {
  private client: MongoClient;
  private config: MongoInserterConfig;
  private collection: Collection;

  constructor(config: MongoInserterConfig) {
    this.config = {
      batchSize: 1000,
      writeConcern: 'majority',
      orderedInserts: false,
      ...config
    };

    this.client = new MongoClient(this.config.uri, {
      writeConcern: this.config.writeConcern,
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 60000
    });
  }

  /**
   * Connect to MongoDB and prepare target collection
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      const db = this.client.db(this.config.database);

      // Apply collection suffix if provided
      const targetCollection = this.config.collectionSuffix
        ? `${this.config.collection}${this.config.collectionSuffix}`
        : this.config.collection;

      this.collection = db.collection(targetCollection);
      logger.info(`Connected to MongoDB collection: ${targetCollection}`);
    } catch (error) {
      logger.error('MongoDB connection failed', error);
      throw new Error(`Failed to connect to MongoDB: ${(error as Error).message}`);
    }
  }

  /**
   * Bulk insert documents with backpressure and configuration options
   * @param docStream Readable stream of documents
   * @returns Insertion metrics
   */
  async bulkInsert(docStream: Readable): Promise<InsertionMetrics> {
    const startTime = Date.now();
    let totalDocuments = 0;
    let insertedDocuments = 0;
    let failedInserts = 0;

    const bulkOptions: BulkWriteOptions = {
      ordered: this.config.orderedInserts ?? false,
      bypassDocumentValidation: false
    };

    return new Promise((resolve, reject) => {
      const batch: Document[] = [];

      const processBatch = async () => {
        if (batch.length === 0) return;

        try {
          const result = await this.collection.insertMany(batch, bulkOptions);
          insertedDocuments += result.insertedCount;
        } catch (error) {
          logger.error('Bulk insert failed', error);
          failedInserts += batch.length;
        }

        batch.length = 0; // Clear batch
      };

      docStream.on('data', async (doc: Document) => {
        totalDocuments++;
        batch.push(doc);

        // Pause stream if batch is full, process it, then resume
        if (batch.length >= (this.config.batchSize ?? 1000)) {
          docStream.pause();
          processBatch().then(() => docStream.resume());
        }
      });

      docStream.on('end', async () => {
        // Process final batch
        if (batch.length > 0) {
          await processBatch();
        }

        const durationMs = Date.now() - startTime;
        await this.client.close();

        resolve({
          totalDocuments,
          insertedDocuments,
          failedInserts,
          durationMs
        });
      });

      docStream.on('error', async (error) => {
        logger.error('Document stream error', error);
        await this.client.close();
        reject(error);
      });
    });
  }

  /**
   * Close MongoDB connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
  }
}

/**
 * Factory function for creating MongoInserter instances
 * @param config Insertion configuration
 * @returns Configured MongoInserter
 */
export async function createMongoInserter(
  config: MongoInserterConfig
): Promise<MongoInserter> {
  const inserter = new MongoInserter(config);
  await inserter.connect();
  return inserter;
}