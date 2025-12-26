/**
 * Streaming document generation
 */

import { Readable } from 'stream';
import { GenerationSchema, SyntheticDocument } from '../../types/data-model.js';
import { generate, initializeFaker } from './faker-engine.js';
import { registerCustomFormats } from './custom-formats.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a readable stream that yields synthetic documents
 */
export class DocumentGeneratorStream extends Readable {
  private schema: GenerationSchema;
  private totalCount: number;
  private generatedCount: number;
  private batchSize: number;
  private initialized = false;
  private seed?: string | number;

  constructor(schema: GenerationSchema, count: number, batchSize = 100, seed?: string | number) {
    super({ objectMode: true });
    this.schema = schema;
    this.totalCount = count;
    this.generatedCount = 0;
    this.batchSize = batchSize;
    this.seed = seed;
  }

  /**
   * Initialize faker with seed (lazy initialization on first read)
   */
  private initialize(): void {
    if (this.initialized) return;

    // Initialize faker with seed
    initializeFaker(this.seed);

    // Register custom formats
    registerCustomFormats();

    this.initialized = true;
    logger.debug('DocumentGeneratorStream initialized', { seed: this.seed });
  }

  async _read(): Promise<void> {
    try {
      // Initialize on first read
      this.initialize();

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
  batchSize?: number,
  seed?: string | number
): Readable {
  return new DocumentGeneratorStream(schema, count, batchSize, seed);
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
