/**
 * Streaming document generation
 */

import { Readable } from "stream";
import { GenerationSchema, SyntheticDocument } from "../../types/data-model.js";
import { generate, initializeFaker } from "./faker-engine.js";
import { registerCustomFormats } from "./custom-formats.js";
import { logger } from "../../utils/logger.js";
import { countDynamicKeySchemas } from "./schema-preprocessor.js";

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

  // Performance optimizations
  private hasDynamicKeys = false;
  private hasDistributions = false;

  constructor(
    schema: GenerationSchema,
    count: number,
    batchSize = 100,
    seed?: string | number,
  ) {
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

    // Precompute performance optimization flags
    this.hasDynamicKeys = countDynamicKeySchemas(this.schema) > 0;
    this.hasDistributions = this.checkForDistributions(this.schema);

    this.initialized = true;
    logger.debug("DocumentGeneratorStream initialized", {
      seed: this.seed,
      hasDynamicKeys: this.hasDynamicKeys,
      hasDistributions: this.hasDistributions,
    });
  }

  /**
   * Deeply check if schema contains x-array-length-distribution annotations
   */
  private checkForDistributions(schema: any, depth = 0): boolean {
    // Prevent infinite recursion on circular schemas, but allow deep valid ones
    if (depth > 100) return false;

    if (!schema || typeof schema !== "object") return false;

    if (schema["x-array-length-distribution"]) return true;

    // Check for _id field as well, since we want to apply overrides to it
    if (schema.properties?._id) return true;

    if (schema.properties) {
      for (const prop of Object.values(schema.properties)) {
        if (this.checkForDistributions(prop, depth + 1)) return true;
      }
    }

    if (schema.items) {
      if (Array.isArray(schema.items)) {
        for (const item of schema.items) {
          if (this.checkForDistributions(item, depth + 1)) return true;
        }
      } else {
        if (this.checkForDistributions(schema.items, depth + 1)) return true;
      }
    }

    return false;
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
        // Yield event loop every batch to prevent starvation
        if (i > 0 && i % 100 === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        // Pass precomputed flags to generate() for optimization
        const doc = await generate(this.schema, {
          hasDynamicKeys: this.hasDynamicKeys,
          hasDistributions: this.hasDistributions,
        });
        this.push(doc);
        this.generatedCount++;
      }

      if (this.generatedCount % 1000 === 0) {
        logger.debug("Generated documents", { count: this.generatedCount });
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
  seed?: string | number,
): Readable {
  return new DocumentGeneratorStream(schema, count, batchSize, seed);
}

/**
 * Generate documents as async iterable
 */
export async function* generateDocuments(
  schema: GenerationSchema,
  count: number,
): AsyncGenerator<SyntheticDocument> {
  for (let i = 0; i < count; i++) {
    // Yield event loop periodically
    if (i > 0 && i % 100 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const doc = (await generate(schema)) as SyntheticDocument;
    yield doc;

    if ((i + 1) % 1000 === 0) {
      logger.debug("Generated documents", { count: i + 1 });
    }
  }
}
