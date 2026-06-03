import { applyAprImportPreview } from "./apr-import";

describe("applyAprImportPreview", () => {
  it("resolve empresa, site, elaborador e normaliza as linhas para o formulario", () => {
    const result = applyAprImportPreview(
      {
        fileName: "apr-exportada.xlsx",
        sheetName: "Riscos APR",
        importedRows: 1,
        ignoredRows: 0,
        warnings: [],
        errors: [],
        matchedColumns: {
          atividade_processo: "Atividade/Processo",
        },
        draft: {
          numero: "APR-2026-010",
          titulo: "APR exportada",
          descricao: "Roundtrip",
          data_inicio: "2026-03-19",
          data_fim: "2026-03-26",
          company_name: "Empresa Teste",
          cnpj: "00.000.000/0001-00",
          site_name: "Obra Centro",
          elaborador_name: "Maria Silva",
          risk_items: [
            {
              atividade_processo: "Montagem",
              condicao_perigosa: "Trabalho sem isolamento",
              probabilidade: 2,
              severidade: 3,
              medidas_prevencao: "Isolar area",
            },
          ],
        },
      },
      {
        selectedCompanyId: "",
        companies: [
          {
            id: "company-1",
            razao_social: "Empresa Teste",
            cnpj: "00.000.000/0001-00",
            endereco: "",
            responsavel: "",
            status: true,
            created_at: "",
            updated_at: "",
          },
        ],
        sites: [
          {
            id: "site-1",
            nome: "Obra Centro",
            company_id: "company-1",
            created_at: "",
            updated_at: "",
          },
        ],
        users: [
          {
            id: "user-1",
            nome: "Maria Silva",
            email: "maria@example.com",
            cpf: "00000000000",
            role: "user",
            company_id: "company-1",
            profile_id: "profile-1",
            created_at: "",
            updated_at: "",
          },
        ],
      },
    );

    expect(result.unresolved).toEqual([]);
    expect(result.fieldValues).toMatchObject({
      numero: "APR-2026-010",
      titulo: "APR exportada",
      descricao: "Roundtrip",
      data_inicio: "2026-03-19",
      data_fim: "2026-03-26",
      company_id: "company-1",
      site_id: "site-1",
      elaborador_id: "user-1",
    });
    expect(result.riskItems[0]).toMatchObject({
      atividade_processo: "Montagem",
      condicao_perigosa: "Trabalho sem isolamento",
      probabilidade: "2",
      severidade: "3",
      categoria_risco: "Atenção",
    });
  });
});
