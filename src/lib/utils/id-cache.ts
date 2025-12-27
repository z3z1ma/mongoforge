/**
 * DocumentIDCache manages a set of known document IDs for random selection.
 * Uses an Array + Map combination for O(1) random access and O(1) lookups/removals.
 */
export class DocumentIDCache {
  private ids: string[] = [];
  private indices: Map<string, number> = new Map();
  private tombstones: Set<string> = new Set();
  private maxSize: number;

  constructor(maxSize: number = 100000) {
    this.maxSize = maxSize;
  }

  /**
   * Adds an ID to the cache.
   * If cache is full, it evicts the first (oldest) ID.
   */
  add(id: string): void {
    if (this.indices.has(id)) {
      this.tombstones.delete(id); // Revive if it was a tombstone
      return;
    }

    if (this.ids.length >= this.maxSize && this.ids.length > 0) {
      const oldestId = this.ids[0];
      if (oldestId !== undefined) {
        this.remove(oldestId);
      }
    }

    const index = this.ids.length;
    this.ids.push(id);
    this.indices.set(id, index);
  }

  /**
   * Mark an ID as tombstoned.
   */
  tombstone(id: string): void {
    if (this.indices.has(id)) {
      this.tombstones.add(id);
    }
  }

  /**
   * Check if ID is tombstoned.
   */
  isTombstoned(id: string): boolean {
    return this.tombstones.has(id);
  }

  /**
   * Removes an ID from the cache.
   * Uses the "swap with last" trick to maintain O(1) removal from array.
   */
  remove(id: string): void {
    const index = this.indices.get(id);
    if (index === undefined) {
      return;
    }

    const lastId = this.ids[this.ids.length - 1];
    if (lastId === undefined) {
      this.ids.pop();
      this.indices.delete(id);
      this.tombstones.delete(id);
      return;
    }

    // Swap last element with the one to be removed
    this.ids[index] = lastId;
    this.indices.set(lastId, index);

    // Pop the last element
    this.ids.pop();
    this.indices.delete(id);
    this.tombstones.delete(id);
  }

  /**
   * Returns a random ID from the cache.
   */
  getRandom(): string | undefined {
    if (this.ids.length === 0) {
      return undefined;
    }
    const randomIndex = Math.floor(Math.random() * this.ids.length);
    return this.ids[randomIndex];
  }

  /**
   * Checks if an ID exists in the cache.
   */
  has(id: string): boolean {
    return this.indices.has(id);
  }

  /**
   * Current size of the cache.
   */
  size(): number {
    return this.ids.length;
  }

  /**
   * Clears the cache.
   */
  clear(): void {
    this.ids = [];
    this.indices.clear();
    this.tombstones.clear();
  }
}
