/**
 * Inferencer module types
 */

import { InferredSchema, NormalizedDocument } from '../../types/data-model.js';
import { DynamicKeyDetectionConfig } from '../../types/dynamic-keys.js';

export interface InferencerOptions {
  semanticTypes?: boolean;
  storeValues?: boolean;
  dynamicKeyDetection?: DynamicKeyDetectionConfig | boolean;
}

export interface InferencerResult {
  schema: InferredSchema;
  metadata: {
    documentsAnalyzed: number;
    fieldsDiscovered: number;
    dynamicKeysDetected?: number;
  };
}
