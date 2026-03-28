import api from "@/lib/api";
import {
  enqueueOfflineMutation,
  getOfflineQueueSnapshot,
  removeOfflineQueueItem,
  retryOfflineQueueItem,
} from "./offline-sync";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
  },
}));

describe("offline-sync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    jest.clearAllMocks();
    jest.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("deduplica enqueue pela dedupeKey e preserva um identificador estavel", async () => {
    const first = await enqueueOfflineMutation({
      url: "/aprs",
      method: "post",
      data: { numero: "APR-1" },
      label: "APR",
      correlationId: "apr:draft:draft-1",
      dedupeKey: "apr:create:draft-1",
      meta: {
        module: "apr",
        entityType: "apr_base",
        draftId: "draft-1",
      },
    });
    const second = await enqueueOfflineMutation({
      url: "/aprs",
      method: "post",
      data: { numero: "APR-1B" },
      label: "APR",
      correlationId: "apr:draft:draft-1",
      dedupeKey: "apr:create:draft-1",
      meta: {
        module: "apr",
        entityType: "apr_base",
        draftId: "draft-1",
      },
    });

    const snapshot = await getOfflineQueueSnapshot();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe(first.id);
    expect(snapshot[0].correlationId).toBe("apr:draft:draft-1");
    expect(snapshot[0].data).toEqual({ numero: "APR-1B" });
    expect((second as { deduplicated?: boolean }).deduplicated).toBe(true);
  });

  it("mantem a mesma entrada durante retentativas sem duplicar a fila", async () => {
    (api.request as jest.Mock).mockRejectedValue(new Error("falha de rede"));

    const queued = await enqueueOfflineMutation({
      url: "/aprs",
      method: "post",
      data: { numero: "APR-2" },
      label: "APR",
      correlationId: "apr:draft:draft-2",
      dedupeKey: "apr:create:draft-2",
      meta: {
        module: "apr",
        entityType: "apr_base",
        draftId: "draft-2",
      },
    });

    const result = await retryOfflineQueueItem(queued.id);
    const snapshot = await getOfflineQueueSnapshot();

    expect(result.status).toBe("pending");
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].id).toBe(queued.id);
    expect(snapshot[0].state).toBe("retry_waiting");
    expect(snapshot[0].attempts).toBe(1);
  });

  it("remove explicitamente a entrada da fila sem deixar resíduo duplicado", async () => {
    const queued = await enqueueOfflineMutation({
      url: "/aprs",
      method: "post",
      data: { numero: "APR-3" },
      label: "APR",
      correlationId: "apr:draft:draft-3",
      dedupeKey: "apr:create:draft-3",
    });

    await removeOfflineQueueItem(queued.id);

    expect(await getOfflineQueueSnapshot()).toEqual([]);
  });
});
