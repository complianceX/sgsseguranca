import * as os from 'os';
import * as path from 'path';

const APP_TEMP_DIR_NAME = 'sgs-temp';
const DEFAULT_TEMP_DIR = path.join(os.tmpdir(), APP_TEMP_DIR_NAME);

function isUsableBaseDirectory(directory: string): boolean {
  return directory !== path.parse(directory).root;
}

function isDescendantPath(
  baseDirectory: string,
  candidatePath: string,
): boolean {
  const relativePath = path.relative(baseDirectory, candidatePath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

export function resolveSgsTempDirectory(): string {
  const configured = process.env.SGS_TEMP_DIR?.trim();

  if (!configured) {
    return DEFAULT_TEMP_DIR;
  }

  const configuredBaseDirectory = path.resolve(configured);

  if (!isUsableBaseDirectory(configuredBaseDirectory)) {
    return DEFAULT_TEMP_DIR;
  }

  const appTempDirectory = path.resolve(
    configuredBaseDirectory,
    APP_TEMP_DIR_NAME,
  );

  return isDescendantPath(configuredBaseDirectory, appTempDirectory)
    ? appTempDirectory
    : DEFAULT_TEMP_DIR;
}
