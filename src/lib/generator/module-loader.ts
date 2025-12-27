import { pathToFileURL } from "url";

export interface CustomGenerators {
  pathGenerators: Map<string, () => any>;
  typeGenerators: Map<string, () => any>;
}

export async function loadCustomGenerators(
  modulePath: string,
): Promise<CustomGenerators> {
  const pathGenerators = new Map<string, () => any>();
  const typeGenerators = new Map<string, () => any>();

  try {
    const moduleUrl = pathToFileURL(modulePath).href;
    const module = await import(moduleUrl);

    // Check for specific export conventions
    if (module.pathGenerators && typeof module.pathGenerators === "object") {
      for (const [path, generator] of Object.entries(module.pathGenerators)) {
        if (typeof generator === "function") {
          pathGenerators.set(path, generator as () => any);
        }
      }
    }

    if (module.typeGenerators && typeof module.typeGenerators === "object") {
      for (const [type, generator] of Object.entries(module.typeGenerators)) {
        if (typeof generator === "function") {
          typeGenerators.set(type, generator as () => any);
        }
      }
    }

    return { pathGenerators, typeGenerators };
  } catch (error) {
    throw new Error(
      `Failed to load custom generators module: ${(error as Error).message}`,
    );
  }
}
