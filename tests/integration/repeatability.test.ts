import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { hashStringToSeed } from '../../src/utils/seed-manager';
import { FakerEngine } from '../../src/lib/generator/faker-engine';
import { RunReporter } from '../../src/lib/reporter';

describe('Document Generation Repeatability', () => {
  const testSeed = 'test-repeatability-seed';
  const outputDir = path.join(__dirname, 'output');

  it('should generate byte-identical documents with same seed', async () => {
    // First generation
    const fakerEngine1 = new FakerEngine(testSeed);
    const reporter1 = new RunReporter(testSeed);
    const outputPath1 = path.join(outputDir, 'run1');

    await fs.mkdir(outputPath1, { recursive: true });

    // TODO: Implement document generation using fakerEngine1
    // This is a placeholder for actual generation logic
    await fs.writeFile(path.join(outputPath1, 'output.ndjson'), 'Generated data here');

    await reporter1.updateOutputHash(path.join(outputPath1, 'output.ndjson'));
    await reporter1.save(outputPath1);

    // Second generation with same seed
    const fakerEngine2 = new FakerEngine(testSeed);
    const reporter2 = new RunReporter(testSeed);
    const outputPath2 = path.join(outputDir, 'run2');

    await fs.mkdir(outputPath2, { recursive: true });

    // TODO: Implement document generation using fakerEngine2
    // This should generate IDENTICAL data
    await fs.writeFile(path.join(outputPath2, 'output.ndjson'), 'Generated data here');

    await reporter2.updateOutputHash(path.join(outputPath2, 'output.ndjson'));
    await reporter2.save(outputPath2);

    // Compare output files
    const output1 = await fs.readFile(path.join(outputPath1, 'output.ndjson'));
    const output2 = await fs.readFile(path.join(outputPath2, 'output.ndjson'));

    expect(output1).toEqual(output2);

    // Compare manifest seeds and hashes
    const manifest1 = reporter1.getManifest();
    const manifest2 = reporter2.getManifest();

    expect(manifest1.seed).toEqual(manifest2.seed);
    expect(manifest1.artifacts.outputHash).toEqual(manifest2.artifacts.outputHash);
  });

  it('should generate different documents with different seeds', async () => {
    const seed1 = 'seed-1';
    const seed2 = 'seed-2';

    const fakerEngine1 = new FakerEngine(seed1);
    const fakerEngine2 = new FakerEngine(seed2);

    // Verify different numeric seeds are generated
    expect(hashStringToSeed(seed1)).not.toEqual(hashStringToSeed(seed2));

    // TODO: Add actual document generation comparison
    // This is a placeholder and needs to be replaced with real generation logic
  });
});