'use client';

type ClientMetricEventName =
  | 'cache_hit'
  | 'cache_miss'
  | 'cache_inflight_reuse'
  | 'cache_invalidate'
  | 'cache_invalidate_all'
  | 'fetch_success'
  | 'fetch_error';

export type ClientMetricPayload = {
  name: ClientMetricEventName;
  key: string;
  durationMs?: number;
  ttlMs?: number;
  detail?: Record<string, unknown>;
  at: number;
};

declare global {
  interface Window {
    __sgsClientMetrics__?: ClientMetricPayload[];
  }
}

export function recordClientMetric(payload: Omit<ClientMetricPayload, 'at'>) {
  if (typeof window === 'undefined') {
    return;
  }

  const eventPayload: ClientMetricPayload = {
    ...payload,
    at: Date.now(),
  };

  if (!window.__sgsClientMetrics__) {
    window.__sgsClientMetrics__ = [];
  }

  window.__sgsClientMetrics__.push(eventPayload);

  if (window.__sgsClientMetrics__.length > 200) {
    window.__sgsClientMetrics__ = window.__sgsClientMetrics__.slice(-200);
  }

  window.dispatchEvent(
    new CustomEvent<ClientMetricPayload>('app:client-metric', {
      detail: eventPayload,
    }),
  );
}

