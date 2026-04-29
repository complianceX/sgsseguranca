import {
  dedupeDdsUsersById,
  isDdsUserVisibleForSite,
} from "@/lib/dds-user-scope";

describe("dds user scope helpers", () => {
  it("inclui apenas usuários da obra selecionada quando há obra selecionada", () => {
    expect(
      isDdsUserVisibleForSite(
        { company_id: "company-1", site_id: "site-1" },
        "company-1",
        "site-1",
      ),
    ).toBe(true);

    expect(
      isDdsUserVisibleForSite(
        { company_id: "company-1", site_id: undefined },
        "company-1",
        "site-1",
      ),
    ).toBe(false);
  });

  it("inclui usuários da empresa quando ainda não há obra selecionada", () => {
    expect(
      isDdsUserVisibleForSite(
        { company_id: "company-1", site_id: undefined },
        "company-1",
        "",
      ),
    ).toBe(true);
  });

  it("bloqueia usuários de outra empresa ou outra obra", () => {
    expect(
      isDdsUserVisibleForSite(
        { company_id: "company-2", site_id: undefined },
        "company-1",
        "site-1",
      ),
    ).toBe(false);

    expect(
      isDdsUserVisibleForSite(
        { company_id: "company-1", site_id: "site-2" },
        "company-1",
        "site-1",
      ),
    ).toBe(false);
  });

  it("deduplica usuários preservando a última versão carregada", () => {
    const result = dedupeDdsUsersById([
      { id: "user-1", nome: "Antigo" },
      { id: "user-2", nome: "Dois" },
      { id: "user-1", nome: "Atualizado" },
    ]);

    expect(result).toEqual([
      { id: "user-1", nome: "Atualizado" },
      { id: "user-2", nome: "Dois" },
    ]);
  });
});
