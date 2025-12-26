/**
 * Validator module - Schema validation and quality reporting
 * T083: Create validator module index
 */

export * from './types.js';
export { SchemaValidator, checkIdUniqueness, checkKeyFieldUniqueness } from './schema-validator.js';
export { compareArrayLengths, compareDocumentSizes } from './quality-reporter.js';

import { SchemaValidator, checkIdUniqueness, checkKeyFieldUniqueness } from './schema-validator.js';
import { compareArrayLengths, compareDocumentSizes } from './quality-reporter.js';
import { ValidationReport, GenerationSchema, ConstraintsProfile } from '../../types/data-model.js';

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
  } = {}
): ValidationReport {
  const { arrayLengthTolerance = 0.1, sizeBucketTolerance = 0.2 } = options;

  // 1. Schema conformance validation
  const validator = new SchemaValidator();
  validator.compile(schema);
  const schemaConformance = validator.validateAll(documents);

  // 2. Array length comparison
  const arrayLengthComparison = compareArrayLengths(constraints.arrayStats, documents, arrayLengthTolerance);

  // 3. Document size comparison
  const documentSizeComparison = compareDocumentSizes(constraints.sizeBuckets, documents, sizeBucketTolerance);

  // 4. Key uniqueness checks
  const idUniqueness = checkIdUniqueness(documents);

  const additionalKeyPaths = constraints.keyFields.additionalKeys
    .filter((key) => key.enforceUniqueness)
    .map((key) => key.fieldPath);

  const additionalKeysUniqueness = checkKeyFieldUniqueness(documents, additionalKeyPaths);

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
