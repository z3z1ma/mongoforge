export type OperationType = 'insert' | 'update' | 'delete';

export interface OperationRatios {
  insert: number;
  update: number;
  delete: number;
}

export interface MutationConfig {
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

export interface CDCOperation {
  type: OperationType;
  collection: string;
  payload: any;
}