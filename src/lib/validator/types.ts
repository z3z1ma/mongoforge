/**
 * Validator module types
 */

import {
  ValidationReport,
  GenerationSchema,
  SyntheticDocument,
} from "../../types/data-model";

export interface ValidatorOptions {
  schema: GenerationSchema;
  arrayLengthTolerance: number; // e.g., 0.1 for 10%
  sizeBucketTolerance: number; // e.g., 0.2 for 20%
}

export interface ValidatorResult {
  report: ValidationReport;
  passed: boolean;
}
