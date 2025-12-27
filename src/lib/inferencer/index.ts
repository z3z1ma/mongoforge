/**
 * Inferencer module - schema inference from normalized documents
 */

import { NormalizedDocument, InferredSchema } from '../../types/data-model.js';
import { InferencerOptions, InferencerResult } from './types.js';
import { inferSchema, extractFieldPaths, getArrayFieldPaths } from './mongodb-schema-wrapper.js';
import { logger } from '../../utils/logger.js';
import { analyzeObjectKeys, type ObjectKeysAnalysis } from './dynamic-key-detector.js';
import { DEFAULT_DYNAMIC_KEY_CONFIG, type DynamicKeyDetectionConfig } from '../../types/dynamic-keys.js';

export * from './types.js';
export * from './mongodb-schema-wrapper.js';
export * from './dynamic-key-detector.js';

/**
 * Default inferencer options
 */
const DEFAULT_OPTIONS: InferencerOptions = {
  semanticTypes: false,
  storeValues: false,
};

/**
 * Detect object fields with dynamic keys
 *
 * @param documents - Normalized documents to analyze
 * @param schema - Inferred schema
 * @param config - Dynamic key detection configuration
 * @returns Map of field paths to dynamic key analyses
 */
function detectDynamicKeyFields(
  documents: NormalizedDocument[],
  schema: InferredSchema,
  config: DynamicKeyDetectionConfig
): Map<string, ObjectKeysAnalysis> {
  const analyses = new Map<string, ObjectKeysAnalysis>();
  const fieldPaths = extractFieldPaths(schema);

  // Find object-type fields that might have dynamic keys
  for (const [path, field] of fieldPaths) {
    // Check if field is an object type
    const hasObjectType = Array.isArray(field.type)
      ? field.type.includes('Document')
      : field.type === 'Document';

    if (!hasObjectType) {
      continue;
    }

    // Analyze this object field for dynamic keys
    const analysis = analyzeObjectKeys(documents, path, config);

    if (analysis.isDynamic || analysis.detection) {
      analyses.set(path, analysis);
    }
  }

  return analyses;
}

/**
 * Infer schema from normalized documents
 */
export async function infer(
  documents: NormalizedDocument[],
  options: Partial<InferencerOptions> = {}
): Promise<InferredSchema> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info('Starting schema inference', {
    documentCount: documents.length,
    options: opts,
  });

  const schema = await inferSchema(documents, opts);

  logger.info('Schema inference complete', {
    fieldsDiscovered: Object.keys(schema.fields).length,
    documentCount: schema.count,
  });

  return schema;
}

/**
 * Main inferencer class
 */
export class Inferencer {
  private options: InferencerOptions;

  constructor(options: Partial<InferencerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async infer(documents: NormalizedDocument[]): Promise<InferencerResult> {
    const schema = await infer(documents, this.options);
    const fieldPaths = extractFieldPaths(schema);

    // Run dynamic key detection if enabled
    let dynamicKeyAnalyses: Map<string, ObjectKeysAnalysis> | undefined;
    let dynamicKeysDetected = 0;

    if (this.options.dynamicKeyDetection) {
      const config =
        typeof this.options.dynamicKeyDetection === 'boolean'
          ? DEFAULT_DYNAMIC_KEY_CONFIG
          : this.options.dynamicKeyDetection;

      logger.info('Running dynamic key detection', {
        threshold: config.threshold,
        patternsCount: config.patterns.length,
      });

      dynamicKeyAnalyses = detectDynamicKeyFields(documents, schema, config);
      dynamicKeysDetected = Array.from(dynamicKeyAnalyses.values()).filter(
        (a) => a.isDynamic
      ).length;

      logger.info('Dynamic key detection complete', {
        fieldsAnalyzed: dynamicKeyAnalyses.size,
        dynamicKeysDetected,
      });

      // Strip nested fields from dynamic key fields to prevent bloat in inferred.schema.json
      // For fields with dynamic keys, storing individual keys is wasteful - we only need the metadata
      // Keep fields as empty object {} so synthesizer condition passes, but remove individual keys
      if (dynamicKeysDetected > 0) {
        for (const [fieldPath, analysis] of dynamicKeyAnalyses) {
          if (analysis.isDynamic) {
            const field = fieldPaths.get(fieldPath);
            if (field && field.fields) {
              const removedCount = Object.keys(field.fields).length;
              field.fields = {}; // Empty object instead of delete - synthesizer needs this to exist
              logger.debug('Stripped nested fields from dynamic key field', {
                fieldPath,
                removedFieldsCount: removedCount,
                pattern: analysis.detection?.pattern,
              });
            }
          }
        }
        logger.info('Stripped nested fields from dynamic key fields', {
          dynamicFieldsProcessed: dynamicKeysDetected,
        });
      }
    }

    return {
      schema,
      metadata: {
        documentsAnalyzed: schema.count,
        fieldsDiscovered: fieldPaths.size,
        dynamicKeysDetected,
      },
      dynamicKeyAnalyses,
    };
  }
}
