import {
  setOfflineCache,
  getOfflineCache,
  consumeOfflineCache,
  clearExpiredCache,
  isStaleResult,
  CACHE_TTL,
} from './offline-cache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE: Record<string, string> = {};

const mockStorage = {
  getItem: (key: string) => STORE[key] ?? null,
  setItem: (key: string, value: string) => { STORE[key] = value; },
  removeItem: (key: string) => { delete STORE[key]; },
  get length() { return Object.keys(STORE).length; },
  key: (i: number) => Object.keys(STORE)[i] ?? null,
};

// Expose keys as enumerable (Object.keys(localStorage) in clearExpiredCache)
Object.defineProperty(mockStorage, Symbol.iterator, {
  value: function* () { yield* Object.keys(STORE); },
});

const mockWindowKeys = () => Object.keys(STORE);

beforeEach(() => {
  Object.keys(STORE).forEach((k) => delete STORE[k]);

  Object.defineProperty(window, 'localStorage', {
    value: new Proxy(mockStorage, {
      get(target, prop: string | symbol) {
        if (prop === Symbol.iterator) return mockWindowKeys;
        const key = prop as keyof typeof target;
        return typeof target[key] === 'function'
          ? (target[key] as (...args: unknown[]) => unknown).bind(target)
          : target[key];
      },
      ownKeys: () => Object.keys(STORE),
      getOwnPropertyDescriptor: (_, key: string) => ({
        value: STORE[key],
        writable: true,
        enumerable: true,
        configurable: true,
      }),
    }),
    configurable: true,
  });

  jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Manipula o tempo de criação retroativamente para simular TTL vencido. */
function backdateCache(key: string, msAgo: number) {
  const storeKey = `gst.cache.${key}`;
  const raw = STORE[storeKey];
  if (!raw) return;
  const parsed = JSON.parse(raw);
  parsed.createdAt = new Date(Date.now() - msAgo).toISOString();
  STORE[storeKey] = JSON.stringify(parsed);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('offline-cache — TTL behaviour', () => {
  const KEY = 'test.item';
  const DATA = { id: '1', name: 'Obra Alpha' };

  describe('cache válido (dentro do TTL)', () => {
    it('retorna o dado diretamente quando não expirado', () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.LIST);

      // Simula online
      Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });

      const result = getOfflineCache<typeof DATA>(KEY);

      expect(result).toEqual(DATA);
      expect(isStaleResult(result!)).toBe(false);
    });
  });

  describe('cache expirado — online', () => {
    it('retorna null e remove a entrada', () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.CRITICAL);
      // Volta o timestamp para forçar expiração (TTL.CRITICAL = 120s)
      backdateCache(KEY, CACHE_TTL.CRITICAL + 1);

      Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true });

      const result = getOfflineCache<typeof DATA>(KEY);

      expect(result).toBeNull();
      // Entrada deve ter sido removida do storage
      expect(STORE[`gst.cache.${KEY}`]).toBeUndefined();
    });
  });

  describe('cache expirado — offline', () => {
    it('retorna { stale: true, data } em vez de null', () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.CRITICAL);
      backdateCache(KEY, CACHE_TTL.CRITICAL + 1);

      Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });

      const result = getOfflineCache<typeof DATA>(KEY);

      expect(result).not.toBeNull();
      expect(isStaleResult(result!)).toBe(true);
      if (isStaleResult(result!)) {
        expect(result.stale).toBe(true);
        expect(result.data).toEqual(DATA);
      }

      // Entrada NÃO deve ser removida enquanto offline
      expect(STORE[`gst.cache.${KEY}`]).toBeDefined();
    });
  });

  describe('consumeOfflineCache', () => {
    it('retorna o dado e dispara evento stale quando expirado offline', () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.CRITICAL);
      backdateCache(KEY, CACHE_TTL.CRITICAL + 1);

      Object.defineProperty(global.navigator, 'onLine', { value: false, configurable: true });

      const data = consumeOfflineCache<typeof DATA>(KEY);

      expect(data).toEqual(DATA);
      expect(window.dispatchEvent).toHaveBeenCalled();
    });
  });

  describe('clearExpiredCache', () => {
    it('remove entradas expiradas e mantém as válidas', () => {
      setOfflineCache('expired.key', { v: 1 }, CACHE_TTL.CRITICAL);
      setOfflineCache('fresh.key', { v: 2 }, CACHE_TTL.REFERENCE);

      backdateCache('expired.key', CACHE_TTL.CRITICAL + 1);

      // Monkey-patch para clearExpiredCache iterar via Object.keys
      const origKeys = Object.keys;
      jest.spyOn(Object, 'keys').mockImplementation((obj) => {
        if (obj === window.localStorage) return Object.keys(STORE);
        return origKeys(obj);
      });

      clearExpiredCache();

      jest.restoreAllMocks();

      expect(STORE['gst.cache.expired.key']).toBeUndefined();
      expect(STORE['gst.cache.fresh.key']).toBeDefined();
    });
  });

  describe('CACHE_TTL constants', () => {
    it('define os valores corretos', () => {
      expect(CACHE_TTL.CRITICAL).toBe(120_000);
      expect(CACHE_TTL.LIST).toBe(300_000);
      expect(CACHE_TTL.RECORD).toBe(1_800_000);
      expect(CACHE_TTL.REFERENCE).toBe(3_600_000);
    });
  });
});
