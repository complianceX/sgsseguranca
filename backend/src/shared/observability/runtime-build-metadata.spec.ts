import { getRuntimeBuildMetadata } from './runtime-build-metadata';

describe('getRuntimeBuildMetadata', () => {
  it('returns only the allowlisted build metadata', () => {
    expect(
      getRuntimeBuildMetadata('backend', {
        APP_COMMIT_SHA: '  abc123  ',
        APP_VERSION: '2026.09.01',
        BUILD_ID: 'build-42',
      }),
    ).toEqual({
      runtime: 'backend',
      commit: 'abc123',
      version: '2026.09.01',
      buildId: 'build-42',
    });
  });

  it('represents absent metadata as null', () => {
    expect(getRuntimeBuildMetadata('worker', {})).toEqual({
      runtime: 'worker',
      commit: null,
      version: null,
      buildId: null,
    });
  });

  it('rejects control characters and oversized values', () => {
    expect(
      getRuntimeBuildMetadata('backend', {
        APP_COMMIT_SHA: 'valid\nforged-log-line',
        APP_VERSION: 'x'.repeat(257),
      }),
    ).toEqual({
      runtime: 'backend',
      commit: null,
      version: null,
      buildId: null,
    });
  });
});
