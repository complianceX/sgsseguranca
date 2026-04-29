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
});
