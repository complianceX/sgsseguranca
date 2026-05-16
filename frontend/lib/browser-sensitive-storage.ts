const SENSITIVE_STORAGE_PREFIXES = [
  "gst.cache.",
  "compliancex.cache.",
  "gst.apr.wizard.draft.",
  "compliancex.apr.wizard.draft.",
  "gst.pt.wizard.draft.",
  "compliancex.pt.wizard.draft.",
  "gst.nc.sophie.preview.",
  "checklist.form.draft.",
];

const SENSITIVE_STORAGE_KEYS = [
  "gst.offline.queue",
  "compliancex.offline.queue",
];

export function clearSensitiveBrowserStorage() {
  if (typeof window === "undefined") return;

  for (const key of SENSITIVE_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // best effort
    }
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (SENSITIVE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // best effort
      }
    }
  }
}
