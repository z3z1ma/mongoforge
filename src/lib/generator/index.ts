/**
 * Generator module - synthetic document generation
 */

import { GenerationSchema, ConstraintsProfile, SyntheticDocument } from '../../types/data-model.js';
import { GeneratorOptions } from './types.js';
import { initializeFaker, generateMany } from './faker-engine.js';
import { registerCustomFormats } from './custom-formats.js';
import { createGeneratorStream } from './stream.js';
import { logger } from '../../utils/logger.js';
import { Readable } from 'stream';

export * from './types.js';
export * from './faker-engine.js';
export * from './custom-formats.js';
export * from './stream.js';

/**
 * Main generator class
 */
export class Generator {
  private schema: GenerationSchema;
  private constraints: ConstraintsProfile;
  private seed?: string | number;
  private initialized = false;

  constructor(options: GeneratorOptions) {
    this.schema = options.schema;
    this.constraints = options.constraints;
    this.seed = options.seed;
  }

  /**
   * Initialize the generator
   */
  private initialize(): void {
    if (this.initialized) return;

    // Initialize faker with seed
    initializeFaker(this.seed);

    // Register custom formats
    registerCustomFormats();

    this.initialized = true;
    logger.info('Generator initialized', { seed: this.seed });
  }

  /**
   * Generate documents (in-memory)
   */
  async generate(count?: number): Promise<SyntheticDocument[]> {
    this.initialize();

    const docCount = count || 100;
    logger.info('Generating documents', { count: docCount });

    const documents = await generateMany(this.schema, docCount);

    logger.info('Generation complete', { generated: documents.length });
    return documents as SyntheticDocument[];
  }

  /**
   * Create streaming generator
   */
  stream(count?: number, batchSize?: number): Readable {
    this.initialize();

    const docCount = count || 100;
    logger.info('Creating generator stream', { count: docCount, batchSize });

    return createGeneratorStream(this.schema, docCount, batchSize);
  }
}

/**
 * Convenience function for one-off generation
 */
export async function generateDocuments(
  schema: GenerationSchema,
  count: number,
  seed?: string | number
): Promise<SyntheticDocument[]> {
  const generator = new Generator({
    schema,
    constraints: {} as ConstraintsProfile, // Not used in basic generation
    seed,
    docCount: count,
  });

  return generator.generate(count);
}
