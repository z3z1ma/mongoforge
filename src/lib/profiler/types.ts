/**
 * Profiler module types
 */

import { ConstraintsProfile } from "../../types/data-model";

export interface ProfilerOptions {
  arrayLenPolicy: "minmax" | "percentileClamp";
  percentiles: number[];
  clampRange: [number, number];
  sizeProxy: "leafFieldCount" | "arrayLengthSum" | "byteSize";
}

export interface ProfilerResult {
  profile: ConstraintsProfile;
  metadata: {
    documentsAnalyzed: number;
    arrayFieldsFound: number;
    numericFieldsFound: number;
    sizeBucketsCreated: number;
  };
}
