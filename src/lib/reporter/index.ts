/**
 * Reporter module - Run manifests for auditability and reproducibility
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { RunManifest } from '../../types/data-model.js';
import { logger } from '../../utils/logger.js';

export type { ReporterOptions, ReporterResult } from './types.js';

/**
 * RunReporter generates run manifests with artifact hashes for auditability
 */
export class RunReporter {
  private _manifest: RunManifest;

  constructor(seed: string, version: string = '1.0.0') {
    this._manifest = {
      version,
      seed,
      timestamp: new Date().toISOString(),
      artifacts: {
        schemaHash: '',
        constraintsHash: '',
        outputHash: '',
      },
    };
  }

  /**
   * Calculate SHA-256 hash of a file
   */
  async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Update schema artifact hash
   */
  async updateSchemaHash(schemaPath: string): Promise<void> {
    this._manifest.artifacts.schemaHash = await this.calculateFileHash(schemaPath);
    logger.debug('Schema hash updated', { hash: this._manifest.artifacts.schemaHash });
  }

  /**
   * Update constraints artifact hash
   */
  async updateConstraintsHash(constraintsPath: string): Promise<void> {
    this._manifest.artifacts.constraintsHash = await this.calculateFileHash(
      constraintsPath
    );
    logger.debug('Constraints hash updated', {
      hash: this._manifest.artifacts.constraintsHash,
    });
  }

  /**
   * Update output artifact hash
   */
  async updateOutputHash(outputPath: string): Promise<void> {
    this._manifest.artifacts.outputHash = await this.calculateFileHash(outputPath);
    logger.debug('Output hash updated', { hash: this._manifest.artifacts.outputHash });
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
    const manifestPath = path.join(outputPath, 'run-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(this._manifest, null, 2));
    logger.info('Run manifest saved', { path: manifestPath });
  }
}
