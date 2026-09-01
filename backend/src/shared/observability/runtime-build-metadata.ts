export type RuntimeBuildEnvironment = {
  APP_COMMIT_SHA?: string;
  APP_VERSION?: string;
  BUILD_ID?: string;
};

export type RuntimeBuildMetadata = {
  runtime: string;
  commit: string | null;
  version: string | null;
  buildId: string | null;
};

function normalizeMetadataValue(value: string | undefined): string | null {
  const normalized = value?.trim() || '';
  const containsControlCharacter = [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

  if (
    normalized.length === 0 ||
    normalized.length > 256 ||
    containsControlCharacter
  ) {
    return null;
  }

  return normalized;
}

export function getRuntimeBuildMetadata(
  runtime: string,
  env: RuntimeBuildEnvironment = process.env,
): RuntimeBuildMetadata {
  return {
    runtime,
    commit: normalizeMetadataValue(env.APP_COMMIT_SHA),
    version: normalizeMetadataValue(env.APP_VERSION),
    buildId: normalizeMetadataValue(env.BUILD_ID),
  };
}
