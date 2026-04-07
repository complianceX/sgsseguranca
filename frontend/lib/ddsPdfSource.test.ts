import type { Dds } from "@/services/ddsService";
import { resolveDdsPdfSource } from "./ddsPdfSource";

const baseDds = {
  id: "dds-1",
  tema: "DDS",
  data: "2026-04-06",
  status: "rascunho",
  company_id: "company-1",
  site_id: "site-1",
  facilitador_id: "user-1",
  participants: [],
  created_at: "2026-04-06T08:00:00.000Z",
  updated_at: "2026-04-06T08:00:00.000Z",
} satisfies Dds;

describe("resolveDdsPdfSource", () => {
  it("busca o DDS mais recente antes da geração local do PDF", async () => {
    const latest = {
      ...baseDds,
      status: "publicado",
    } satisfies Dds;
    const fetchLatest = jest.fn().mockResolvedValue(latest);

    await expect(
      resolveDdsPdfSource(baseDds, {
        fetchLatest,
      }),
    ).resolves.toEqual(latest);

    expect(fetchLatest).toHaveBeenCalledWith("dds-1");
  });

  it("sincroniza o cache local quando um callback é informado", async () => {
    const latest = {
      ...baseDds,
      status: "auditado",
      pdf_file_key: "documents/company-1/dds/dds-1/dds-final.pdf",
    } satisfies Dds;
    const fetchLatest = jest.fn().mockResolvedValue(latest);
    const syncCached = jest.fn();

    await resolveDdsPdfSource(baseDds, {
      fetchLatest,
      syncCached,
    });

    expect(syncCached).toHaveBeenCalledWith(latest);
  });
});
