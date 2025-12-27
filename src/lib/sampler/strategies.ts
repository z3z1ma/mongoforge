/**
 * Sampling strategies for MongoDB collections
 */

import { Collection } from "mongodb";
import { SampleDocument } from "../../types/data-model.js";
import { logger } from "../../utils/logger.js";

export interface SamplingStrategy {
  name: string;
  sample(
    collection: Collection,
    size: number,
    options?: any,
  ): Promise<SampleDocument[]>;
}

/**
 * Random sampling using MongoDB $sample aggregation
 */
export class RandomSamplingStrategy implements SamplingStrategy {
  name = "random";

  async sample(
    collection: Collection,
    size: number,
  ): Promise<SampleDocument[]> {
    logger.debug("Executing random sampling strategy", { size });

    const pipeline = [{ $sample: { size } }];
    const documents = await collection.aggregate(pipeline).toArray();

    return documents.map((doc, index) => ({
      ...doc,
      __metadata: {
        collectionName: collection.collectionName,
        sampledAt: new Date(),
        sampleIndex: index,
      },
    })) as SampleDocument[];
  }
}

/**
 * First-N sampling (reads first N documents in natural order)
 */
export class FirstNSamplingStrategy implements SamplingStrategy {
  name = "firstN";

  async sample(
    collection: Collection,
    size: number,
  ): Promise<SampleDocument[]> {
    logger.debug("Executing first-N sampling strategy", { size });

    const documents = await collection.find({}).limit(size).toArray();

    return documents.map((doc, index) => ({
      ...doc,
      __metadata: {
        collectionName: collection.collectionName,
        sampledAt: new Date(),
        sampleIndex: index,
      },
    })) as SampleDocument[];
  }
}

/**
 * Time-windowed sampling (samples documents within a time range)
 */
export interface TimeWindowOptions {
  field: string; // Field name for time-based filtering
  start: Date;
  end: Date;
}

export class TimeWindowedSamplingStrategy implements SamplingStrategy {
  name = "timeWindowed";

  async sample(
    collection: Collection,
    size: number,
    options?: TimeWindowOptions,
  ): Promise<SampleDocument[]> {
    if (!options) {
      throw new Error(
        "TimeWindowedSamplingStrategy requires options with field, start, and end",
      );
    }

    logger.debug("Executing time-windowed sampling strategy", {
      size,
      field: options.field,
      start: options.start,
      end: options.end,
    });

    const filter: any = {
      [options.field]: {
        $gte: options.start,
        $lte: options.end,
      },
    };

    // First, count documents in window
    const totalInWindow = await collection.countDocuments(filter);
    logger.debug("Documents in time window: " + totalInWindow);

    if (totalInWindow === 0) {
      logger.warn("No documents found in time window");
      return [];
    }

    // Use $sample for random sampling within window
    const sampleSize = Math.min(size, totalInWindow);
    const pipeline = [{ $match: filter }, { $sample: { size: sampleSize } }];

    const documents = await collection.aggregate(pipeline).toArray();

    return documents.map((doc, index) => ({
      ...doc,
      __metadata: {
        collectionName: collection.collectionName,
        sampledAt: new Date(),
        sampleIndex: index,
      },
    })) as SampleDocument[];
  }
}

/**
 * Strategy factory
 */
export function createStrategy(strategyName: string): SamplingStrategy {
  switch (strategyName) {
    case "random":
      return new RandomSamplingStrategy();
    case "firstN":
      return new FirstNSamplingStrategy();
    case "timeWindowed":
      return new TimeWindowedSamplingStrategy();
    default:
      throw new Error("Unknown sampling strategy: " + strategyName);
  }
}
