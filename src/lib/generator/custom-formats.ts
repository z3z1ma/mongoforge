/**
 * Custom format generators for MongoDB types
 */

import jsf from "json-schema-faker";
import { faker } from "@faker-js/faker";

/**
 * Generate valid ObjectId string (24-char hex) deterministically using faker
 * Uses timestamp-prefixed format for more realistic data
 */
function generateObjectId(): string {
  return generateTimestampPrefixedObjectId();
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
  return Buffer.from(randomBytes).toString("base64");
}

/**
 * Register all custom formats with json-schema-faker
 */
export function registerCustomFormats(): void {
  // MongoDB type formats
  jsf.format("objectid", generateObjectId);
  jsf.format("date-time", generateDateTime);
  jsf.format("uuid", generateUUID);
  jsf.format("decimal", generateDecimal);
  jsf.format("base64", generateBase64);

  // Semantic type formats
  jsf.format("email", () => faker.internet.email());
  jsf.format("url", () => faker.internet.url());
  jsf.format("phone", () => faker.phone.number());
  jsf.format("person-name", () => faker.person.fullName());
  jsf.format("ipv4", () => faker.internet.ipv4());
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

export function registerPathGenerator(
  path: string,
  generator: () => any,
): void {
  customGeneratorRegistry.registerPathGenerator(path, generator);
}

export function registerTypeGenerator(
  type: string,
  generator: () => any,
): void {
  customGeneratorRegistry.registerTypeGenerator(type, generator);
}

export function getCustomGenerator(
  path?: string,
  type?: string,
): (() => any) | undefined {
  return customGeneratorRegistry.getGenerator(path, type);
}

// Custom Email Generator
export function generateValidEmail(): string {
  // More structured email generation with realistic patterns
  const domains = [
    "gmail.com",
    "yahoo.com",
    "hotmail.com",
    "example.com",
    "company.org",
  ];
  const username = faker.internet.userName().toLowerCase().replace(/[._]/g, "");
  const domain = faker.helpers.arrayElement(domains);

  return `${username}@${domain}`;
}

// Custom ObjectId with Timestamp Prefix
export function generateTimestampPrefixedObjectId(): string {
  // Use a fixed reference date for determinism across runs with the same seed
  // If we don't provide a refDate, faker.date.recent() defaults to new Date(),
  // which makes the output non-deterministic even with a fixed seed.
  const date = faker.date.recent({ refDate: "2025-01-01T00:00:00Z" });
  const timestamp = Math.floor(date.getTime() / 1000); // Unix timestamp
  const timestampHex = timestamp.toString(16).padStart(8, "0");

  // Generate the remaining 8 random bytes (ObjectId is 12 bytes total = 24 hex chars)
  // 4 bytes timestamp + 8 bytes random = 12 bytes = 24 hex characters
  const randomBytes = Array.from({ length: 8 }, () =>
    faker.number.int({ min: 0, max: 255 }),
  );

  const remainingBytes = Buffer.from(randomBytes);
  const fullObjectId = Buffer.concat([
    Buffer.from(timestampHex, "hex"),
    remainingBytes,
  ]);

  return fullObjectId.toString("hex");
}

// Register these as default type/path generators during module initialization
export function registerDefaultCustomGenerators(): void {
  // Email generators
  registerPathGenerator("*.email", generateValidEmail);
  registerTypeGenerator("email", generateValidEmail);

  // ObjectId generators with timestamp prefix
  registerPathGenerator("*._id", generateTimestampPrefixedObjectId);
  registerTypeGenerator("objectid", generateTimestampPrefixedObjectId);
}

// Call during module initialization
registerDefaultCustomGenerators();
