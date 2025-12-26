/**
 * Streaming document generation
 */

import { Readable } from 'stream';
import { GenerationSchema, SyntheticDocument } from '../../types/data-model.js';
import { generate } from './faker-engine.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a readable stream that yields synthetic documents
 */
export class DocumentGeneratorStream extends Readable {
  private schema: GenerationSchema;
  private totalCount: number;
  private generatedCount: number;
  private batchSize: number;

  constructor(schema: GenerationSchema, count: number, batchSize = 100) {
    super({ objectMode: true });
    this.schema = schema;
    this.totalCount = count;
    this.generatedCount = 0;
    this.batchSize = batchSize;
  }

  async _read(): Promise<void> {
    try {
      if (this.generatedCount >= this.totalCount) {
        this.push(null); // End stream
        return;
      }

      // Generate batch
      const remaining = this.totalCount - this.generatedCount;
      const count = Math.min(this.batchSize, remaining);

      for (let i = 0; i < count; i++) {
        const doc = await generate(this.schema);
        this.push(doc);
        this.generatedCount++;
      }

      if (this.generatedCount % 1000 === 0) {
        logger.debug('Generated documents', { count: this.generatedCount });
      }
    } catch (error) {
      this.destroy(error as Error);
    }
  }
}

/**
 * Create document generator stream
 */
export function createGeneratorStream(
  schema: GenerationSchema,
  count: number,
  batchSize?: number
): Readable {
  return new DocumentGeneratorStream(schema, count, batchSize);
}

/**
 * Generate documents as async iterable
 */
export async function* generateDocuments(
  schema: GenerationSchema,
  count: number
): AsyncGenerator<SyntheticDocument> {
  for (let i = 0; i < count; i++) {
    const doc = (await generate(schema)) as SyntheticDocument;
    yield doc;

    if ((i + 1) % 1000 === 0) {
      logger.debug('Generated documents', { count: i + 1 });
    }
  }
}
