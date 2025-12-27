/**
 * Synthesizer module types
 */

import {
  InferredSchema,
  GenerationSchema,
  ConstraintsProfile,
} from "../../types/data-model";
import type { ObjectKeysAnalysis } from "../inferencer/dynamic-key-detector.js";

export interface SynthesizerOptions {
  enforceRequired?: boolean;
  includeMetadata?: boolean;
}

export interface SynthesizerResult {
  schema: GenerationSchema;
  metadata: {
    fieldsProcessed: number;
    vendorExtensionsApplied: number;
    dynamicKeysAnnotated?: number;
  };
}

export interface SynthesizerInput {
  inferredSchema: InferredSchema;
  constraints: ConstraintsProfile;
  typeHints: Map<string, any>;
  dynamicKeyAnalyses?: Map<string, ObjectKeysAnalysis>;
}
