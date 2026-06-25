import {
  setOfflineCache,
  getOfflineCache,
  consumeOfflineCache,
  clearExpiredCache,
  isStaleResult,
  CACHE_TTL,
} from "./offline-cache";

// ---------------------------------------------------------------------------
// Mock: IndexedDB seguro — substituído por Map em memória nos testes
// ---------------------------------------------------------------------------

const mockCacheDB: Record<string, unknown> = {};

jest.mock("./offline-db-secure", () => ({
  secureOfflineDB: {
    get: jest.fn(async (_store: string, key: string) => mockCacheDB[key] ?? null),
    set: jest.fn(async (_store: string, key: string, value: unknown) => {
      mockCacheDB[key] = value;
    }),
    del: jest.fn(async (_store: string, key: string) => {
      delete mockCacheDB[key];
    }),
    keys: jest.fn(async () => Object.keys(mockCacheDB)),
    clear: jest.fn(async () => {
      Object.keys(mockCacheDB).forEach((k) => delete mockCacheDB[k]);
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_TIME = new Date("2026-01-01T00:00:00.000Z");

/** Avança o relógio virtual para simular envelhecimento de cache. */
function backdateCache(_key: string, msAgo: number) {
  jest.setSystemTime(Date.now() + msAgo);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE_TIME);

  // Limpa o mock do IndexedDB entre testes
  Object.keys(mockCacheDB).forEach((k) => delete mockCacheDB[k]);

  jest.spyOn(window, "dispatchEvent").mockImplementation(() => true);

  Object.defineProperty(global.navigator, "onLine", {
    value: true,
    configurable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("offline-cache — TTL behaviour", () => {
  const KEY = "test.item";
  const DATA = { id: "1", name: "Obra Alpha" };

  describe("cache válido (dentro do TTL)", () => {
    it("retorna o dado diretamente quando não expirado", () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.LIST);

      const result = getOfflineCache<typeof DATA>(KEY);

      expect(result).toEqual(DATA);
      expect(isStaleResult(result!)).toBe(false);
    });
  });

  describe("cache expirado — online", () => {
    it("retorna null e remove a entrada", () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.CRITICAL);
      backdateCache(KEY, CACHE_TTL.CRITICAL + 1);

      Object.defineProperty(global.navigator, "onLine", {
        value: true,
        configurable: true,
      });

      const result = getOfflineCache<typeof DATA>(KEY);

      expect(result).toBeNull();
      // Segunda chamada também deve retornar null (entrada removida)
      expect(getOfflineCache<typeof DATA>(KEY)).toBeNull();
    });
  });

  describe("cache expirado — offline", () => {
    it("retorna { stale: true, data } em vez de null", () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.CRITICAL);
      backdateCache(KEY, CACHE_TTL.CRITICAL + 1);

      Object.defineProperty(global.navigator, "onLine", {
        value: false,
        configurable: true,
      });

      const result = getOfflineCache<typeof DATA>(KEY);

      expect(result).not.toBeNull();
      expect(isStaleResult(result!)).toBe(true);
      if (isStaleResult(result!)) {
        expect(result.stale).toBe(true);
        expect(result.data).toEqual(DATA);
      }

      // Entrada não deve ser removida enquanto offline
      expect(getOfflineCache<typeof DATA>(KEY)).not.toBeNull();
    });
  });

  describe("consumeOfflineCache", () => {
    it("retorna o dado e dispara evento stale quando expirado offline", () => {
      setOfflineCache(KEY, DATA, CACHE_TTL.CRITICAL);
      backdateCache(KEY, CACHE_TTL.CRITICAL + 1);

      Object.defineProperty(global.navigator, "onLine", {
        value: false,
        configurable: true,
      });

      const data = consumeOfflineCache<typeof DATA>(KEY);

      expect(data).toEqual(DATA);
      expect(window.dispatchEvent).toHaveBeenCalled();
    });
  });

  describe("clearExpiredCache", () => {
    it("remove entradas expiradas e mantém as válidas", () => {
      setOfflineCache("expired.key", { v: 1 }, CACHE_TTL.CRITICAL);
      setOfflineCache("fresh.key", { v: 2 }, CACHE_TTL.REFERENCE);

      // Avança tempo além do TTL.CRITICAL mas dentro do TTL.REFERENCE
      backdateCache("expired.key", CACHE_TTL.CRITICAL + 1);

      clearExpiredCache();

      expect(getOfflineCache("expired.key")).toBeNull();
      expect(getOfflineCache("fresh.key")).not.toBeNull();
    });
  });

  describe("CACHE_TTL constants", () => {
    it("define os valores corretos", () => {
      expect(CACHE_TTL.CRITICAL).toBe(120_000);
      expect(CACHE_TTL.LIST).toBe(300_000);
      expect(CACHE_TTL.RECORD).toBe(1_800_000);
      expect(CACHE_TTL.REFERENCE).toBe(3_600_000);
    });
  });

  it("remove campos sensiveis antes de persistir no cache", () => {
    setOfflineCache("sensitive.item", {
      titulo: "APR",
      cpf: "12345678900",
      trabalhador: {
        nome: "Operador",
        email: "operador@example.com",
      },
      evidencia: {
        imageDataUrl: "data:image/png;base64,abc",
      },
    });

    const result = getOfflineCache<Record<string, unknown>>("sensitive.item");
    expect(result).not.toBeNull();

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("APR");
    expect(serialized).toContain("Operador");
    expect(serialized).not.toContain("12345678900");
    expect(serialized).not.toContain("operador@example.com");
    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("evidencia");
  });
});
