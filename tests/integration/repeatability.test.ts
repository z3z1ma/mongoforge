import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { hashStringToSeed } from '../../src/utils/seed-manager';
import { initializeFaker, generateMany, resetSeed } from '../../src/lib/generator/faker-engine';
import { registerCustomFormats } from '../../src/lib/generator/custom-formats';
import { RunReporter } from '../../src/lib/reporter';
import type { GenerationSchema } from '../../src/types';

describe('Document Generation Repeatability', () => {
  const testSeed = 'test-repeatability-seed';
  const outputDir = path.join(__dirname, 'output');

  const testSchema: GenerationSchema = {
    type: 'object',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      name: { type: 'string' },
      age: { type: 'number', minimum: 18, maximum: 80 },
      tags: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: { type: 'string' },
      },
    },
    required: ['_id', 'name'],
  };

  beforeAll(() => {
    registerCustomFormats();
  });

  it('should generate byte-identical documents with same seed', async () => {
    // First generation
    initializeFaker(testSeed);
    const docs1 = await generateMany(testSchema, 10);
    const reporter1 = new RunReporter(testSeed);
    const outputPath1 = path.join(outputDir, 'run1');

    await fs.mkdir(outputPath1, { recursive: true });
    const output1Content = docs1.map((doc) => JSON.stringify(doc)).join('\n');
    await fs.writeFile(path.join(outputPath1, 'output.ndjson'), output1Content);

    await reporter1.updateOutputHash(path.join(outputPath1, 'output.ndjson'));
    await reporter1.save(outputPath1);

    // Second generation with same seed
    resetSeed(testSeed);
    initializeFaker(testSeed);
    const docs2 = await generateMany(testSchema, 10);
    const reporter2 = new RunReporter(testSeed);
    const outputPath2 = path.join(outputDir, 'run2');

    await fs.mkdir(outputPath2, { recursive: true });
    const output2Content = docs2.map((doc) => JSON.stringify(doc)).join('\n');
    await fs.writeFile(path.join(outputPath2, 'output.ndjson'), output2Content);

    await reporter2.updateOutputHash(path.join(outputPath2, 'output.ndjson'));
    await reporter2.save(outputPath2);

    // Compare documents directly
    expect(docs1).toEqual(docs2);

    // Compare output files
    expect(output1Content).toEqual(output2Content);

    // Compare manifest seeds and hashes
    const manifest1 = reporter1.getManifest();
    const manifest2 = reporter2.getManifest();

    expect(manifest1.seed).toEqual(manifest2.seed);
    expect(manifest1.artifacts.outputHash).toEqual(manifest2.artifacts.outputHash);
  });

  it('should generate different documents with different seeds', async () => {
    const seed1 = 'seed-1';
    const seed2 = 'seed-2';

    // Verify different numeric seeds are generated
    expect(hashStringToSeed(seed1)).not.toEqual(hashStringToSeed(seed2));

    // Generate with first seed
    initializeFaker(seed1);
    const docs1 = await generateMany(testSchema, 5);

    // Generate with second seed
    resetSeed(seed2);
    initializeFaker(seed2);
    const docs2 = await generateMany(testSchema, 5);

    // Documents should be different
    expect(docs1).not.toEqual(docs2);
  });
});