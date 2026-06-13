import * as os from 'os';
import * as path from 'path';
import { resolveSgsTempDirectory } from './temp-directory.util';

describe('resolveSgsTempDirectory', () => {
  const originalSgsTempDir = process.env.SGS_TEMP_DIR;

  afterEach(() => {
    if (originalSgsTempDir === undefined) {
      delete process.env.SGS_TEMP_DIR;
    } else {
      process.env.SGS_TEMP_DIR = originalSgsTempDir;
    }
  });

  it('uses the default app-owned temp directory when SGS_TEMP_DIR is empty', () => {
    delete process.env.SGS_TEMP_DIR;

    expect(resolveSgsTempDirectory()).toBe(path.join(os.tmpdir(), 'sgs-temp'));
  });

  it('keeps configured temp storage inside an app-owned child directory', () => {
    const baseDirectory = path.join(os.tmpdir(), 'sgs-custom-temp-root');
    process.env.SGS_TEMP_DIR = baseDirectory;

    expect(resolveSgsTempDirectory()).toBe(
      path.resolve(baseDirectory, 'sgs-temp'),
    );
  });

  it('falls back to the default when the configured temp base is a filesystem root', () => {
    process.env.SGS_TEMP_DIR = path.parse(path.resolve(os.tmpdir())).root;

    expect(resolveSgsTempDirectory()).toBe(path.join(os.tmpdir(), 'sgs-temp'));
  });
});
