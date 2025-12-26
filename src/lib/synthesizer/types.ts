/**
 * Synthesizer module types
 */

import { InferredSchema, GenerationSchema, ConstraintsProfile } from '../../types/data-model';

export interface SynthesizerOptions {
  enforceRequired?: boolean;
  includeMetadata?: boolean;
}

export interface SynthesizerResult {
  schema: GenerationSchema;
  metadata: {
    fieldsProcessed: number;
    vendorExtensionsApplied: number;
  };
}
