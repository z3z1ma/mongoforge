/**
 * Normalizer module - converts BSON types to JSON Schema compatible representations
 */

import {
  SampleDocument,
  NormalizedDocument,
  TypeHint,
} from "../../types/data-model.js";
import { NormalizerOptions, NormalizerResult } from "./types.js";
import { mapDocument } from "./type-mappers.js";
import { logger } from "../../utils/logger.js";

export * from "./types.js";
export * from "./type-mappers.js";

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
  _options: NormalizerOptions = {},
): NormalizerResult {
  logger.info("Normalizing documents", { count: documents.length });

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

  logger.info("Normalization complete", {
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
  private collectedTypeHints = new Map<string, TypeHint>();

  constructor(options: NormalizerOptions = {}) {
    this.options = options;
  }

  normalize(documents: SampleDocument[]): NormalizerResult {
    const result = normalizeDocuments(documents, this.options);
    // Sync collected hints for consistency
    for (const [path, hint] of result.typeHints.entries()) {
      this.collectedTypeHints.set(path, hint);
    }
    return result;
  }

  /**
   * Normalize an async stream of documents
   */
  async *normalizeStream(
    documents: AsyncIterable<SampleDocument>,
  ): AsyncIterableIterator<NormalizedDocument> {
    for await (const doc of documents) {
      const normalizedDoc = normalizeDocument(doc);

      // Collect type hints on the fly
      for (const [path, hint] of Object.entries(normalizedDoc.__typeHints)) {
        if (!this.collectedTypeHints.has(path)) {
          this.collectedTypeHints.set(path, hint);
        }
      }

      yield normalizedDoc;
    }
  }

  /**
   * Get type hints collected during streaming
   */
  getTypeHints(): Map<string, TypeHint> {
    return this.collectedTypeHints;
  }
}
