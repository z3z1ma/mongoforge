/**
 * Generator module types
 */

import {
  GenerationSchema,
  ConstraintsProfile,
  SyntheticDocument,
} from "../../types/data-model";

export interface GeneratorOptions {
  schema: GenerationSchema;
  constraints: ConstraintsProfile;
  seed?: string | number;
  docCount: number;
}

export interface GeneratorResult {
  documents: SyntheticDocument[];
  metadata: {
    generated: number;
    seed: string | number;
    schemaHash: string;
  };
}

export interface CustomFormatGenerator {
  name: string;
  generator: (schema: any) => any;
}
