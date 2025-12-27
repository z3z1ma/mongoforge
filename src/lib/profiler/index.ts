/**
 * Profiler module - extracts statistical constraints from normalized documents
 */

import {
  NormalizedDocument,
  ConstraintsProfile,
} from "../../types/data-model.js";
import { ProfilerOptions, ProfilerResult } from "./types.js";
import { calculateAllArrayStats } from "./array-stats.js";
import { calculateAllNumericStats } from "./numeric-stats.js";
import { createSizeBuckets } from "./size-buckets.js";
import { logger } from "../../utils/logger.js";

export * from "./types.js";
export * from "./array-stats.js";
export * from "./numeric-stats.js";
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

  // Create size buckets
  const sizeBuckets = createSizeBuckets(documents, opts.sizeProxy);

  // Build constraints profile
  const profile: ConstraintsProfile = {
    arrayStats,
    numericRanges,
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
    sizeBucketsCreated: sizeBuckets.length,
  });

  return profile;
}

/**
 * Main profiler class
 */
export class Profiler {
  private options: ProfilerOptions;

  constructor(options: Partial<ProfilerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  profile(documents: NormalizedDocument[]): ProfilerResult {
    const profile = profileDocuments(documents, this.options);

    return {
      profile,
      metadata: {
        documentsAnalyzed: documents.length,
        arrayFieldsFound: profile.arrayStats.size,
        numericFieldsFound: profile.numericRanges.size,
        sizeBucketsCreated: profile.sizeBuckets.length,
      },
    };
  }
}
