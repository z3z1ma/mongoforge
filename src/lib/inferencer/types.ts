/**
 * Inferencer module types
 */

import { InferredSchema, NormalizedDocument } from '../../types/data-model';

export interface InferencerOptions {
  semanticTypes?: boolean;
  storeValues?: boolean;
}

export interface InferencerResult {
  schema: InferredSchema;
  metadata: {
    documentsAnalyzed: number;
    fieldsDiscovered: number;
  };
}
