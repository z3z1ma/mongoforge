/**
 * Custom format generators for MongoDB types
 */

import jsf from 'json-schema-faker';
import { faker } from '@faker-js/faker';
import { ObjectId } from 'mongodb';

/**
 * Generate valid ObjectId string (24-char hex) deterministically using faker
 */
function generateObjectId(): string {
  // Generate 12 random bytes using faker for determinism
  const bytes = Array.from({ length: 12 }, () =>
    faker.number.int({ min: 0, max: 255 })
  );
  return Buffer.from(bytes).toString('hex');
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

/**
 * Custom generator registry for path and type-based overrides
 */
class CustomGeneratorRegistry {
  private pathGenerators: Map<string, () => any> = new Map();
  private typeGenerators: Map<string, () => any> = new Map();

  registerPathGenerator(path: string, generator: () => any): void {
    this.pathGenerators.set(path, generator);
  }

  registerTypeGenerator(type: string, generator: () => any): void {
    this.typeGenerators.set(type, generator);
  }

  getGenerator(path?: string, type?: string): (() => any) | undefined {
    // Precedence: Path-specific > Type-level > Default (undefined)
    if (path && this.pathGenerators.has(path)) {
      return this.pathGenerators.get(path);
    }

    if (type && this.typeGenerators.has(type)) {
      return this.typeGenerators.get(type);
    }

    return undefined;
  }
}

const customGeneratorRegistry = new CustomGeneratorRegistry();

export function registerPathGenerator(path: string, generator: () => any): void {
  customGeneratorRegistry.registerPathGenerator(path, generator);
}

export function registerTypeGenerator(type: string, generator: () => any): void {
  customGeneratorRegistry.registerTypeGenerator(type, generator);
}

export function getCustomGenerator(path?: string, type?: string): (() => any) | undefined {
  return customGeneratorRegistry.getGenerator(path, type);
}

// Custom Email Generator
export function generateValidEmail(): string {
  // More structured email generation with realistic patterns
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'example.com', 'company.org'];
  const username = faker.internet.userName().toLowerCase().replace(/[._]/g, '');
  const domain = faker.helpers.arrayElement(domains);

  return `${username}@${domain}`;
}

// Custom ObjectId with Timestamp Prefix
export function generateTimestampPrefixedObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
  const timestampHex = timestamp.toString(16).padStart(8, '0');

  // Generate the remaining 16 random bytes
  const randomBytes = Array.from({ length: 16 }, () =>
    faker.number.int({ min: 0, max: 255 })
  );

  const remainingBytes = Buffer.from(randomBytes);
  const fullObjectId = Buffer.concat([
    Buffer.from(timestampHex, 'hex'),
    remainingBytes
  ]);

  return fullObjectId.toString('hex');
}

// Register these as default type/path generators during module initialization
export function registerDefaultCustomGenerators(): void {
  // Email generators
  registerPathGenerator('*.email', generateValidEmail);
  registerTypeGenerator('email', generateValidEmail);

  // ObjectId generators with timestamp prefix
  registerPathGenerator('*._id', generateTimestampPrefixedObjectId);
  registerTypeGenerator('objectid', generateTimestampPrefixedObjectId);
}

// Call during module initialization
registerDefaultCustomGenerators();
