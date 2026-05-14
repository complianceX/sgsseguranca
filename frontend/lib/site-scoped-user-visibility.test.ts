import { isUserVisibleForSite } from "@/lib/site-scoped-user-visibility";

describe("site-scoped user visibility", () => {
  it("inclui usuario da obra selecionada", () => {
    expect(
      isUserVisibleForSite(
        { company_id: "company-1", site_id: "site-1" },
        "company-1",
        "site-1",
      ),
    ).toBe(true);
  });

  it("inclui usuario company-scoped quando ha obra selecionada", () => {
    expect(
      isUserVisibleForSite(
        { company_id: "company-1", site_id: null },
        "company-1",
        "site-1",
      ),
    ).toBe(true);
  });

  it("bloqueia usuario de outra obra ou outro tenant", () => {
    expect(
      isUserVisibleForSite(
        { company_id: "company-1", site_id: "site-2" },
        "company-1",
        "site-1",
      ),
    ).toBe(false);

    expect(
      isUserVisibleForSite(
        { company_id: "company-2", site_id: null },
        "company-1",
        "site-1",
      ),
    ).toBe(false);
  });

  it("inclui todos do tenant quando ainda nao ha obra selecionada", () => {
    expect(
      isUserVisibleForSite(
        { company_id: "company-1", site_id: "site-9" },
        "company-1",
        "",
      ),
    ).toBe(true);
  });

  it("inclui usuario com site_ids ou sites vinculados e perfis corporativos", () => {
    expect(
      isUserVisibleForSite(
        { company_id: "company-1", site_ids: ["site-2", "site-3"] },
        "company-1",
        "site-3",
      ),
    ).toBe(true);

    expect(
      isUserVisibleForSite(
        {
          company_id: "company-1",
          sites: [{ id: "site-4" }],
        },
        "company-1",
        "site-4",
      ),
    ).toBe(true);

    expect(
      isUserVisibleForSite(
        {
          company_id: "company-1",
          site_id: "site-9",
          profile: { nome: "Administrador da Empresa" },
        },
        "company-1",
        "site-1",
      ),
    ).toBe(true);
  });
});
