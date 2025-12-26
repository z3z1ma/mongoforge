/**
 * Custom format generators for MongoDB types
 */

import jsf from 'json-schema-faker';
import { faker } from '@faker-js/faker';
import { ObjectId } from 'mongodb';

/**
 * Generate valid ObjectId string (24-char hex)
 */
function generateObjectId(): string {
  return new ObjectId().toString();
}

/**
 * Generate ISO 8601 date-time string
 */
function generateDateTime(): string {
  return faker.date.recent().toISOString();
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return faker.string.uuid();
}

/**
 * Generate decimal string
 */
function generateDecimal(): string {
  const value = faker.number.float({ min: 0, max: 1000000, fractionDigits: 2 });
  return value.toFixed(2);
}

/**
 * Generate base64 string
 */
function generateBase64(): string {
  const randomBytes = faker.string.alphanumeric(16);
  return Buffer.from(randomBytes).toString('base64');
}

/**
 * Register all custom formats with json-schema-faker
 */
export function registerCustomFormats(): void {
  // ObjectId format
  jsf.format('objectid', generateObjectId);

  // Date-time format (override default)
  jsf.format('date-time', generateDateTime);

  // UUID format
  jsf.format('uuid', generateUUID);

  // Decimal format
  jsf.format('decimal', generateDecimal);

  // Base64 format
  jsf.format('base64', generateBase64);
}

/**
 * Custom format generator type
 */
export interface CustomFormatDef {
  name: string;
  generator: () => any;
}

/**
 * Register a custom format generator
 */
export function registerFormat(name: string, generator: () => any): void {
  jsf.format(name, generator);
}

/**
 * Register multiple custom formats
 */
export function registerFormats(formats: CustomFormatDef[]): void {
  for (const format of formats) {
    jsf.format(format.name, format.generator);
  }
}
