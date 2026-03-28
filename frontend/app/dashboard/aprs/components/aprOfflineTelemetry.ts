export type AprOfflineTelemetryEvent =
  | "draft_restored_sanitized"
  | "draft_legacy_detected"
  | "draft_corrupted_discarded"
  | "offline_blocked"
  | "offline_enqueued"
  | "offline_deduplicated"
  | "offline_syncing"
  | "offline_synced"
  | "offline_failed"
  | "offline_orphaned"
  | "offline_released"
  | "offline_discarded";

export type AprOfflineTelemetryDetail = {
  draftId?: string;
  queueItemId?: string;
  dedupeKey?: string;
  aprId?: string;
  syncStatus?: string;
  intent?: "save" | "save_and_print";
  reason?: string;
  source?: string;
};

export const APR_OFFLINE_TELEMETRY_EVENT = "app:apr-offline-telemetry";

export function trackAprOfflineTelemetry(
  event: AprOfflineTelemetryEvent,
  detail: AprOfflineTelemetryDetail = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(APR_OFFLINE_TELEMETRY_EVENT, {
      detail: {
        event,
        timestamp: new Date().toISOString(),
        ...detail,
      },
    }),
  );
}
