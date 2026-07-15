import { clampSophiePosition } from './AIButton';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

jest.mock('@/lib/featureFlags', () => ({
  isAiEnabled: () => true,
}));

describe('SOPHIE floating button collision bounds', () => {
  it('reclamps a persisted position above the mobile navigation reserved zone', () => {
    const persisted = { x: 999, y: 999 };

    expect(
      clampSophiePosition(persisted, {
        viewportWidth: 320,
        viewportHeight: 640,
        width: 56,
        height: 56,
        bottomBoundary: 560,
      }),
    ).toEqual({ x: 248, y: 488 });
  });

  it('reclamps again when the available viewport or reserved boundary shrinks', () => {
    const previous = { x: 240, y: 480 };

    expect(
      clampSophiePosition(previous, {
        viewportWidth: 280,
        viewportHeight: 520,
        width: 56,
        height: 56,
        bottomBoundary: 440,
      }),
    ).toEqual({ x: 208, y: 368 });
  });

  it('stays below the safe top/header reserved boundary', () => {
    expect(
      clampSophiePosition({ x: 16, y: 0 }, {
        viewportWidth: 320,
        viewportHeight: 640,
        width: 56,
        height: 56,
        topBoundary: 72,
      }),
    ).toEqual({ x: 16, y: 88 });
  });
});
