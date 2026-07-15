import { downloadExcelBlob, fetchExcelBlob } from "@/lib/download-excel";

type RdoExcelExportOptions = {
  url: string;
  filename: string;
  isCurrent: () => boolean;
};

/** Obtém o arquivo sem efeitos colaterais e só inicia o download no contexto atual. */
export async function exportCurrentRdoExcel({
  url,
  filename,
  isCurrent,
}: RdoExcelExportOptions): Promise<boolean> {
  if (!isCurrent()) return false;
  const blob = await fetchExcelBlob(url);
  if (!isCurrent()) return false;
  downloadExcelBlob(blob, filename);
  return true;
}
