import api, { TIMEOUT_EXPORT } from './api';

export async function downloadExcel(url: string, filename: string): Promise<void> {
  const response = await api.get(url, { responseType: 'blob', timeout: TIMEOUT_EXPORT });
  const href = URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}
