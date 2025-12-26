/**
 * Schema validation and conformance checking using Ajv
 * Implements T076-T079: JSON Schema validation and uniqueness checking
 */

import Ajv, { ValidateFunction } from 'ajv';
import { GenerationSchema, SchemaViolation } from '../../types/data-model.js';

/**
 * Schema validator using Ajv for JSON Schema draft-07 validation
 */
export class SchemaValidator {
  private ajv: Ajv;
  private validateFn: ValidateFunction | null = null;

  constructor() {
    this.ajv = new Ajv({
      strict: false, // Allow x-gen vendor extensions
      allErrors: true, // Collect all validation errors
      verbose: true, // Include schema and data in errors
    });
  }

  /**
   * Compile the generation schema for validation
   * T076: Implement Ajv-based JSON Schema validator
   */
  compile(schema: GenerationSchema): void {
    this.validateFn = this.ajv.compile(schema);
  }

  /**
   * Validate a single document against the compiled schema
   * T077: Implement schema conformance checker
   */
  validate(document: any): boolean {
    if (!this.validateFn) {
      throw new Error('Schema not compiled. Call compile() first.');
    }

    return this.validateFn(document) as boolean;
  }

  /**
   * Get validation errors for the last validation
   */
  getErrors(): SchemaViolation['errors'] {
    if (!this.validateFn || !this.validateFn.errors) {
      return [];
    }

    return this.validateFn.errors.map((error) => ({
      path: error.instancePath || error.schemaPath,
      message: `${error.message} (keyword: ${error.keyword})`,
    }));
  }

  /**
   * Validate all documents and collect violations
   * Returns schema conformance report data
   */
  validateAll(documents: any[]): {
    totalDocuments: number;
    validDocuments: number;
    invalidDocuments: number;
    conformanceRate: number;
    violations: SchemaViolation[];
  } {
    if (!this.validateFn) {
      throw new Error('Schema not compiled. Call compile() first.');
    }

    const violations: SchemaViolation[] = [];
    let validCount = 0;

    documents.forEach((doc, index) => {
      const isValid = this.validate(doc);

      if (isValid) {
        validCount++;
      } else {
        violations.push({
          documentIndex: index,
          errors: this.getErrors(),
        });
      }
    });

    const totalDocuments = documents.length;
    const invalidDocuments = totalDocuments - validCount;

    return {
      totalDocuments,
      validDocuments: validCount,
      invalidDocuments,
      conformanceRate: totalDocuments > 0 ? validCount / totalDocuments : 0,
      violations,
    };
  }
}

/**
 * Check uniqueness of _id field
 * T078: Implement uniqueness checker for _id field
 */
export function checkIdUniqueness(documents: any[]): {
  totalKeys: number;
  uniqueKeys: number;
  duplicates: number;
  passed: boolean;
} {
  const ids = new Set<string>();
  const totalKeys = documents.length;

  documents.forEach((doc) => {
    const id = doc._id;
    if (id !== undefined && id !== null) {
      // Normalize to string for comparison
      ids.add(String(id));
    }
  });

  const uniqueKeys = ids.size;
  const duplicates = totalKeys - uniqueKeys;

  return {
    totalKeys,
    uniqueKeys,
    duplicates,
    passed: duplicates === 0,
  };
}

/**
 * Check uniqueness of additional key fields
 * T079: Implement uniqueness checker for additional key fields
 */
export function checkKeyFieldUniqueness(
  documents: any[],
  fieldPaths: string[]
): Map<
  string,
  {
    totalKeys: number;
    uniqueKeys: number;
    duplicates: number;
    passed: boolean;
  }
> {
  const results = new Map();

  for (const fieldPath of fieldPaths) {
    const values = new Set<string>();
    let totalKeys = 0;

    documents.forEach((doc) => {
      const value = getNestedValue(doc, fieldPath);
      if (value !== undefined && value !== null) {
        totalKeys++;
        // Normalize to string for comparison
        values.add(String(value));
      }
    });

    const uniqueKeys = values.size;
    const duplicates = totalKeys - uniqueKeys;

    results.set(fieldPath, {
      totalKeys,
      uniqueKeys,
      duplicates,
      passed: duplicates === 0,
    });
  }

  return results;
}

/**
 * Helper function to get nested value from object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}
