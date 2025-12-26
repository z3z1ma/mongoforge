/**
 * Generate Command NDJSON Output Tests
 * Verifies that generate command correctly serializes objects to NDJSON
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { createGeneratorStream } from '../../src/lib/generator/stream.js';
import { createNDJSONWriter } from '../../src/lib/emitter/ndjson-writer.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import type { GenerationSchema } from '../../src/types/data-model.js';

const pipelineAsync = promisify(pipeline);

describe('Generate Command - NDJSON Output', () => {
  const testOutputDir = join(process.cwd(), 'tests', 'integration', 'output', 'ndjson-test');
  const testOutputFile = join(testOutputDir, 'test-output.ndjson');

  const testSchema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      _id: { type: 'string', minLength: 10, maxLength: 20 },
      name: { type: 'string', minLength: 3, maxLength: 20 },
      age: { type: 'integer', minimum: 18, maximum: 100 },
      active: { type: 'boolean' },
    },
    required: ['_id', 'name', 'age', 'active'],
  };

  beforeAll(async () => {
    await mkdir(testOutputDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await unlink(testOutputFile);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should serialize object stream to NDJSON file', async () => {
    const docCount = 10;

    // Create generator stream (object mode)
    const generatorStream = createGeneratorStream(testSchema, docCount, 5);

    // Create NDJSON writer (converts objects to strings)
    const ndjsonWriter = createNDJSONWriter();

    // Create file output stream
    const outputStream = createWriteStream(testOutputFile);

    // Pipeline: objects -> NDJSON strings -> file
    await pipelineAsync(generatorStream, ndjsonWriter, outputStream);

    // Verify file was created and has correct content
    const fileContent = await readFile(testOutputFile, 'utf-8');
    const lines = fileContent.trim().split('\n');

    expect(lines).toHaveLength(docCount);

    // Verify each line is valid JSON
    const parsedDocs = lines.map((line) => JSON.parse(line));

    expect(parsedDocs).toHaveLength(docCount);

    // Verify schema conformance
    parsedDocs.forEach((doc) => {
      expect(doc).toHaveProperty('_id');
      expect(doc).toHaveProperty('name');
      expect(doc).toHaveProperty('age');
      expect(doc).toHaveProperty('active');

      expect(typeof doc._id).toBe('string');
      expect(typeof doc.name).toBe('string');
      expect(typeof doc.age).toBe('number');
      expect(typeof doc.active).toBe('boolean');

      expect(doc.age).toBeGreaterThanOrEqual(18);
      expect(doc.age).toBeLessThanOrEqual(100);
    });
  });

  it('should handle streaming to process.stdout', async () => {
    const docCount = 5;
    const chunks: string[] = [];

    // Mock stdout to capture output
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      chunks.push(chunk.toString());
      return true;
    }) as any;

    try {
      const generatorStream = createGeneratorStream(testSchema, docCount, 5);
      const ndjsonWriter = createNDJSONWriter();

      await pipelineAsync(generatorStream, ndjsonWriter, process.stdout);

      // Verify captured output
      const fullOutput = chunks.join('');
      const lines = fullOutput.trim().split('\n');

      expect(lines.length).toBeGreaterThanOrEqual(docCount);

      // Verify each line is valid JSON (ignore any extra output)
      const jsonLines = lines.filter((line) => line.trim().startsWith('{'));
      expect(jsonLines).toHaveLength(docCount);

      jsonLines.forEach((line) => {
        const doc = JSON.parse(line);
        expect(doc).toHaveProperty('_id');
        expect(doc).toHaveProperty('name');
      });
    } finally {
      // Restore stdout
      process.stdout.write = originalWrite;
    }
  });

  it('should not throw ERR_INVALID_ARG_TYPE when piping', async () => {
    const docCount = 5;

    // This test verifies the bug is fixed - should NOT throw ERR_INVALID_ARG_TYPE
    const generatorStream = createGeneratorStream(testSchema, docCount, 5);
    const ndjsonWriter = createNDJSONWriter();
    const outputStream = createWriteStream(testOutputFile);

    // This should NOT throw
    await expect(pipelineAsync(generatorStream, ndjsonWriter, outputStream)).resolves.toBeUndefined();

    // Verify file was created
    const fileContent = await readFile(testOutputFile, 'utf-8');
    expect(fileContent).toBeTruthy();
  });
});
