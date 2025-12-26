/**
 * Schema loading utilities
 * TODO: Implement full schema discovery in Phase 5
 */

import fs from 'fs/promises';
import type { GenerationSchema } from '../../types/data-model.js';
import { logger } from '../../utils/logger.js';

/**
 * Load generation schema from file
 * @param schemaPath Path to generation schema JSON file
 * @param constraintsPath Optional path to constraints file (unused for now)
 * @returns Parsed GenerationSchema
 */
export async function loadGenerationSchema(
  schemaPath: string,
  constraintsPath?: string
): Promise<GenerationSchema> {
  try {
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent) as GenerationSchema;

    logger.info('Loaded generation schema', {
      schemaPath,
      properties: Object.keys(schema.properties ?? {}).length
    });

    // TODO: Phase 5 - Merge with constraints profile from constraintsPath
    if (constraintsPath) {
      logger.debug('Constraints path provided but not yet implemented', { constraintsPath });
    }

    return schema;
  } catch (error) {
    logger.error('Failed to load generation schema', error);
    throw new Error(`Failed to load schema from ${schemaPath}: ${(error as Error).message}`);
  }
}

/**
 * Save generation schema to file
 * @param schema GenerationSchema to save
 * @param outputPath Path where schema should be saved
 */
export async function saveGenerationSchema(
  schema: GenerationSchema,
  outputPath: string
): Promise<void> {
  try {
    await fs.writeFile(outputPath, JSON.stringify(schema, null, 2), 'utf-8');
    logger.info('Saved generation schema', { outputPath });
  } catch (error) {
    logger.error('Failed to save generation schema', error);
    throw new Error(`Failed to save schema to ${outputPath}: ${(error as Error).message}`);
  }
}
