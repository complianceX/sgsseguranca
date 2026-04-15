import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// Expose Web Fetch API globals for Next.js API route tests (Node 18+ has these natively).
// jsdom does not define Request/Response/Headers, so we forward them from Node's globalThis.
if (!global.Request && typeof globalThis.Request !== 'undefined') {
  (global as typeof globalThis).Request = globalThis.Request;
}
if (!global.Response && typeof globalThis.Response !== 'undefined') {
  (global as typeof globalThis).Response = globalThis.Response;
}
if (!global.Headers && typeof globalThis.Headers !== 'undefined') {
  (global as typeof globalThis).Headers = globalThis.Headers;
}

const testEnv = process.env as Record<string, string | undefined>;
testEnv.NODE_ENV = testEnv.NODE_ENV || 'test';
testEnv.TZ = testEnv.TZ || 'UTC';
testEnv.NEXT_TELEMETRY_DISABLED = testEnv.NEXT_TELEMETRY_DISABLED || '1';
testEnv.NEXT_PUBLIC_API_URL =
  testEnv.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
testEnv.NEXT_PUBLIC_APP_URL =
  testEnv.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
testEnv.NEXT_PUBLIC_SITE_URL =
  testEnv.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: jest.fn(),
});

Object.defineProperty(window, 'open', {
  writable: true,
  value: jest.fn(() => null),
});

Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(Date.now()), 16),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: (handle: number) => window.clearTimeout(handle),
});

if (!global.ResizeObserver) {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof global.ResizeObserver;
}

if (!global.IntersectionObserver) {
  global.IntersectionObserver = class IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];

    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  } as typeof global.IntersectionObserver;
}

if (!global.PointerEvent) {
  global.PointerEvent = MouseEvent as typeof global.PointerEvent;
}

if (!URL.createObjectURL) {
  URL.createObjectURL = jest.fn(() => 'blob:jest-object-url');
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = jest.fn();
}

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: {
      writeText: jest.fn().mockResolvedValue(undefined),
      readText: jest.fn().mockResolvedValue(''),
    },
  });
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}

if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = jest.fn();
}

if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = jest.fn();
}

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
}
