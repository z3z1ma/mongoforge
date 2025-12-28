/**
 * Profiler module - extracts statistical constraints from normalized documents
 */

import {
  NormalizedDocument,
  ConstraintsProfile,
} from "../../types/data-model.js";
import { ProfilerOptions, ProfilerResult } from "./types.js";
import {
  calculateAllArrayStats,
  ArrayStatsAccumulator,
} from "./array-stats.js";
import {
  calculateAllNumericStats,
  NumericStatsAccumulator,
} from "./numeric-stats.js";
import {
  calculateAllSemanticStats,
  SemanticStatsAccumulator,
} from "./semantic-stats.js";
import {
  calculateAllDynamicKeyStats,
  DynamicKeyStatsAccumulator,
} from "./dynamic-key-stats.js";
import { createSizeBuckets, SizeBucketAccumulator } from "./size-buckets.js";
import { logger } from "../../utils/logger.js";

export * from "./types.js";
export * from "./array-stats.js";
export * from "./numeric-stats.js";
export * from "./semantic-stats.js";
export * from "./dynamic-key-stats.js";
export * from "./size-buckets.js";

/**
 * Default profiler options
 */
const DEFAULT_OPTIONS: ProfilerOptions = {
  arrayLenPolicy: "percentileClamp",
  percentiles: [50, 90, 99],
  clampRange: [1, 99],
  sizeProxy: "leafFieldCount",
};

/**
 * Profile normalized documents to extract constraints
 */
export function profileDocuments(
  documents: NormalizedDocument[],
  options: Partial<ProfilerOptions> = {},
): ConstraintsProfile {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info("Profiling documents", {
    count: documents.length,
    arrayLenPolicy: opts.arrayLenPolicy,
    sizeProxy: opts.sizeProxy,
  });

  // Extract array statistics
  const arrayStats = calculateAllArrayStats(documents);

  // Extract numeric range statistics
  const numericRanges = calculateAllNumericStats(documents);

  // Extract semantic type statistics
  const semanticStats = calculateAllSemanticStats(documents);

  // Extract dynamic key statistics
  const dynamicKeyStats = calculateAllDynamicKeyStats(
    documents,
    opts.dynamicKeyDetection,
  );

  // Create size buckets
  const sizeBuckets = createSizeBuckets(documents, opts.sizeProxy);

  // Build constraints profile
  const profile: ConstraintsProfile = {
    arrayStats,
    numericRanges,
    semanticStats,
    dynamicKeyStats,
    sizeBuckets,
    keyFields: {
      _id: {
        type: "ObjectId",
        policy: "objectid",
        enforceUniqueness: true,
        uniquenessScope: "run",
      },
      additionalKeys: [],
    },
    config: {
      arrayLenPolicy: opts.arrayLenPolicy,
      percentiles: opts.percentiles,
      clampRange: opts.clampRange,
    },
  };

  logger.info("Profiling complete", {
    arrayFieldsFound: arrayStats.size,
    numericFieldsFound: numericRanges.size,
    semanticFieldsFound: semanticStats.size,
    dynamicKeyFieldsFound: dynamicKeyStats.size,
    sizeBucketsCreated: sizeBuckets.length,
  });
  return profile;
}

/**
 * Main profiler class
 */
export class Profiler {
  private options: ProfilerOptions;
  private arrayAccumulator: ArrayStatsAccumulator;
  private numericAccumulator: NumericStatsAccumulator;
  private semanticAccumulator: SemanticStatsAccumulator;
  private dynamicKeyAccumulator: DynamicKeyStatsAccumulator;
  private sizeAccumulator: SizeBucketAccumulator;
  private documentCount = 0;

  constructor(options: Partial<ProfilerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.arrayAccumulator = new ArrayStatsAccumulator();
    this.numericAccumulator = new NumericStatsAccumulator();
    this.semanticAccumulator = new SemanticStatsAccumulator();
    this.dynamicKeyAccumulator = new DynamicKeyStatsAccumulator(
      this.options.dynamicKeyDetection,
    );

    // Default bucket config if none provided
    const bucketConfig = [
      { id: "small", min: 0, max: 10 },
      { id: "medium", min: 11, max: 100 },
      { id: "large", min: 101, max: 1000000 },
    ];
    this.sizeAccumulator = new SizeBucketAccumulator(
      this.options.sizeProxy,
      bucketConfig,
    );
  }

  /**
   * Observe a single document for profiling
   */
  observe(doc: NormalizedDocument): void {
    this.arrayAccumulator.addDocument(doc);
    this.numericAccumulator.addDocument(doc);
    this.semanticAccumulator.addDocument(doc);
    this.dynamicKeyAccumulator.addDocument(doc);
    this.sizeAccumulator.addDocument(doc);
    this.documentCount++;
  }

  /**
   * Profile a stream of documents
   */
  async profileStream(
    documents: AsyncIterable<NormalizedDocument>,
  ): Promise<ProfilerResult> {
    logger.info("Starting profile stream", {
      arrayLenPolicy: this.options.arrayLenPolicy,
      sizeProxy: this.options.sizeProxy,
    });

    for await (const doc of documents) {
      this.observe(doc);
    }

    return this.getProfileResult();
  }

  /**
   * Get the final profile result
   */
  getProfileResult(): ProfilerResult {
    const arrayStats = this.arrayAccumulator.getStats();
    const numericRanges = this.numericAccumulator.getStats();
    const semanticStats = this.semanticAccumulator.getStats();
    const dynamicKeyStats = this.dynamicKeyAccumulator.getStats();
    const sizeBuckets = this.sizeAccumulator.getBuckets();

    const profile: ConstraintsProfile = {
      arrayStats,
      numericRanges,
      semanticStats,
      dynamicKeyStats,
      sizeBuckets,
      keyFields: {
        _id: {
          type: "ObjectId",
          policy: "objectid",
          enforceUniqueness: true,
          uniquenessScope: "run",
        },
        additionalKeys: [],
      },
      config: {
        arrayLenPolicy: this.options.arrayLenPolicy,
        percentiles: this.options.percentiles,
        clampRange: this.options.clampRange,
      },
    };

    logger.info("Profiling complete", {
      documentsAnalyzed: this.documentCount,
      arrayFieldsFound: arrayStats.size,
      numericFieldsFound: numericRanges.size,
      semanticFieldsFound: semanticStats.size,
      dynamicKeyFieldsFound: dynamicKeyStats.size,
      sizeBucketsCreated: sizeBuckets.length,
    });

    return {
      profile,
      metadata: {
        documentsAnalyzed: this.documentCount,
        arrayFieldsFound: arrayStats.size,
        numericFieldsFound: numericRanges.size,
        semanticFieldsFound: semanticStats.size,
        dynamicKeyFieldsFound: dynamicKeyStats.size,
        sizeBucketsCreated: sizeBuckets.length,
      },
    };
  }

  profile(documents: NormalizedDocument[]): ProfilerResult {
    const profile = profileDocuments(documents, this.options);

    return {
      profile,
      metadata: {
        documentsAnalyzed: documents.length,
        arrayFieldsFound: profile.arrayStats.size,
        numericFieldsFound: profile.numericRanges.size,
        semanticFieldsFound: profile.semanticStats.size,
        dynamicKeyFieldsFound: profile.dynamicKeyStats?.size || 0,
        sizeBucketsCreated: profile.sizeBuckets.length,
      },
    };
  }
}
