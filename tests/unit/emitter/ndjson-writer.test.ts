/**
 * NDJSON Writer Tests
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { createNDJSONWriter } from '../../../src/lib/emitter/ndjson-writer.js';

describe('NDJSONWriter', () => {
  it('should convert object stream to NDJSON strings', async () => {
    const objects = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ];

    // Create object-mode readable stream
    const objectStream = Readable.from(objects, { objectMode: true });
    const ndjsonWriter = createNDJSONWriter();

    const chunks: string[] = [];

    // Collect output chunks
    ndjsonWriter.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });

    await new Promise<void>((resolve, reject) => {
      ndjsonWriter.on('end', resolve);
      ndjsonWriter.on('error', reject);
      objectStream.pipe(ndjsonWriter);
    });

    // Verify each chunk is a valid NDJSON line
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toBe('{"id":1,"name":"Alice"}\n');
    expect(chunks[1]).toBe('{"id":2,"name":"Bob"}\n');
    expect(chunks[2]).toBe('{"id":3,"name":"Charlie"}\n');

    // Verify we can parse each line
    chunks.forEach((chunk) => {
      const line = chunk.trim();
      expect(() => JSON.parse(line)).not.toThrow();
    });
  });

  it('should handle empty stream', async () => {
    const objectStream = Readable.from([], { objectMode: true });
    const ndjsonWriter = createNDJSONWriter();

    const chunks: string[] = [];

    ndjsonWriter.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });

    await new Promise<void>((resolve, reject) => {
      ndjsonWriter.on('end', resolve);
      ndjsonWriter.on('error', reject);
      objectStream.pipe(ndjsonWriter);
    });

    expect(chunks).toHaveLength(0);
  });

  it('should handle complex nested objects', async () => {
    const objects = [
      {
        _id: '507f1f77bcf86cd799439011',
        name: 'Alice',
        tags: ['a', 'b', 'c'],
        metadata: {
          createdAt: new Date('2025-01-01T00:00:00Z'),
          nested: { deep: { value: 42 } },
        },
      },
    ];

    const objectStream = Readable.from(objects, { objectMode: true });
    const ndjsonWriter = createNDJSONWriter();

    const chunks: string[] = [];

    ndjsonWriter.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });

    await new Promise<void>((resolve, reject) => {
      ndjsonWriter.on('end', resolve);
      ndjsonWriter.on('error', reject);
      objectStream.pipe(ndjsonWriter);
    });

    expect(chunks).toHaveLength(1);

    // Verify it's valid JSON with newline
    const line = chunks[0]!.trim();
    const parsed = JSON.parse(line);

    expect(parsed._id).toBe('507f1f77bcf86cd799439011');
    expect(parsed.name).toBe('Alice');
    expect(parsed.tags).toEqual(['a', 'b', 'c']);
    expect(parsed.metadata.nested.deep.value).toBe(42);
  });

  it('should handle serialization errors gracefully', async () => {
    // Create object with circular reference
    const circular: any = { name: 'circular' };
    circular.self = circular;

    const objectStream = Readable.from([circular], { objectMode: true });
    const ndjsonWriter = createNDJSONWriter();

    const errorPromise = new Promise<Error>((resolve) => {
      ndjsonWriter.on('error', resolve);
    });

    objectStream.pipe(ndjsonWriter);

    const error = await errorPromise;
    expect(error).toBeInstanceOf(Error);
  });
});
