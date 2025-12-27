import crypto from "crypto";

export function hashStringToSeed(seed: string): number {
  // Convert seed string to SHA-256 hash
  const hash = crypto.createHash("sha256").update(seed).digest("hex");

  // Convert first 8 characters of hash to numeric seed
  const numericSeed = parseInt(hash.slice(0, 8), 16);

  return numericSeed;
}

export function generateRandomSeed(): string {
  // Generate a cryptographically secure random seed
  return crypto.randomBytes(32).toString("hex");
}

export function validateSeed(seed: string): boolean {
  // Optional: Add seed validation logic if needed
  return /^[0-9a-fA-F]{64}$/.test(seed);
}
