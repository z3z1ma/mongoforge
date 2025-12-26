/**
 * Inferencer module - schema inference from normalized documents
 */

import { NormalizedDocument, InferredSchema } from '../../types/data-model.js';
import { InferencerOptions, InferencerResult } from './types.js';
import { inferSchema, extractFieldPaths, getArrayFieldPaths } from './mongodb-schema-wrapper.js';
import { logger } from '../../utils/logger.js';

export * from './types.js';
export * from './mongodb-schema-wrapper.js';

/**
 * Default inferencer options
 */
const DEFAULT_OPTIONS: InferencerOptions = {
  semanticTypes: false,
  storeValues: false,
};

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

    return {
      schema,
      metadata: {
        documentsAnalyzed: schema.count,
        fieldsDiscovered: fieldPaths.size,
      },
    };
  }
}
