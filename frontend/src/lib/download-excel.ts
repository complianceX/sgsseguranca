import api, { TIMEOUT_EXPORT } from './api';

export async function fetchExcelBlob(url: string): Promise<Blob> {
  const response = await api.get(url, { responseType: 'blob', timeout: TIMEOUT_EXPORT });
  return response.data as Blob;
}

export function downloadExcelBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

export async function downloadExcel(url: string, filename: string): Promise<void> {
  downloadExcelBlob(await fetchExcelBlob(url), filename);
}
