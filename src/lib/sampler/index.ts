/**
 * Sampler module - orchestrates MongoDB document sampling
 */

import { SampleDocument } from "../../types/data-model.js";
import { MongoConnector, createConnector } from "./connector.js";
import { createStrategy, SamplingStrategy } from "./strategies.js";
import { SamplerOptions, SamplerResult } from "./types.js";
import { logger } from "../../utils/logger.js";

export * from "./types.js";
export * from "./connector.js";
export * from "./strategies.js";

/**
 * Main sampler class
 */
export class Sampler {
  private connector: MongoConnector | null = null;
  private strategy: SamplingStrategy | null = null;

  constructor(options?: SamplerOptions) {
    if (options?.strategy) {
      this.strategy = createStrategy(options.strategy);
    }
  }

  /**
   * Execute sampling operation
   */
  async sample(options: SamplerOptions): Promise<SamplerResult> {
    const startTime = Date.now();

    try {
      // Create strategy from options if not set in constructor
      if (!this.strategy) {
        this.strategy = createStrategy(options.strategy);
      }

      // Connect to MongoDB
      this.connector = await createConnector({
        uri: options.uri,
        database: options.database,
        collection: options.collection,
      });

      logger.info("Starting document sampling", {
        collection: options.collection,
        strategy: options.strategy,
        sampleSize: options.sampleSize,
      });

      // Get collection
      const collection = this.connector.getCollection(options.collection);

      // Execute sampling strategy
      const documents = await this.strategy.sample(
        collection,
        options.sampleSize,
        options.timeWindow,
      );

      const duration = Date.now() - startTime;

      logger.info("Sampling completed", {
        documentsRetrieved: documents.length,
        durationMs: duration,
      });

      return {
        documents,
        metadata: {
          totalSampled: documents.length,
          collectionName: options.collection,
          sampledAt: new Date(),
        },
      };
    } catch (error) {
      logger.error("Sampling failed", error);
      throw error;
    } finally {
      // Always close connection
      if (this.connector) {
        await this.connector.close();
      }
    }
  }

  /**
   * Execute sampling operation as a stream
   */
  async *sampleStream(
    options: SamplerOptions,
  ): AsyncIterableIterator<SampleDocument> {
    try {
      // Create strategy from options if not set in constructor
      if (!this.strategy) {
        this.strategy = createStrategy(options.strategy);
      }

      // Connect to MongoDB
      this.connector = await createConnector({
        uri: options.uri,
        database: options.database,
        collection: options.collection,
      });

      logger.info("Starting document sampling stream", {
        collection: options.collection,
        strategy: options.strategy,
        sampleSize: options.sampleSize,
      });

      // Get collection
      const collection = this.connector.getCollection(options.collection);

      // Execute sampling strategy stream
      const stream = this.strategy.sampleStream(
        collection,
        options.sampleSize,
        options.timeWindow,
      );

      for await (const doc of stream) {
        yield doc;
      }
    } catch (error) {
      logger.error("Sampling stream failed", error);
      throw error;
    } finally {
      // Note: closing connection here might be premature if the stream is still being consumed.
      // However, AsyncIterableIterator execution will reach finally after loop completion or break.
      if (this.connector) {
        await this.connector.close();
      }
    }
  }
}

/**
 * Convenience function for one-off sampling
 */
export async function sampleCollection(
  options: SamplerOptions,
): Promise<SamplerResult> {
  const sampler = new Sampler(options);
  return sampler.sample(options);
}
