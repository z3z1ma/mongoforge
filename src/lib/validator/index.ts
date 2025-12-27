/**
 * Validator module - Schema validation and quality reporting
 * T083: Create validator module index
 */

export * from "./types.js";
export {
  SchemaValidator,
  checkIdUniqueness,
  checkKeyFieldUniqueness,
} from "./schema-validator.js";
export {
  compareArrayLengths,
  compareDocumentSizes,
} from "./quality-reporter.js";

import {
  SchemaValidator,
  checkIdUniqueness,
  checkKeyFieldUniqueness,
  UniquenessAccumulator,
} from "./schema-validator.js";
import {
  compareArrayLengths,
  compareDocumentSizes,
} from "./quality-reporter.js";
import {
  ValidationReport,
  GenerationSchema,
  ConstraintsProfile,
  SchemaViolation,
} from "../../types/data-model.js";
import { ArrayStatsAccumulator } from "../profiler/array-stats.js";
import { SizeBucketAccumulator } from "../profiler/size-buckets.js";

/**
 * Main validation function - validates documents against schema and constraints
 * Returns comprehensive validation report
 */
export function validateDocuments(
  documents: any[],
  schema: GenerationSchema,
  constraints: ConstraintsProfile,
  options: {
    arrayLengthTolerance?: number;
    sizeBucketTolerance?: number;
  } = {},
): ValidationReport {
  const { arrayLengthTolerance = 0.1, sizeBucketTolerance = 0.2 } = options;

  // 1. Schema conformance validation
  const validator = new SchemaValidator();
  validator.compile(schema);
  const schemaConformance = validator.validateAll(documents);

  // 2. Array length comparison
  const arrayLengthComparison = compareArrayLengths(
    constraints.arrayStats,
    documents,
    arrayLengthTolerance,
  );

  // 3. Document size comparison
  const documentSizeComparison = compareDocumentSizes(
    constraints.sizeBuckets,
    documents,
    sizeBucketTolerance,
  );

  // 4. Key uniqueness checks
  const idUniqueness = checkIdUniqueness(documents);

  const additionalKeyPaths = constraints.keyFields.additionalKeys
    .filter((key) => key.enforceUniqueness)
    .map((key) => key.fieldPath);

  const additionalKeysUniqueness = checkKeyFieldUniqueness(
    documents,
    additionalKeyPaths,
  );

  return {
    schemaConformance,
    arrayLengthComparison,
    documentSizeComparison,
    keyUniqueness: {
      _id: idUniqueness,
      additionalKeys: additionalKeysUniqueness,
    },
  };
}

/**
 * Streaming validation function - validates documents from an async iterator
 * Reduces memory usage for large datasets
 */
export async function validateDocumentStream(
  documentStream: AsyncIterable<any>,
  schema: GenerationSchema,
  constraints: ConstraintsProfile,
  options: {
    arrayLengthTolerance?: number;
    sizeBucketTolerance?: number;
    maxViolations?: number; // Cap violations to prevent OOM
  } = {},
): Promise<ValidationReport> {
  const {
    arrayLengthTolerance = 0.1,
    sizeBucketTolerance = 0.2,
    maxViolations = 1000,
  } = options;

  // Initialize accumulators
  const schemaValidator = new SchemaValidator();
  schemaValidator.compile(schema);

  const arrayAccumulator = new ArrayStatsAccumulator();
  const sizeAccumulator = new SizeBucketAccumulator(
    constraints.sizeBuckets[0]?.sizeProxy || "leafFieldCount",
    constraints.sizeBuckets.map((b) => ({
      id: b.bucketId,
      min: b.sizeRange.min,
      max: b.sizeRange.max,
    })),
  );

  const additionalKeyPaths = constraints.keyFields.additionalKeys
    .filter((key) => key.enforceUniqueness)
    .map((key) => key.fieldPath);
  const uniquenessAccumulator = new UniquenessAccumulator(additionalKeyPaths);

  // Counters for schema conformance
  let totalDocuments = 0;
  let validDocuments = 0;
  const violations: SchemaViolation[] = [];

  // Process stream
  for await (const doc of documentStream) {
    const index = totalDocuments++;

    // 1. Schema validation
    const isValid = schemaValidator.validate(doc);
    if (isValid) {
      validDocuments++;
    } else if (violations.length < maxViolations) {
      violations.push({
        documentIndex: index,
        errors: schemaValidator.getErrors(),
      });
    }

    // 2. Accumulate stats
    arrayAccumulator.addDocument(doc);
    sizeAccumulator.addDocument(doc);
    uniquenessAccumulator.addDocument(doc);
  }

  // 3. Final calculations and comparisons
  const invalidDocuments = totalDocuments - validDocuments;
  const schemaConformance = {
    totalDocuments,
    validDocuments,
    invalidDocuments,
    conformanceRate: totalDocuments > 0 ? validDocuments / totalDocuments : 0,
    violations,
  };

  const arrayLengthComparison = compareArrayLengths(
    constraints.arrayStats,
    arrayAccumulator.getStats(),
    arrayLengthTolerance,
  );

  const documentSizeComparison = compareDocumentSizes(
    constraints.sizeBuckets,
    sizeAccumulator.getBuckets(),
    sizeBucketTolerance,
  );

  const keyUniqueness = uniquenessAccumulator.getResults();

  return {
    schemaConformance,
    arrayLengthComparison,
    documentSizeComparison,
    keyUniqueness,
  };
}
