import {
  APR_OFFLINE_TELEMETRY_EVENT,
  trackAprOfflineTelemetry,
} from "./aprOfflineTelemetry";

describe("aprOfflineTelemetry", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("dispara evento sanitizado sem incluir payload sensivel", () => {
    const dispatchSpy = jest
      .spyOn(window, "dispatchEvent")
      .mockImplementation(() => true);

    trackAprOfflineTelemetry("offline_enqueued", {
      draftId: "draft-1",
      queueItemId: "queue-1",
      dedupeKey: "apr:create:draft-1",
      syncStatus: "queued",
      source: "test",
    });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchedEvent = dispatchSpy.mock.calls[0][0] as CustomEvent<{
      event: string;
      draftId?: string;
      queueItemId?: string;
      dedupeKey?: string;
      syncStatus?: string;
      source?: string;
      timestamp?: string;
    }>;

    expect(dispatchedEvent.type).toBe(APR_OFFLINE_TELEMETRY_EVENT);
    expect(dispatchedEvent.detail).toMatchObject({
      event: "offline_enqueued",
      draftId: "draft-1",
      queueItemId: "queue-1",
      dedupeKey: "apr:create:draft-1",
      syncStatus: "queued",
      source: "test",
    });
    expect(dispatchedEvent.detail.timestamp).toBeTruthy();
    expect(dispatchedEvent.detail).not.toHaveProperty("signature");
    expect(dispatchedEvent.detail).not.toHaveProperty("signature_data");
    expect(dispatchedEvent.detail).not.toHaveProperty("payload");
  });
});
