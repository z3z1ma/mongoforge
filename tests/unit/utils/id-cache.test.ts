import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentIDCache } from '../../../src/lib/utils/id-cache';

describe('DocumentIDCache', () => {
  let cache: DocumentIDCache;

  beforeEach(() => {
    cache = new DocumentIDCache(10);
  });

  it('should add IDs and report size', () => {
    cache.add('id1');
    cache.add('id2');
    expect(cache.size()).toBe(2);
    expect(cache.has('id1')).toBe(true);
    expect(cache.has('id2')).toBe(true);
    expect(cache.has('id3')).toBe(false);
  });

  it('should not add duplicate IDs', () => {
    cache.add('id1');
    cache.add('id1');
    expect(cache.size()).toBe(1);
  });

  it('should remove IDs', () => {
    cache.add('id1');
    cache.add('id2');
    cache.remove('id1');
    expect(cache.size()).toBe(1);
    expect(cache.has('id1')).toBe(false);
    expect(cache.has('id2')).toBe(true);
  });

  it('should handle removing non-existent IDs', () => {
    cache.add('id1');
    cache.remove('id2');
    expect(cache.size()).toBe(1);
  });

  it('should return random IDs', () => {
    cache.add('id1');
    cache.add('id2');
    cache.add('id3');
    const randomId = cache.getRandom();
    expect(['id1', 'id2', 'id3']).toContain(randomId);
  });

  it('should return undefined when getting random ID from empty cache', () => {
    expect(cache.getRandom()).toBeUndefined();
  });

  it('should evict oldest ID when exceeding maxSize', () => {
    const smallCache = new DocumentIDCache(3);
    smallCache.add('id1');
    smallCache.add('id2');
    smallCache.add('id3');
    smallCache.add('id4'); // Should evict id1

    expect(smallCache.size()).toBe(3);
    expect(smallCache.has('id1')).toBe(false);
    expect(smallCache.has('id4')).toBe(true);
  });

  it('should clear the cache', () => {
    cache.add('id1');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has('id1')).toBe(false);
  });

  it('should support tombstoning', () => {
    cache.add('id1');
    cache.tombstone('id1');
    expect(cache.isTombstoned('id1')).toBe(true);
    expect(cache.has('id1')).toBe(true);
  });

  it('should remove tombstone when ID is removed', () => {
    cache.add('id1');
    cache.tombstone('id1');
    cache.remove('id1');
    expect(cache.isTombstoned('id1')).toBe(false);
  });

  it('should revive tombstoned ID when re-added', () => {
    cache.add('id1');
    cache.tombstone('id1');
    cache.add('id1');
    expect(cache.isTombstoned('id1')).toBe(false);
  });
});
