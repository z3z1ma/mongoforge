/**
 * Schema validation and conformance checking using Ajv
 * Implements T076-T079: JSON Schema validation and uniqueness checking
 */

import Ajv, { ValidateFunction } from "ajv";
import { GenerationSchema, SchemaViolation } from "../../types/data-model.js";

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
      throw new Error("Schema not compiled. Call compile() first.");
    }

    return this.validateFn(document) as boolean;
  }

  /**
   * Get validation errors for the last validation
   */
  getErrors(): SchemaViolation["errors"] {
    if (!this.validateFn || !this.validateFn.errors) {
      return [];
    }

    return this.validateFn.errors.map((error) => {
      // For missing required properties, Ajv includes the field name in params
      const path =
        error.keyword === "required" &&
        error.params &&
        "missingProperty" in error.params
          ? `/${error.params.missingProperty}`
          : error.instancePath || error.schemaPath;

      return {
        path,
        message: `${error.message} (keyword: ${error.keyword})`,
      };
    });
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
      throw new Error("Schema not compiled. Call compile() first.");
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
  let totalKeys = 0;

  documents.forEach((doc) => {
    const id = doc._id;
    if (id !== undefined && id !== null) {
      totalKeys++;
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
  fieldPaths: string[],
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
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Accumulator for incremental key uniqueness checking
 */
export class UniquenessAccumulator {
  private idSet = new Set<string>();
  private totalIds = 0;
  private keySets = new Map<string, Set<string>>();
  private totalKeys = new Map<string, number>();
  private additionalKeyPaths: string[];

  constructor(additionalKeyPaths: string[] = []) {
    this.additionalKeyPaths = additionalKeyPaths;
    for (const path of additionalKeyPaths) {
      this.keySets.set(path, new Set<string>());
      this.totalKeys.set(path, 0);
    }
  }

  /**
   * Add a document to the accumulation
   */
  addDocument(doc: any): void {
    // Check _id
    const id = doc._id;
    if (id !== undefined && id !== null) {
      this.totalIds++;
      this.idSet.add(String(id));
    }

    // Check additional keys
    for (const path of this.additionalKeyPaths) {
      const value = getNestedValue(doc, path);
      if (value !== undefined && value !== null) {
        this.totalKeys.set(path, (this.totalKeys.get(path) || 0) + 1);
        this.keySets.get(path)!.add(String(value));
      }
    }
  }

  /**
   * Get uniqueness results
   */
  getResults(): {
    _id: {
      totalKeys: number;
      uniqueKeys: number;
      duplicates: number;
      passed: boolean;
    };
    additionalKeys: Map<
      string,
      {
        totalKeys: number;
        uniqueKeys: number;
        duplicates: number;
        passed: boolean;
      }
    >;
  } {
    const additionalKeysResults = new Map();

    for (const path of this.additionalKeyPaths) {
      const total = this.totalKeys.get(path) || 0;
      const unique = this.keySets.get(path)!.size;
      const duplicates = total - unique;

      additionalKeysResults.set(path, {
        totalKeys: total,
        uniqueKeys: unique,
        duplicates,
        passed: duplicates === 0,
      });
    }

    const idUnique = this.idSet.size;
    const idDuplicates = this.totalIds - idUnique;

    return {
      _id: {
        totalKeys: this.totalIds,
        uniqueKeys: idUnique,
        duplicates: idDuplicates,
        passed: idDuplicates === 0,
      },
      additionalKeys: additionalKeysResults,
    };
  }
}
