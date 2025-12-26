/**
 * Schema loading utilities
 * Loads generation schemas produced by the inferencer + synthesizer workflow
 */

import fs from 'fs/promises';
import type { GenerationSchema, ConstraintsProfile } from '../../types/data-model.js';
import { logger } from '../../utils/logger.js';

/**
 * Load generation schema from file
 * @param schemaPath Path to generation schema JSON file
 * @param constraintsPath Optional path to constraints file for validation
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

    // Constraints are embedded in schema via x-gen extensions
    // constraintsPath is optional and used primarily for validation workflows
    if (constraintsPath) {
      logger.debug('Constraints file available for validation', { constraintsPath });
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
