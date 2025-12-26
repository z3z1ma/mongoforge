/**
 * MongoDB Schema wrapper - integrates mongodb-schema library for schema inference
 */

import parseSchema from 'mongodb-schema';
import { NormalizedDocument, InferredSchema, InferredSchemaField } from '../../types/data-model.js';
import { logger } from '../../utils/logger.js';

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
export function extractFieldPaths(schema: InferredSchema): Map<string, InferredSchemaField> {
  const paths = new Map<string, InferredSchemaField>();

  function traverse(fields: Record<string, InferredSchemaField>, parentPath = ''): void {
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
  options: InferOptions = {}
): Promise<InferredSchema> {
  logger.info('Inferring schema from normalized documents', {
    count: documents.length,
    semanticTypes: options.semanticTypes ?? false,
    storeValues: options.storeValues ?? false,
  });

  if (documents.length === 0) {
    throw new Error('Cannot infer schema from empty document array');
  }

  // Remove __typeHints metadata before passing to mongodb-schema
  const cleanDocs = documents.map((doc) => {
    const { __typeHints, ...cleanDoc } = doc;
    return cleanDoc;
  });

  // Convert to Promise-based API
  return new Promise((resolve, reject) => {
    parseSchema(cleanDocs, options, (error: Error | null, schema: any) => {
      if (error) {
        logger.error('Schema inference failed', { error: error.message });
        reject(error);
        return;
      }

      logger.info('Schema inference complete', {
        fieldsInferred: Object.keys(schema.fields || {}).length,
        documentCount: schema.count,
      });

      // Transform mongodb-schema output to our InferredSchema type
      const inferredSchema: InferredSchema = {
        count: schema.count || documents.length,
        fields: schema.fields || {},
      };

      resolve(inferredSchema);
    });
  });
}

/**
 * Get array field paths from inferred schema
 * Returns map of field paths to their observed lengths
 */
export function getArrayFieldPaths(schema: InferredSchema): Map<string, number[]> {
  const arrayPaths = new Map<string, number[]>();
  const allPaths = extractFieldPaths(schema);

  for (const [path, field] of allPaths) {
    // Check if this field is an array type
    const hasArrayType = Array.isArray(field.type)
      ? field.type.includes('Array')
      : field.type === 'Array';

    if (hasArrayType && field.lengths && field.lengths.length > 0) {
      arrayPaths.set(path, field.lengths);
    }
  }

  logger.debug('Array fields extracted', {
    count: arrayPaths.size,
    paths: Array.from(arrayPaths.keys()),
  });

  return arrayPaths;
}

/**
 * Get field probability (presence rate) from inferred schema
 */
export function getFieldProbability(schema: InferredSchema, fieldPath: string): number {
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
  threshold = 0.95
): boolean {
  const probability = getFieldProbability(schema, fieldPath);
  return probability >= threshold;
}
