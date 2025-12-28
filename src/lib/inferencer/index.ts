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

export * from "./types.js";
export * from "./mongodb-schema-wrapper.js";
export * from "./dynamic-key-detector.js";
export * from "./semantic-detectors.js";

/**
 * Default inferencer options
 */
const DEFAULT_OPTIONS: InferencerOptions = {
  semanticTypes: true,
  storeValues: false, // Not required for semantic type detection anymore (moved to profiler)
};

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
  return postProcessSchema(schema);
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
  return postProcessSchema(schema);
}

/**
 * Internal helper for schema post-processing (semantic types)
 */
function postProcessSchema(schema: InferredSchema): InferredSchema {
  // Semantic type detection is now handled by the Profiler (SemanticStatsAccumulator)
  // We no longer need to post-process the schema for semantic types here.

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

    // Dynamic key detection is now handled by the Profiler (DynamicKeyStatsAccumulator)
    // We no longer need to detect dynamic keys here or strip fields.

    return {
      schema,
      metadata: {
        documentsAnalyzed: schema.count,
        fieldsDiscovered: fieldPaths.size,
        dynamicKeysDetected: 0, // Handled by profiler
      },
    };
  }

  /**
   * Infer schema from a stream of documents
   */
  async inferStream(
    documents: AsyncIterable<NormalizedDocument>,
  ): Promise<InferencerResult> {
    const schema = await inferStream(documents, this.options);
    const fieldPaths = extractFieldPaths(schema);

    return {
      schema,
      metadata: {
        documentsAnalyzed: schema.count,
        fieldsDiscovered: fieldPaths.size,
        dynamicKeysDetected: 0, // Handled by profiler
      },
    };
  }
}
