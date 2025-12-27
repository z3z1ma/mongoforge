/**
 * Profiler module types
 */

import {
  ConstraintsProfile,
  ArrayLenPolicy,
  SizeProxyType,
} from "../../types/data-model.js";
import { DynamicKeyDetectionConfig } from "../../types/dynamic-keys.js";

/**
 * Options for the profiler
 */
export interface ProfilerOptions {
  arrayLenPolicy: ArrayLenPolicy;
  percentiles: number[];
  clampRange: [number, number];
  sizeProxy: SizeProxyType;
  dynamicKeyDetection?: DynamicKeyDetectionConfig;
}

export interface ProfilerMetadata {
  documentsAnalyzed: number;
  arrayFieldsFound: number;
  numericFieldsFound: number;
  semanticFieldsFound: number;
  dynamicKeyFieldsFound: number;
  sizeBucketsCreated: number;
}

export interface ProfilerResult {
  profile: ConstraintsProfile;
  metadata: ProfilerMetadata;
}
