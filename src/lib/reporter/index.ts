/**
 * Reporter module - Run manifests for auditability and reproducibility
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { RunManifest } from "../../types/data-model.js";
import { logger } from "../../utils/logger.js";

export type { ReporterOptions, ReporterResult } from "./types.js";

/**
 * RunReporter generates run manifests with artifact hashes for auditability
 */
export class RunReporter {
  private _manifest: RunManifest;

  constructor(seed: string, version: string = "1.0.0") {
    const timestamp = new Date().toISOString();
    this._manifest = {
      version,
      tool: {
        name: "mongoforge",
        version,
      },
      run: {
        id: crypto.randomBytes(8).toString("hex"),
        timestamp,
        phase: "generation",
      },
      config: {
        generation: {
          docCount: 0, // Will be updated later
          seed,
          schemaHash: "",
          constraintsHash: "",
        },
      },
      artifacts: {},
    };
  }

  /**
   * Calculate SHA-256 hash of a file
   */
  async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(fileBuffer).digest("hex");
  }

  /**
   * Update inferred schema artifact
   */
  async updateInferredSchemaArtifact(schemaPath: string): Promise<void> {
    const hash = await this.calculateFileHash(schemaPath);
    this._manifest.artifacts.inferredSchema = { path: schemaPath, hash };
    logger.debug("Inferred schema artifact updated", {
      path: schemaPath,
      hash,
    });
  }

  /**
   * Update generation schema artifact
   */
  async updateGenerationSchemaArtifact(schemaPath: string): Promise<void> {
    const hash = await this.calculateFileHash(schemaPath);
    this._manifest.artifacts.generationSchema = { path: schemaPath, hash };
    logger.debug("Generation schema artifact updated", {
      path: schemaPath,
      hash,
    });
  }

  /**
   * Update constraints artifact
   */
  async updateConstraintsArtifact(constraintsPath: string): Promise<void> {
    const hash = await this.calculateFileHash(constraintsPath);
    this._manifest.artifacts.constraints = { path: constraintsPath, hash };
    logger.debug("Constraints artifact updated", {
      path: constraintsPath,
      hash,
    });
  }

  /**
   * Update output artifact
   */
  async updateOutputArtifact(outputPath: string, size?: number): Promise<void> {
    const hash = await this.calculateFileHash(outputPath);
    this._manifest.artifacts.output = { path: outputPath, hash, size };
    logger.debug("Output artifact updated", { path: outputPath, hash, size });
  }

  /**
   * Get current manifest
   */
  getManifest(): RunManifest {
    return { ...this._manifest };
  }

  /**
   * Save manifest to JSON file
   */
  async save(outputPath: string): Promise<void> {
    const manifestPath = path.join(outputPath, "run-manifest.json");
    await fs.writeFile(manifestPath, JSON.stringify(this._manifest, null, 2));
    logger.info("Run manifest saved", { path: manifestPath });
  }
}
