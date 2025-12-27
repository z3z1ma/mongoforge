import { MongoClient, Collection, BulkWriteOptions, Document, AnyBulkWriteOperation } from 'mongodb';
import { Readable } from 'stream';
import { logger } from '../../utils/logger.js';
import { CDCOperation } from '../../types/cdc.js';

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
  updatedDocuments?: number;
  deletedDocuments?: number;
}

/**
 * MongoDB Bulk Insertion Emitter
 * Handles streaming document insertion with advanced configuration
 */
export class MongoInserter {
  private client: MongoClient;
  private config: MongoInserterConfig;
  private collection!: Collection; // Definite assignment assertion - initialized in connect()

  constructor(config: MongoInserterConfig) {
    this.config = {
      batchSize: 1000,
      writeConcern: 'majority',
      orderedInserts: false,
      ...config
    };

    this.client = new MongoClient(this.config.uri, {
      writeConcern: { w: (this.config.writeConcern || 'majority') as number | 'majority' },
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

    const batch: Document[] = [];
    const batchSize = this.config.batchSize ?? 1000;

    const processBatch = async () => {
      if (batch.length === 0) return;
      const batchToInsert = batch.splice(0, batch.length);
      try {
        const result = await this.collection.insertMany(batchToInsert, bulkOptions);
        insertedDocuments += result.insertedCount;
      } catch (error: any) {
        logger.debug('Bulk insert partially failed or interrupted', { 
          message: error.message,
          code: error.code,
          insertedCount: error.result?.insertedCount 
        });
        if (error.result?.insertedCount) {
          insertedDocuments += error.result.insertedCount;
        }
        const successfulInBatch = error.result?.insertedCount || 0;
        failedInserts += batchToInsert.length - successfulInBatch;
      }
    };

    try {
      for await (const doc of docStream) {
        totalDocuments++;
        batch.push(doc);
        if (batch.length >= batchSize) {
          await processBatch();
        }
      }
      await processBatch(); // Final batch
    } catch (error) {
      logger.error('Document stream error', error);
      throw error;
    } finally {
      await this.client.close();
    }

    const durationMs = Date.now() - startTime;
    return {
      totalDocuments,
      insertedDocuments,
      failedInserts,
      durationMs
    };
  }

  /**
   * Bulk write operations (insert, update, delete)
   * @param opStream Readable stream of CDCOperations
   */
  async bulkWrite(opStream: Readable): Promise<InsertionMetrics> {
    const startTime = Date.now();
    let totalOperations = 0;
    let insertedDocuments = 0;
    let updatedDocuments = 0;
    let deletedDocuments = 0;
    let failedOps = 0;

    const bulkOptions: BulkWriteOptions = {
      ordered: this.config.orderedInserts ?? false
    };

    const batch: AnyBulkWriteOperation[] = [];
    const batchSize = this.config.batchSize ?? 1000;

    const processBatch = async () => {
      if (batch.length === 0) return;
      const batchToWrite = batch.splice(0, batch.length);
      try {
        const result = await this.collection.bulkWrite(batchToWrite, bulkOptions);
        insertedDocuments += result.insertedCount;
        updatedDocuments += result.modifiedCount;
        deletedDocuments += result.deletedCount;
      } catch (error: any) {
        logger.debug('Bulk write partially failed or interrupted', {
          message: error.message,
          code: error.code,
          result: error.result ? {
            insertedCount: error.result.insertedCount,
            modifiedCount: error.result.modifiedCount,
            deletedCount: error.result.deletedCount
          } : undefined
        });
        if (error.result) {
          insertedDocuments += error.result.insertedCount || 0;
          updatedDocuments += error.result.modifiedCount || 0;
          deletedDocuments += error.result.deletedCount || 0;
        }
        const successfulInBatch = (error.result?.insertedCount || 0) + 
                                (error.result?.modifiedCount || 0) + 
                                (error.result?.deletedCount || 0);
        failedOps += batchToWrite.length - successfulInBatch;
      }
    };

    try {
      for await (const op of opStream) {
        totalOperations++;
        let mongoOp: AnyBulkWriteOperation;
        switch (op.type) {
          case 'insert':
            mongoOp = { insertOne: { document: op.payload } };
            break;
          case 'update':
            mongoOp = { 
              updateOne: { 
                filter: op.payload.filter, 
                update: op.payload.update 
              } 
            };
            break;
          case 'delete':
            mongoOp = { deleteOne: { filter: op.payload } };
            break;
          default:
            logger.warn(`Unknown operation type: ${(op as any).type}`);
            continue;
        }
        batch.push(mongoOp);
        if (batch.length >= batchSize) {
          await processBatch();
        }
      }
      await processBatch(); // Final batch
    } catch (error) {
      logger.error('Operation stream error', error);
      throw error;
    } finally {
      await this.client.close();
    }

    const durationMs = Date.now() - startTime;
    return {
      totalDocuments: totalOperations,
      insertedDocuments,
      updatedDocuments,
      deletedDocuments,
      failedInserts: failedOps,
      durationMs
    };
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