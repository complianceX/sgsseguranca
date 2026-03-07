export const openPdfForPrint = (
  fileURL: string,
  onPopupBlocked?: () => void,
) => {
  const printWindow = window.open(fileURL, '_blank', 'noopener,noreferrer');

  if (printWindow) {
    const runPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // noop
      }
    };

    if (typeof printWindow.addEventListener === 'function') {
      printWindow.addEventListener('load', runPrint, { once: true });
    } else {
      setTimeout(runPrint, 500);
    }

    return true;
  }

  window.location.assign(fileURL);
  onPopupBlocked?.();
  return false;
};

