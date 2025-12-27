/**
 * Reporter module types
 */

import { RunManifest } from "../../types/data-model";

export interface ReporterOptions {
  phase: "discovery" | "generation" | "validation";
  includeMetrics?: boolean;
}

export interface ReporterResult {
  manifest: RunManifest;
  path: string;
}
