/**
 * JSON Array Writer Tests
 * Verifies JSON array format output
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { createJSONWriter } from '../../../src/lib/emitter/json-writer.js';

describe('JSON Array Writer', () => {
  it('should convert object stream to JSON array format', async () => {
    const objects = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ];

    const objectStream = Readable.from(objects);
    const jsonWriter = createJSONWriter();

    const chunks: string[] = [];
    for await (const chunk of objectStream.pipe(jsonWriter)) {
      chunks.push(chunk);
    }

    const output = chunks.join('');

    // Should be valid JSON array
    const parsed = JSON.parse(output);
    expect(parsed).toEqual(objects);

    // Should have proper formatting
    expect(output).toContain('[\n');
    expect(output).toContain('\n]');
    expect(output).toContain(',\n');
  });

  it('should handle empty stream', async () => {
    const objectStream = Readable.from([]);
    const jsonWriter = createJSONWriter();

    const chunks: string[] = [];
    for await (const chunk of objectStream.pipe(jsonWriter)) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    const parsed = JSON.parse(output);

    expect(parsed).toEqual([]);
    expect(output).toBe('[\n\n]\n');
  });

  it('should handle single object', async () => {
    const objects = [{ id: 1, name: 'Solo' }];

    const objectStream = Readable.from(objects);
    const jsonWriter = createJSONWriter();

    const chunks: string[] = [];
    for await (const chunk of objectStream.pipe(jsonWriter)) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    const parsed = JSON.parse(output);

    expect(parsed).toEqual(objects);
    expect(output).not.toContain(',\n'); // No comma for single item
  });

  it('should handle complex nested objects', async () => {
    const objects = [
      {
        id: 1,
        nested: { a: 1, b: [1, 2, 3] },
        tags: ['foo', 'bar'],
      },
      {
        id: 2,
        nested: { c: 'test', d: { deep: true } },
        tags: [],
      },
    ];

    const objectStream = Readable.from(objects);
    const jsonWriter = createJSONWriter();

    const chunks: string[] = [];
    for await (const chunk of objectStream.pipe(jsonWriter)) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    const parsed = JSON.parse(output);

    expect(parsed).toEqual(objects);
  });

  it('should handle serialization errors gracefully', async () => {
    const circular: any = { id: 1 };
    circular.self = circular; // Create circular reference

    const objectStream = Readable.from([circular]);
    const jsonWriter = createJSONWriter();

    await expect(async () => {
      const chunks: string[] = [];
      for await (const chunk of objectStream.pipe(jsonWriter)) {
        chunks.push(chunk);
      }
    }).rejects.toThrow();
  });
});
