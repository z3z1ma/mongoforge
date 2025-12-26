/**
 * Unit tests for quality reporter
 */

import { describe, it, expect } from 'vitest';
import { compareArrayLengths, compareDocumentSizes } from '../../../src/lib/validator/quality-reporter.js';
import { ArrayLengthStats, DocumentSizeBucket } from '../../../src/types/data-model.js';

describe('compareArrayLengths()', () => {
  it('should compare array length distributions', () => {
    const sampleStats = new Map<string, ArrayLengthStats>([
      [
        'tags',
        {
          fieldPath: 'tags',
          observedLengths: [2, 3, 3, 4],
          minLen: 2,
          maxLen: 4,
          p50Len: 3,
          p90Len: 4,
          p99Len: 4,
          mean: 3,
          stdDev: 0.7,
        },
      ],
    ]);

    const generatedDocs = [
      { tags: ['a', 'b', 'c'] }, // 3
      { tags: ['a', 'b', 'c'] }, // 3
      { tags: ['a', 'b', 'c', 'd'] }, // 4
    ];

    const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);

    expect(comparison.tags).toBeDefined();
    expect(comparison.tags?.sample.p50Len).toBe(3);
    expect(comparison.tags?.generated.p50Len).toBe(3);
    expect(comparison.tags?.deviation.p50).toBe(0);
    expect(comparison.tags?.passed).toBe(true);
  });

  it('should detect deviations exceeding tolerance', () => {
    const sampleStats = new Map<string, ArrayLengthStats>([
      [
        'items',
        {
          fieldPath: 'items',
          observedLengths: [5, 5, 5],
          minLen: 5,
          maxLen: 5,
          p50Len: 5,
          p90Len: 5,
          p99Len: 5,
          mean: 5,
          stdDev: 0,
        },
      ],
    ]);

    const generatedDocs = [
      { items: Array(10).fill('x') }, // Way too long
      { items: Array(10).fill('x') },
    ];

    const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);

    expect(comparison.items?.passed).toBe(false);
    expect(comparison.items?.deviation.p50).toBeGreaterThan(10);
  });

  it('should handle missing fields in generated documents', () => {
    const sampleStats = new Map<string, ArrayLengthStats>([
      [
        'missingField',
        {
          fieldPath: 'missingField',
          observedLengths: [1, 2, 3],
          minLen: 1,
          maxLen: 3,
          p50Len: 2,
          p90Len: 3,
          p99Len: 3,
          mean: 2,
          stdDev: 0.8,
        },
      ],
    ]);

    const generatedDocs = [{ other: 'field' }, { other: 'field' }];

    const comparison = compareArrayLengths(sampleStats, generatedDocs, 0.1);

    expect(comparison.missingField).toBeDefined();
    expect(comparison.missingField?.passed).toBe(false);
    expect(comparison.missingField?.deviation.p50).toBe(100);
  });
});

describe('compareDocumentSizes()', () => {
  it('should compare document size distributions', () => {
    const sampleBuckets: DocumentSizeBucket[] = [
      {
        bucketId: 'small',
        sizeRange: { min: 0, max: 3 },
        sizeProxy: 'leafFieldCount',
        count: 50,
        probability: 0.5,
      },
      {
        bucketId: 'large',
        sizeRange: { min: 3, max: 10 },
        sizeProxy: 'leafFieldCount',
        count: 50,
        probability: 0.5,
      },
    ];

    const generatedDocs = [
      { a: 1, b: 2 }, // 2 fields - small
      { a: 1, b: 2 }, // 2 fields - small
      { a: 1, b: 2, c: 3, d: 4, e: 5 }, // 5 fields - large
      { a: 1, b: 2, c: 3, d: 4, e: 5 }, // 5 fields - large
    ];

    const comparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.2);

    expect(comparison.buckets).toHaveLength(2);
    expect(comparison.buckets[0]?.bucketId).toBe('small');
    expect(comparison.buckets[0]?.sample.probability).toBe(0.5);
    expect(comparison.buckets[0]?.generated.probability).toBe(0.5);
    expect(comparison.buckets[0]?.deviation).toBe(0);
    expect(comparison.buckets[0]?.passed).toBe(true);
  });

  it('should detect distribution deviations', () => {
    const sampleBuckets: DocumentSizeBucket[] = [
      {
        bucketId: 'medium',
        sizeRange: { min: 3, max: 6 },
        sizeProxy: 'leafFieldCount',
        count: 100,
        probability: 1.0,
      },
    ];

    // All generated docs are small (not in medium bucket)
    const generatedDocs = Array(10)
      .fill(null)
      .map(() => ({ a: 1, b: 2 })); // 2 fields each

    const comparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.2);

    // Should show high deviation since all docs fall outside expected bucket
    expect(comparison.buckets[0]?.deviation).toBeGreaterThan(20);
    expect(comparison.buckets[0]?.passed).toBe(false);
  });

  it('should respect tolerance threshold', () => {
    const sampleBuckets: DocumentSizeBucket[] = [
      {
        bucketId: 'small',
        sizeRange: { min: 0, max: 5 },
        sizeProxy: 'leafFieldCount',
        count: 45,
        probability: 0.45,
      },
      {
        bucketId: 'large',
        sizeRange: { min: 5, max: 10 },
        sizeProxy: 'leafFieldCount',
        count: 55,
        probability: 0.55,
      },
    ];

    // Generate docs with similar distribution: 45% small, 55% large (matching sample exactly)
    const generatedDocs = Array(100)
      .fill(null)
      .map((_, i) =>
        i < 45 ? { a: 1, b: 2, c: 3 } : { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }
      ); // 3 fields vs 7 fields

    const comparison = compareDocumentSizes(sampleBuckets, generatedDocs, 0.20); // 20% tolerance

    // Distribution matches exactly, so deviation should be 0
    expect(comparison.buckets.every((b) => b.passed)).toBe(true);
    expect(comparison.buckets.every((b) => b.deviation === 0)).toBe(true);
  });
});
