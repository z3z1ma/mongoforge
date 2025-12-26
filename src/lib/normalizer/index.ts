/**
 * Normalizer module - converts BSON types to JSON Schema compatible representations
 */

import { SampleDocument, NormalizedDocument, TypeHint } from '../../types/data-model.js';
import { NormalizerOptions, NormalizerResult } from './types.js';
import { mapDocument } from './type-mappers.js';
import { logger } from '../../utils/logger.js';

export * from './types.js';
export * from './type-mappers.js';

/**
 * Normalize a single sample document
 */
export function normalizeDocument(doc: SampleDocument): NormalizedDocument {
  // Extract metadata before normalization
  const { __metadata, ...docWithoutMeta } = doc;

  // Map BSON types to JSON Schema types
  const { doc: normalized, hints } = mapDocument(docWithoutMeta);

  return {
    ...normalized,
    __typeHints: hints,
  } as NormalizedDocument;
}

/**
 * Normalize an array of sample documents
 */
export function normalizeDocuments(
  documents: SampleDocument[],
  options: NormalizerOptions = {}
): NormalizerResult {
  logger.info('Normalizing documents', { count: documents.length });

  const normalized: NormalizedDocument[] = [];
  const allTypeHints = new Map<string, TypeHint>();

  for (const doc of documents) {
    const normalizedDoc = normalizeDocument(doc);
    normalized.push(normalizedDoc);

    // Collect all type hints
    for (const [path, hint] of Object.entries(normalizedDoc.__typeHints)) {
      if (!allTypeHints.has(path)) {
        allTypeHints.set(path, hint);
      }
    }
  }

  logger.info('Normalization complete', {
    documentsNormalized: normalized.length,
    uniqueTypeHints: allTypeHints.size,
  });

  return {
    documents: normalized,
    typeHints: allTypeHints,
  };
}

/**
 * Main normalizer class
 */
export class Normalizer {
  private options: NormalizerOptions;

  constructor(options: NormalizerOptions = {}) {
    this.options = options;
  }

  normalize(documents: SampleDocument[]): NormalizerResult {
    return normalizeDocuments(documents, this.options);
  }
}
