/**
 * json-schema-faker initialization with @faker-js/faker provider
 */

import jsf from 'json-schema-faker';
import { faker } from '@faker-js/faker';
import { logger } from '../../utils/logger.js';
import { hashStringToSeed } from '../../utils/seed-manager.js';

/**
 * Initialize json-schema-faker with faker.js provider
 */
export function initializeFaker(seed?: string | number): void {
  // Configure jsf to use faker
  jsf.extend('faker', () => faker);

  // Set seed if provided
  if (seed !== undefined) {
    const numericSeed = typeof seed === 'string' ? hashStringToSeed(seed) : seed;
    faker.seed(numericSeed);
    logger.debug('Faker seed set', { seed, numericSeed });
  }

  // Configure jsf options
  jsf.option({
    alwaysFakeOptionals: true,
    useDefaultValue: false,
    useExamplesValue: false,
    failOnInvalidTypes: false,
    failOnInvalidFormat: false,
    maxItems: 10,
    maxLength: 100,
    random: () => faker.number.float({ min: 0, max: 1 }),
  });

  logger.debug('json-schema-faker initialized');
}

/**
 * Generate a single document from schema
 */
export async function generate(schema: any): Promise<any> {
  return jsf.resolve(schema);
}

/**
 * Generate multiple documents from schema
 */
export async function generateMany(schema: any, count: number): Promise<any[]> {
  const documents: any[] = [];

  for (let i = 0; i < count; i++) {
    const doc = await generate(schema);
    documents.push(doc);
  }

  return documents;
}

/**
 * Reset faker to new seed
 */
export function resetSeed(seed?: string | number): void {
  if (seed !== undefined) {
    const numericSeed = typeof seed === 'string' ? hashStringToSeed(seed) : seed;
    faker.seed(numericSeed);
    logger.debug('Faker seed reset', { seed, numericSeed });
  }
}
