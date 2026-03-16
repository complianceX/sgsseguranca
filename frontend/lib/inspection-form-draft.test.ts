import {
  buildInspectionDraftStorageKey,
  mergeInspectionDraftWithPrefill,
} from "./inspection-form-draft";

describe("buildInspectionDraftStorageKey", () => {
  it("isola rascunhos fotograficos por contexto", () => {
    expect(
      buildInspectionDraftStorageKey({
        userId: "user-1",
        isPhotographicReport: true,
        prefillSiteId: "site-123",
        prefillArea: "Subestação Principal",
        prefillResponsibleId: "resp-9",
      }),
    ).toBe(
      "inspection.form.draft.user-1.photographic.site-123.subestacao-principal.resp-9",
    );
  });

  it("mantem chave simples para formularios padrao sem contexto", () => {
    expect(
      buildInspectionDraftStorageKey({
        userId: "user-1",
        isPhotographicReport: false,
      }),
    ).toBe("inspection.form.draft.user-1.standard");
  });
});

describe("mergeInspectionDraftWithPrefill", () => {
  it("preserva o rascunho e reaplica o contexto fotografico atual", () => {
    expect(
      mergeInspectionDraftWithPrefill(
        {
          site_id: "site-antigo",
          setor_area: "Soldagem",
          responsavel_id: "old-user",
          objetivo: "Texto antigo",
          tipo_inspecao: "Rotina",
          metodologia: ["Checklist de conformidade"],
        },
        {
          isPhotographicReport: true,
          prefillSiteId: "site-sub",
          prefillArea: "Subestação",
          prefillResponsibleId: "resp-2",
          prefillGoal: "Objetivo novo",
          hasExplicitGoalPrefill: true,
        },
      ),
    ).toEqual({
      site_id: "site-sub",
      setor_area: "Subestação",
      responsavel_id: "resp-2",
      objetivo: "Objetivo novo",
      tipo_inspecao: "Especial",
      metodologia: [
        "Checklist de conformidade",
        "Observação direta em campo",
        "Registro fotográfico",
      ],
    });
  });
});
