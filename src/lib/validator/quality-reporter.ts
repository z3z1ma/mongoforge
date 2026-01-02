/**
 * Quality reporting for array lengths and document size distributions
 * Implements T080-T082: Array/size comparison and deviation calculation
 */

import {
  ArrayLengthStats,
  DocumentSizeBucket,
  ArrayLengthComparison,
  SizeBucketComparison,
} from "../../types/data-model.js";
import { calculateAllArrayStats } from "../profiler/array-stats.js";
import { createSizeBuckets } from "../profiler/size-buckets.js";

/**
 * Compare array length distributions between sample and generated documents
 * T080: Implement array length histogram comparison
 */
export function compareArrayLengths(
  sampleStats: Map<string, ArrayLengthStats>,
  generatedDocuments: any[] | Map<string, ArrayLengthStats>,
  tolerance: number = 0.1, // 10% tolerance
): Record<string, ArrayLengthComparison> {
  const generatedStats =
    generatedDocuments instanceof Map
      ? generatedDocuments
      : calculateAllArrayStats(generatedDocuments as any[]);

  const comparison: Record<string, ArrayLengthComparison> = {};

  // Compare each array field from sample
  for (const [fieldPath, sampleStat] of sampleStats.entries()) {
    const generatedStat = generatedStats.get(fieldPath);

    if (!generatedStat) {
      // Field not present in generated documents - mark as failed
      comparison[fieldPath] = {
        sample: {
          minLen: sampleStat.stats.min,
          maxLen: sampleStat.stats.max,
          p50Len: sampleStat.stats.median,
          p90Len: sampleStat.stats.p90,
          p99Len: sampleStat.stats.p99,
        },
        generated: {
          minLen: 0,
          maxLen: 0,
          p50Len: 0,
          p90Len: 0,
          p99Len: 0,
        },
        deviation: {
          p50: 1.0,
          p90: 1.0,
          p99: 1.0,
        },
        passed: false,
      };
      continue;
    }

    // Calculate percentage deviations for each percentile
    // T082: Implement deviation calculation with tolerances (10% array)
    const deviationP50 = calculatePercentageDeviation(
      sampleStat.stats.median,
      generatedStat.stats.median,
    );
    const deviationP90 = calculatePercentageDeviation(
      sampleStat.stats.p90,
      generatedStat.stats.p90,
    );
    const deviationP99 = calculatePercentageDeviation(
      sampleStat.stats.p99,
      generatedStat.stats.p99,
    );

    // Check if deviations are within tolerance
    const passed =
      deviationP50 <= tolerance &&
      deviationP90 <= tolerance &&
      deviationP99 <= tolerance;

    comparison[fieldPath] = {
      sample: {
        minLen: sampleStat.stats.min,
        maxLen: sampleStat.stats.max,
        p50Len: sampleStat.stats.median,
        p90Len: sampleStat.stats.p90,
        p99Len: sampleStat.stats.p99,
      },
      generated: {
        minLen: generatedStat.stats.min,
        maxLen: generatedStat.stats.max,
        p50Len: generatedStat.stats.median,
        p90Len: generatedStat.stats.p90,
        p99Len: generatedStat.stats.p99,
      },
      deviation: {
        p50: deviationP50,
        p90: deviationP90,
        p99: deviationP99,
      },
      passed,
    };
  }

  return comparison;
}

/**
 * Compare document size distributions between sample and generated documents
 * T081: Implement document size distribution comparison
 */
export function compareDocumentSizes(
  sampleBuckets: DocumentSizeBucket[],
  generatedDocuments: any[] | DocumentSizeBucket[],
  tolerance: number = 0.2, // 20% tolerance
): {
  buckets: SizeBucketComparison[];
} {
  let generatedBuckets: DocumentSizeBucket[];

  if (
    Array.isArray(generatedDocuments) &&
    generatedDocuments.length > 0 &&
    "bucketId" in (generatedDocuments[0] as any)
  ) {
    generatedBuckets = generatedDocuments as DocumentSizeBucket[];
  } else {
    // Extract size buckets from generated documents using same proxy type and bucket configuration
    const docs = generatedDocuments as any[];
    const sizeProxy = sampleBuckets[0]?.sizeProxy ?? "leafFieldCount";
    const bucketConfig = sampleBuckets.map((b) => ({
      id: b.bucketId,
      min: b.sizeRange.min,
      max: b.sizeRange.max,
    }));
    generatedBuckets = createSizeBuckets(docs, sizeProxy, bucketConfig);
  }

  const comparisons: SizeBucketComparison[] = [];

  // Match buckets by ID and compare
  for (const sampleBucket of sampleBuckets) {
    const generatedBucket = generatedBuckets.find(
      (b) => b.bucketId === sampleBucket.bucketId,
    );

    if (!generatedBucket) {
      // Bucket not found in generated data
      comparisons.push({
        bucketId: sampleBucket.bucketId,
        sample: {
          count: sampleBucket.count,
          probability: sampleBucket.probability,
        },
        generated: {
          count: 0,
          probability: 0,
        },
        deviation: 1.0,
        passed: false,
      });
      continue;
    }

    // Calculate probability deviation
    // T082: Implement deviation calculation with tolerances (20% size)
    const deviation = calculatePercentageDeviation(
      sampleBucket.probability,
      generatedBucket.probability,
    );
    const passed = deviation <= tolerance;

    comparisons.push({
      bucketId: sampleBucket.bucketId,
      sample: {
        count: sampleBucket.count,
        probability: sampleBucket.probability,
      },
      generated: {
        count: generatedBucket.count,
        probability: generatedBucket.probability,
      },
      deviation,
      passed,
    });
  }

  return { buckets: comparisons };
}

/**
 * Calculate fractional deviation between two values
 * Returns absolute fractional deviation (0-1+, where 0.1 = 10%)
 */
function calculatePercentageDeviation(
  expected: number,
  actual: number,
): number {
  if (expected === 0 && actual === 0) {
    return 0;
  }

  if (expected === 0) {
    return 1.0; // Maximum deviation if expected is 0 but actual is not
  }

  return Math.abs(actual - expected) / expected;
}
