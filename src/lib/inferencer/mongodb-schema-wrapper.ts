/**
 * MongoDB Schema wrapper - integrates mongodb-schema library for schema inference
 */

import parseSchema from "mongodb-schema";
import {
  NormalizedDocument,
  InferredSchema,
  InferredSchemaField,
} from "../../types/data-model.js";
import { logger } from "../../utils/logger.js";
import { calculateFrequencies } from "../../utils/frequency-map.js";

/**
 * Options for schema inference
 */
export interface InferOptions {
  semanticTypes?: boolean; // Enable semantic type detection (e.g., email, URL)
  storeValues?: boolean; // Store sample values in schema
}

/**
 * Extract all field paths from inferred schema (JSONPath-style)
 * Example: { "user.addresses.city": field, "tags": field }
 */
export function extractFieldPaths(
  schema: InferredSchema,
): Map<string, InferredSchemaField> {
  const paths = new Map<string, InferredSchemaField>();

  function traverse(
    fields: Record<string, InferredSchemaField>,
    parentPath = "",
  ): void {
    for (const [fieldName, field] of Object.entries(fields)) {
      const currentPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
      paths.set(currentPath, field);

      // Recursively traverse nested document fields
      if (field.fields && Object.keys(field.fields).length > 0) {
        traverse(field.fields, currentPath);
      }
    }
  }

  traverse(schema.fields);
  return paths;
}

/**
 * Infer schema from normalized documents using mongodb-schema
 */
export async function inferSchema(
  documents: NormalizedDocument[],
  options: InferOptions = {},
): Promise<InferredSchema> {
  logger.info("Inferring schema from normalized documents", {
    count: documents.length,
    semanticTypes: options.semanticTypes ?? false,
    storeValues: options.storeValues ?? false,
  });

  if (documents.length === 0) {
    throw new Error("Cannot infer schema from empty document array");
  }

  // Remove __typeHints metadata before passing to mongodb-schema
  const cleanDocs = documents.map((doc) => {
    const { __typeHints, ...cleanDoc } = doc;
    return cleanDoc;
  });

  try {
    // mongodb-schema v12+ is Promise-based
    const schema = await parseSchema(cleanDocs, options);

    // Transform schema.fields array to Record<string, InferredSchemaField>
    const fieldsRecord = transformFields(schema.fields);

    logger.info("Schema inference complete", {
      fieldsInferred: Object.keys(fieldsRecord).length,
      documentCount: schema.count,
    });

    // Transform mongodb-schema output to our InferredSchema type
    const inferredSchema: InferredSchema = {
      count: schema.count || documents.length,
      fields: fieldsRecord,
    };

    return inferredSchema;
  } catch (error) {
    logger.error("Schema inference failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Helper to transform a single mongodb-schema field to InferredSchemaField
 */
function transformField(field: any): InferredSchemaField {
  // Extract lengths and nested fields from types, converting lengths to frequency distribution
  let lengthDistribution: Record<string, number> | undefined;
  let nestedFields: Record<string, InferredSchemaField> | undefined;

  for (const schemaType of field.types) {
    if (schemaType.name === "Array" && "lengths" in schemaType) {
      // Convert array of lengths to frequency distribution
      const lengths = schemaType.lengths as number[];
      if (lengths && lengths.length > 0) {
        lengthDistribution = calculateFrequencies(lengths);
      }
    }
    if (schemaType.name === "Document" && "fields" in schemaType) {
      nestedFields = transformFields(schemaType.fields);
    }
  }

  return {
    name: field.name,
    path: field.path.join("."),
    count: field.count,
    type: field.type,
    probability: field.probability,
    types: field.types.map((t: any) => {
      const values = t.values?.values
        ? Array.from(t.values.values())
        : undefined;

      // Calculate frequency distribution for potential enums (String/Number)
      // This enables detecting low-cardinality fields later in synthesis
      let valueDistribution: Record<string, number> | undefined;
      if (
        values &&
        values.length > 0 &&
        (t.name === "String" || t.name === "Number" || t.name === "Integer")
      ) {
        valueDistribution = calculateFrequencies(values as (string | number)[]);
      }

      return {
        name: t.name,
        probability: t.probability,
        unique: t.unique,
        values,
        valueDistribution,
        semanticType: t.semanticType, // Preserve if mongodb-schema detected it
      };
    }),
    lengthDistribution,
    fields: nestedFields,
  };
}

/**
 * Helper to transform mongodb-schema fields array to Record<string, InferredSchemaField>
 */
function transformFields(fields: any[]): Record<string, InferredSchemaField> {
  const record: Record<string, InferredSchemaField> = {};
  for (const field of fields) {
    const fieldName = field.path[field.path.length - 1] || field.name;
    record[fieldName] = transformField(field);
  }
  return record;
}

/**
 * Helper to transform mongodb-schema fields array to Record<string, InferredSchemaField>
 */

/**
 * Get array field paths from inferred schema
 * Returns map of field paths to their length frequency distributions
 */
export function getArrayFieldPaths(
  schema: InferredSchema,
): Map<string, Record<string, number>> {
  const arrayPaths = new Map<string, Record<string, number>>();
  const allPaths = extractFieldPaths(schema);

  for (const [path, field] of allPaths) {
    // Check if this field is an array type
    const hasArrayType = Array.isArray(field.type)
      ? field.type.includes("Array")
      : field.type === "Array";

    if (
      hasArrayType &&
      field.lengthDistribution &&
      Object.keys(field.lengthDistribution).length > 0
    ) {
      arrayPaths.set(path, field.lengthDistribution);
    }
  }

  logger.debug("Array fields extracted", {
    count: arrayPaths.size,
    paths: Array.from(arrayPaths.keys()),
  });

  return arrayPaths;
}

/**
 * Get field probability (presence rate) from inferred schema
 */
export function getFieldProbability(
  schema: InferredSchema,
  fieldPath: string,
): number {
  const allPaths = extractFieldPaths(schema);
  const field = allPaths.get(fieldPath);

  if (!field) {
    return 0;
  }

  return field.probability ?? field.count / schema.count;
}

/**
 * Check if field is required (probability >= threshold)
 */
export function isFieldRequired(
  schema: InferredSchema,
  fieldPath: string,
  threshold = 0.95,
): boolean {
  const probability = getFieldProbability(schema, fieldPath);
  return probability >= threshold;
}
