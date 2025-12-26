/**
 * Generate Command Seed Determinism Tests
 * Verifies that --seed flag produces deterministic, repeatable output
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { createGeneratorStream } from '../../src/lib/generator/stream.js';
import type { GenerationSchema } from '../../src/types/data-model.js';

describe('Generate Command - Seed Determinism', () => {
  const testSchema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      _id: { type: 'string', minLength: 10, maxLength: 20 },
      name: { type: 'string', minLength: 3, maxLength: 20 },
      age: { type: 'integer', minimum: 18, maximum: 100 },
      score: { type: 'number', minimum: 0, maximum: 100 },
    },
    required: ['_id', 'name', 'age', 'score'],
  };

  it('should generate identical documents with same seed', async () => {
    const seed = 'test-determinism-seed';
    const docCount = 10;

    // First generation with seed
    const docs1 = await consumeStream(createGeneratorStream(testSchema, docCount, 5, seed));

    // Second generation with same seed
    const docs2 = await consumeStream(createGeneratorStream(testSchema, docCount, 5, seed));

    // Documents should be identical
    expect(docs1).toHaveLength(docCount);
    expect(docs2).toHaveLength(docCount);

    for (let i = 0; i < docCount; i++) {
      expect(docs1[i]).toEqual(docs2[i]);
    }
  });

  it('should generate different documents with different seeds', async () => {
    const seed1 = 'seed-alpha';
    const seed2 = 'seed-beta';
    const docCount = 10;

    // First generation
    const docs1 = await consumeStream(createGeneratorStream(testSchema, docCount, 5, seed1));

    // Second generation with different seed
    const docs2 = await consumeStream(createGeneratorStream(testSchema, docCount, 5, seed2));

    // Documents should be different
    expect(docs1).toHaveLength(docCount);
    expect(docs2).toHaveLength(docCount);

    // At least some documents should differ
    let differenceCount = 0;
    for (let i = 0; i < docCount; i++) {
      if (JSON.stringify(docs1[i]) !== JSON.stringify(docs2[i])) {
        differenceCount++;
      }
    }

    expect(differenceCount).toBeGreaterThan(0);
  });

  it('should generate different documents without seed (non-deterministic)', async () => {
    const docCount = 10;

    // First generation without seed
    const docs1 = await consumeStream(createGeneratorStream(testSchema, docCount, 5));

    // Second generation without seed
    const docs2 = await consumeStream(createGeneratorStream(testSchema, docCount, 5));

    // Documents should be different (high probability)
    expect(docs1).toHaveLength(docCount);
    expect(docs2).toHaveLength(docCount);

    // At least some documents should differ
    let differenceCount = 0;
    for (let i = 0; i < docCount; i++) {
      if (JSON.stringify(docs1[i]) !== JSON.stringify(docs2[i])) {
        differenceCount++;
      }
    }

    // Expect most documents to be different (non-deterministic)
    expect(differenceCount).toBeGreaterThan(0);
  });

  it('should work with numeric seed', async () => {
    const seed = 12345;
    const docCount = 5;

    // First generation with numeric seed
    const docs1 = await consumeStream(createGeneratorStream(testSchema, docCount, 5, seed));

    // Second generation with same numeric seed
    const docs2 = await consumeStream(createGeneratorStream(testSchema, docCount, 5, seed));

    // Documents should be identical
    expect(docs1).toHaveLength(docCount);
    expect(docs2).toHaveLength(docCount);

    for (let i = 0; i < docCount; i++) {
      expect(docs1[i]).toEqual(docs2[i]);
    }
  });
});

/**
 * Helper to consume a readable stream and return all documents
 */
async function consumeStream(stream: Readable): Promise<any[]> {
  const docs: any[] = [];

  for await (const doc of stream) {
    docs.push(doc);
  }

  return docs;
}
