/**
 * Normalizer module types
 */

import {
  NormalizedDocument,
  SampleDocument,
  TypeHint,
} from "../../types/data-model";

export interface NormalizerOptions {
  preserveMetadata?: boolean;
}

export interface NormalizerResult {
  documents: NormalizedDocument[];
  typeHints: Map<string, TypeHint>;
}

export interface TypeMapper {
  canMap: (value: any) => boolean;
  map: (value: any, fieldPath: string) => { value: any; hint: TypeHint };
}
