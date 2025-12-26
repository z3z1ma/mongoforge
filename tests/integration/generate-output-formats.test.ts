/**
 * Generate Command Output Format Tests
 * Verifies --output-format flag controls JSON vs NDJSON output
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { createGeneratorStream } from '../../src/lib/generator/stream.js';
import { createNDJSONWriter } from '../../src/lib/emitter/ndjson-writer.js';
import { createJSONWriter } from '../../src/lib/emitter/json-writer.js';
import type { GenerationSchema } from '../../src/types/data-model.js';

describe('Generate Command - Output Formats', () => {
  const testSchema: GenerationSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      _id: { type: 'string', minLength: 10, maxLength: 20 },
      name: { type: 'string', minLength: 3, maxLength: 20 },
      age: { type: 'integer', minimum: 18, maximum: 100 },
    },
    required: ['_id', 'name', 'age'],
  };

  it('should output NDJSON format when format is ndjson', async () => {
    const docCount = 5;
    const documentStream = createGeneratorStream(testSchema, docCount, 5);
    const formatWriter = createNDJSONWriter();

    const chunks: string[] = [];
    for await (const chunk of documentStream.pipe(formatWriter)) {
      chunks.push(chunk);
    }

    const output = chunks.join('');

    // Each line should be valid JSON
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(docCount);

    for (const line of lines) {
      const doc = JSON.parse(line);
      expect(doc).toHaveProperty('_id');
      expect(doc).toHaveProperty('name');
      expect(doc).toHaveProperty('age');
    }

    // Should NOT be a JSON array
    expect(output).not.toContain('[\n');
    expect(output).not.toContain('\n]');
  });

  it('should output JSON array format when format is json', async () => {
    const docCount = 5;
    const documentStream = createGeneratorStream(testSchema, docCount, 5);
    const formatWriter = createJSONWriter();

    const chunks: string[] = [];
    for await (const chunk of documentStream.pipe(formatWriter)) {
      chunks.push(chunk);
    }

    const output = chunks.join('');

    // Should be a valid JSON array
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(docCount);

    // Verify each document
    for (const doc of parsed) {
      expect(doc).toHaveProperty('_id');
      expect(doc).toHaveProperty('name');
      expect(doc).toHaveProperty('age');
    }

    // Should have array formatting
    expect(output).toContain('[\n');
    expect(output).toContain('\n]');
  });

  it('should produce different output for JSON vs NDJSON', async () => {
    const seed = 'test-format-comparison';
    const docCount = 3;

    // Generate NDJSON
    const ndjsonStream = createGeneratorStream(testSchema, docCount, 5, seed);
    const ndjsonWriter = createNDJSONWriter();

    const ndjsonChunks: string[] = [];
    for await (const chunk of ndjsonStream.pipe(ndjsonWriter)) {
      ndjsonChunks.push(chunk);
    }
    const ndjsonOutput = ndjsonChunks.join('');

    // Generate JSON with same seed
    const jsonStream = createGeneratorStream(testSchema, docCount, 5, seed);
    const jsonWriter = createJSONWriter();

    const jsonChunks: string[] = [];
    for await (const chunk of jsonStream.pipe(jsonWriter)) {
      jsonChunks.push(chunk);
    }
    const jsonOutput = jsonChunks.join('');

    // Outputs should be different (different formatting)
    expect(jsonOutput).not.toBe(ndjsonOutput);

    // But should contain same data
    const ndjsonDocs = ndjsonOutput.trim().split('\n').map((line) => JSON.parse(line));
    const jsonDocs = JSON.parse(jsonOutput);

    expect(jsonDocs).toEqual(ndjsonDocs);
  });
});
