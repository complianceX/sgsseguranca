function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function resolveSafeBrowserUrl(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    throw new Error("URL vazia.");
  }

  if (trimmedUrl.startsWith("blob:")) {
    return trimmedUrl;
  }

  const parsed = new URL(trimmedUrl, window.location.origin);
  const allowedHttp =
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" &&
      (isLocalhost(parsed.hostname) || isLocalhost(window.location.hostname)));

  if (!allowedHttp) {
    throw new Error(`Protocolo de URL não permitido: ${parsed.protocol}`);
  }

  return parsed.toString();
}

export function openUrlInNewTab(rawUrl: string, onPopupBlocked?: () => void) {
  const safeUrl = resolveSafeBrowserUrl(rawUrl);
  const openedWindow = window.open(safeUrl, "_blank", "noopener,noreferrer");

  if (openedWindow) {
    return true;
  }

  window.location.assign(safeUrl);
  onPopupBlocked?.();
  return false;
}

export function preparePdfPrintWindow(): Window | null {
  const printWindow = window.open("about:blank", "_blank");
  if (printWindow) {
    printWindow.opener = null;
  }

  return printWindow;
}

export const openPdfForPrint = (
  fileURL: string,
  onPopupBlocked?: () => void,
  preparedWindow?: Window | null,
) => {
  const safeUrl = resolveSafeBrowserUrl(fileURL);
  const printWindow = preparedWindow ?? window.open("about:blank", "_blank");

  if (printWindow) {
    printWindow.opener = null;

    const runPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // noop
      }
    };

    if (typeof printWindow.addEventListener === "function") {
      printWindow.addEventListener("load", runPrint, { once: true });
    } else {
      setTimeout(runPrint, 500);
    }

    printWindow.location.href = safeUrl;

    return true;
  }

  onPopupBlocked?.();
  return false;
};
