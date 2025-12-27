/**
 * Inferencer module - schema inference from normalized documents
 */

import { NormalizedDocument, InferredSchema } from "../../types/data-model.js";
import { InferencerOptions, InferencerResult } from "./types.js";
import {
  inferSchema,
  inferSchemaStream,
  extractFieldPaths,
} from "./mongodb-schema-wrapper.js";
import { logger } from "../../utils/logger.js";
import {
  analyzeObjectKeys,
  type ObjectKeysAnalysis,
} from "./dynamic-key-detector.js";
import {
  DEFAULT_DYNAMIC_KEY_CONFIG,
  type DynamicKeyDetectionConfig,
} from "../../types/dynamic-keys.js";
import { applySemanticTypes, BUILTIN_DETECTORS } from "./semantic-detectors.js";

export * from "./types.js";
export * from "./mongodb-schema-wrapper.js";
export * from "./dynamic-key-detector.js";
export * from "./semantic-detectors.js";

/**
 * Default inferencer options
 */
const DEFAULT_OPTIONS: InferencerOptions = {
  semanticTypes: true,
  storeValues: true, // Required for semantic type detection
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
  config: DynamicKeyDetectionConfig,
): Map<string, ObjectKeysAnalysis> {
  const analyses = new Map<string, ObjectKeysAnalysis>();
  const fieldPaths = extractFieldPaths(schema);

  // Sort paths by depth (shallowest first) so we can skip nested paths of dynamic fields
  const sortedPaths = Array.from(fieldPaths.entries()).sort(
    (a, b) => a[0].split(".").length - b[0].split(".").length,
  );

  const dynamicPaths: string[] = [];

  // Find object-type fields that might have dynamic keys
  for (const [path, field] of sortedPaths) {
    // Skip if path is nested under an already detected dynamic field
    // (Nested dynamic keys are handled recursively within analyzeObjectKeys)
    if (dynamicPaths.some((dp) => path === dp || path.startsWith(dp + "."))) {
      continue;
    }

    // Check if field is an object type
    const hasObjectType = Array.isArray(field.type)
      ? field.type.includes("Document")
      : field.type === "Document";

    if (!hasObjectType) {
      continue;
    }

    // Analyze this object field for dynamic keys
    const analysis = analyzeObjectKeys(documents, path, config);

    if (analysis.isDynamic || analysis.detection) {
      analyses.set(path, analysis);
      if (analysis.isDynamic) {
        dynamicPaths.push(path);
      }
    }
  }

  return analyses;
}

/**
 * Infer schema from normalized documents
 */
export async function infer(
  documents: NormalizedDocument[],
  options: Partial<InferencerOptions> = {},
): Promise<InferredSchema> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info("Starting schema inference", {
    documentCount: documents.length,
    options: opts,
  });

  const schema = await inferSchema(documents, opts);
  return postProcessSchema(schema, opts);
}

/**
 * Infer schema from a stream of normalized documents
 */
export async function inferStream(
  documents: AsyncIterable<NormalizedDocument>,
  options: Partial<InferencerOptions> = {},
): Promise<InferredSchema> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logger.info("Starting schema stream inference", {
    options: opts,
  });

  const schema = await inferSchemaStream(documents, opts);
  return postProcessSchema(schema, opts);
}

/**
 * Internal helper for schema post-processing (semantic types)
 */
function postProcessSchema(
  schema: InferredSchema,
  opts: InferencerOptions,
): InferredSchema {
  // Apply semantic type detection if enabled
  if (opts.semanticTypes) {
    let semanticTypesDetected = 0;

    // Recursively apply semantic types to all fields
    function applyToAllFields(fields: Record<string, any>) {
      for (const [_fieldName, field] of Object.entries(fields)) {
        applySemanticTypes(field, BUILTIN_DETECTORS);

        // Check if semantic type was detected
        if (field.types) {
          const stringType = field.types.find((t: any) => t.name === "String");
          if (stringType?.semanticType) {
            semanticTypesDetected++;
            logger.debug("Semantic type detected", {
              fieldPath: field.path,
              semanticType: stringType.semanticType,
              confidence: stringType.semanticConfidence,
            });
          }
        }

        // Recurse into nested fields
        if (field.fields) {
          applyToAllFields(field.fields);
        }
      }
    }

    applyToAllFields(schema.fields);

    if (semanticTypesDetected > 0) {
      logger.info("Semantic type detection complete", {
        typesDetected: semanticTypesDetected,
      });
    }
  }

  logger.info("Schema inference post-processing complete", {
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
        typeof this.options.dynamicKeyDetection === "boolean"
          ? DEFAULT_DYNAMIC_KEY_CONFIG
          : this.options.dynamicKeyDetection;

      logger.info("Running dynamic key detection", {
        threshold: config.threshold,
        patternsCount: config.patterns.length,
      });

      dynamicKeyAnalyses = detectDynamicKeyFields(documents, schema, config);
      dynamicKeysDetected = Array.from(dynamicKeyAnalyses.values()).filter(
        (a) => a.isDynamic,
      ).length;

      logger.info("Dynamic key detection complete", {
        fieldsAnalyzed: dynamicKeyAnalyses.size,
        dynamicKeysDetected,
      });

      // Strip nested fields from dynamic key fields to prevent bloat in inferred.schema.json
      if (dynamicKeysDetected > 0) {
        this.stripDynamicFields(fieldPaths, dynamicKeyAnalyses);
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

  /**
   * Infer schema from a stream of documents
   * Note: dynamic key detection currently requires all documents in memory
   * and will be skipped with a warning if used with inferStream.
   */
  async inferStream(
    documents: AsyncIterable<NormalizedDocument>,
  ): Promise<InferencerResult> {
    const schema = await inferStream(documents, this.options);
    const fieldPaths = extractFieldPaths(schema);

    if (this.options.dynamicKeyDetection) {
      logger.warn(
        "Dynamic key detection is currently not supported in streaming mode and will be skipped.",
      );
    }

    return {
      schema,
      metadata: {
        documentsAnalyzed: schema.count,
        fieldsDiscovered: fieldPaths.size,
        dynamicKeysDetected: 0,
      },
    };
  }

  private stripDynamicFields(
    fieldPaths: Map<string, any>,
    dynamicKeyAnalyses: Map<string, ObjectKeysAnalysis>,
  ) {
    for (const [fieldPath, analysis] of dynamicKeyAnalyses) {
      if (analysis.isDynamic) {
        const field = fieldPaths.get(fieldPath);
        if (field && field.fields) {
          field.fields = {};
          logger.debug("Stripped nested fields from dynamic key field", {
            fieldPath,
            pattern: analysis.detection?.pattern,
          });
        }
      }
    }
  }
}
