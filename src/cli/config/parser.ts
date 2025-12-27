/**
 * Configuration file parser - supports JSON and YAML
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { MongoForgeConfig } from "./types.js";
import { logger } from "../../utils/logger.js";

/**
 * Parse configuration file (JSON or YAML)
 */
export function parseConfigFile(filePath: string): MongoForgeConfig {
  logger.info("Parsing configuration file", { filePath });

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read config file: ${filePath}`, {
      cause: error,
    });
  }

  // Determine format from file extension
  const isYaml = filePath.endsWith(".yaml") || filePath.endsWith(".yml");
  const isJson = filePath.endsWith(".json");

  if (!isYaml && !isJson) {
    throw new Error(
      `Unsupported config file format: ${filePath}. Must be .json, .yaml, or .yml`,
    );
  }

  try {
    let config: MongoForgeConfig;

    if (isYaml) {
      config = parseYaml(content) as MongoForgeConfig;
    } else {
      config = JSON.parse(content) as MongoForgeConfig;
    }

    logger.info("Configuration file parsed successfully", {
      hasInferConfig: !!config.infer,
      hasGenerateConfig: !!config.generate,
      hasValidateConfig: !!config.validate,
    });

    return config;
  } catch (error) {
    throw new Error(`Failed to parse config file: ${filePath}`, {
      cause: error,
    });
  }
}

/**
 * Validate required fields are present
 */
export function validateConfigSection<T extends Record<string, any>>(
  section: Partial<T> | undefined,
  requiredFields: (keyof T)[],
  sectionName: string,
): void {
  if (!section) {
    throw new Error(`Missing required config section: ${sectionName}`);
  }

  const missingFields = requiredFields.filter((field) => !(field in section));

  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields in ${sectionName}: ${missingFields.join(", ")}`,
    );
  }
}
