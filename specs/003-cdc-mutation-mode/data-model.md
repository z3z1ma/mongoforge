# Data Model: CDC and Mutation Modes

**Feature**: `003-cdc-mutation-mode`

## Core Entities

### 1. DocumentIDCache
Manages the set of known document IDs in the target collection.

```typescript
interface DocumentIDCache {
  /**
   * Add an ID to the cache.
   * If cache is full, evicts based on policy.
   */
  add(id: string): void;

  /**
   * Remove an ID from the cache.
   */
  remove(id: string): void;

  /**
   * Get a random ID from the cache.
   */
  getRandom(): string | undefined;

  /**
   * Check if ID exists.
   */
  has(id: string): boolean;

  /**
   * Current size of the cache.
   */
  size(): number;
}
```

### 2. MutationConfig
Configuration for the mutation operations.

```typescript
type OperationType = 'insert' | 'update' | 'delete';

interface OperationRatios {
  insert: number; // 0-1 or percentage
  update: number;
  delete: number;
}

interface MutationConfig {
  targetUri: string;
  database: string;
  collection: string;
  
  // Operational control
  ratios: OperationRatios;
  rateLimit?: number; // ops/sec
  batchSize: number;
  
  // Strategy
  updateStrategy: 'regenerate' | 'partial' | 'increment' | 'mixed';
  deleteBehavior: 'remove' | 'keep' | 'tombstone';
  idCacheSize: number;
}
```

### 3. CDCOperation
Internal representation of a generated operation before execution.

```typescript
interface CDCOperation {
  type: OperationType;
  collection: string;
  payload: any; // The document for insert, or update filter+ops for update/delete
}

// Example for bulkWrite
type MongoBulkOp = 
  | { insertOne: { document: any } }
  | { updateOne: { filter: { _id: any }, update: any } }
  | { deleteOne: { filter: { _id: any } } };
```

## State Transitions

### Lifecycle of an ID in CDC Mode

1.  **Generation**: `Generator` creates a new document (with new `_id`).
2.  **Insertion**: `MongoInserter` writes to DB.
3.  **Caching**: `DocumentIDCache` stores `_id`.
4.  **Selection**: `OperationSelector` picks `update` type.
5.  **Targeting**: `DocumentIDCache` provides random `_id`.
6.  **Mutation**: `MutationGenerator` creates update op.
7.  **Execution**: `MongoInserter` writes update.
8.  **Deletion**: `OperationSelector` picks `delete` type -> `MongoInserter` removes -> `DocumentIDCache` removes `_id` (unless tombstone).
