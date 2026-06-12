import * as os from 'os';
import * as path from 'path';

const DEFAULT_TEMP_DIR = path.join(os.tmpdir(), 'sgs-temp');

export function resolveSgsTempDirectory(): string {
  const configured = process.env.SGS_TEMP_DIR?.trim();
  return configured && configured.length > 0
    ? path.resolve(configured)
    : DEFAULT_TEMP_DIR;
}
