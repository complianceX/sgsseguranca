import api from '@/lib/api';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getFilenameFromHeaders = (
  fallback: string,
  contentDisposition?: string,
) => {
  if (!contentDisposition) {
    return fallback;
  }
  const match = contentDisposition.match(/filename="([^"]+)"/i);
  return match?.[1] || fallback;
};

export const dossiersService = {
  downloadEmployeePdf: async (userId: string) => {
    const response = await api.get(`/dossiers/employee/${userId}/pdf`, {
      responseType: 'blob',
    });
    const filename = getFilenameFromHeaders(
      `dossie_colaborador_${userId}.pdf`,
      response.headers['content-disposition'],
    );
    downloadBlob(response.data as Blob, filename);
  },

  downloadContractPdf: async (contractId: string) => {
    const response = await api.get(`/dossiers/contract/${contractId}/pdf`, {
      responseType: 'blob',
    });
    const filename = getFilenameFromHeaders(
      `dossie_contrato_${contractId}.pdf`,
      response.headers['content-disposition'],
    );
    downloadBlob(response.data as Blob, filename);
  },

  downloadSitePdf: async (siteId: string) => {
    const response = await api.get(`/dossiers/site/${siteId}/pdf`, {
      responseType: 'blob',
    });
    const filename = getFilenameFromHeaders(
      `dossie_obra_${siteId}.pdf`,
      response.headers['content-disposition'],
    );
    downloadBlob(response.data as Blob, filename);
  },
};
