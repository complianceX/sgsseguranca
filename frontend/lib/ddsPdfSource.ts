import type { Dds } from "@/services/ddsService";

type ResolveDdsPdfSourceOptions = {
  fetchLatest: (id: string) => Promise<Dds>;
  syncCached?: (latest: Dds) => void | Promise<void>;
};

/**
 * PDFs locais usados para emissão/fallback devem ser gerados a partir do DDS
 * mais recente do backend, evitando imprimir status stale da listagem.
 */
export async function resolveDdsPdfSource(
  dds: Dds,
  options: ResolveDdsPdfSourceOptions,
): Promise<Dds> {
  const latest = await options.fetchLatest(dds.id);
  await options.syncCached?.(latest);
  return latest;
}
