const DANGEROUS_CHARS = /[\u0000-\u001f\u007f\\]/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";

function getBrowserOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  return "https://app.sgs.local";
}

function isLocalhost(hostname: string) {
  return LOCAL_HOSTS.has(hostname);
}

function getConfiguredApiOrigin() {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function getConfiguredAppOrigin() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function hasDangerousCharacters(value: string) {
  if (DANGEROUS_CHARS.test(value)) return true;
  try {
    return DANGEROUS_CHARS.test(decodeURIComponent(value));
  } catch {
    return true;
  }
}

function isAllowedR2Host(hostname: string) {
  return hostname === "r2.cloudflarestorage.com" || hostname.endsWith(R2_HOST_SUFFIX);
}

function isAllowedArtifactOrigin(parsed: URL, browserOrigin: string) {
  const apiOrigin = getConfiguredApiOrigin();
  const appOrigin = getConfiguredAppOrigin();
  const isSameOrigin = parsed.origin === browserOrigin;
  const isAppOrigin = Boolean(appOrigin && parsed.origin === appOrigin);
  const isApiOrigin = Boolean(apiOrigin && parsed.origin === apiOrigin);
  const isR2Origin = parsed.protocol === "https:" && isAllowedR2Host(parsed.hostname);

  return isSameOrigin || isAppOrigin || isApiOrigin || isR2Origin;
}

export function safeExternalArtifactUrl(
  rawUrl: string | null | undefined,
): string | null {
  const value = String(rawUrl || "").trim();
  if (!value || hasDangerousCharacters(value)) return null;

  if (value.startsWith("//")) {
    return null;
  }

  const browserOrigin = getBrowserOrigin();

  if (value.startsWith("blob:")) {
    const blobOrigin = value.slice("blob:".length);
    try {
      const parsedBlobOrigin = new URL(blobOrigin);
      if (!isAllowedArtifactOrigin(parsedBlobOrigin, browserOrigin)) {
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(value, browserOrigin);
  } catch {
    return null;
  }

  const isHttp =
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" &&
      (isLocalhost(parsed.hostname) ||
        (typeof window !== "undefined" && isLocalhost(window.location.hostname))));

  if (!isHttp) return null;

  if (!isAllowedArtifactOrigin(parsed, browserOrigin)) {
    return null;
  }

  return parsed.toString();
}

export function openSafeExternalUrlInNewTab(
  rawUrl: string | null | undefined,
  onPopupBlocked?: () => void,
) {
  const safeUrl = safeExternalArtifactUrl(rawUrl);
  if (!safeUrl) {
    throw new Error("URL externa bloqueada pela política de segurança.");
  }

  const openedWindow = window.open(safeUrl, "_blank", "noopener,noreferrer");
  if (openedWindow) {
    return true;
  }

  window.location.assign(safeUrl);
  onPopupBlocked?.();
  return false;
}
