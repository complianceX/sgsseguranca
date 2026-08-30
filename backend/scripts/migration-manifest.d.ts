export interface MigrationManifestEntry {
  fileName: string;
  timestamp?: string;
  className?: string;
  name?: string;
  hasExplicitName: boolean;
}

export interface MigrationManifest {
  directory: string;
  files: string[];
  entries: MigrationManifestEntry[];
  issues: string[];
}

export interface MigrationOrderOverride {
  legacyTimestamp?: string;
  ordinal?: number;
}

export interface MigrationCompatibilityManifest {
  aliases: Record<string, string>;
  order: Record<string, MigrationOrderOverride>;
}

export function readCompatibilityManifest(): MigrationCompatibilityManifest;
export function readMigrationManifest(
  migrationsDir?: string,
): MigrationManifest;
