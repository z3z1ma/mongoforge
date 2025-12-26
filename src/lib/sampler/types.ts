/**
 * Sampler module types
 */

import { SampleDocument } from '../../types/data-model';

export interface SamplerOptions {
  uri: string;
  database: string;
  collection: string;
  sampleSize: number;
  strategy: 'random' | 'firstN' | 'timeWindowed';
  timeWindow?: {
    field: string;
    start: Date;
    end: Date;
  };
}

export interface SamplerResult {
  documents: SampleDocument[];
  metadata: {
    totalSampled: number;
    collectionName: string;
    sampledAt: Date;
  };
}

export interface MongoConnection {
  uri: string;
  database: string;
  collection: string;
}
