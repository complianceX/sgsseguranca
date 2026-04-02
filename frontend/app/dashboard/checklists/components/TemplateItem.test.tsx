import React from "react";
import { render, screen, within } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { TemplateItem } from "./TemplateItem";
import type { ChecklistFormData } from "../types";

function renderTemplateItem(
  overrides?: Partial<ChecklistFormData["itens"][number]>,
) {
  const remove = jest.fn();

  function Harness() {
    const form = useForm<ChecklistFormData>({
      defaultValues: {
        titulo: "Checklist teste",
        descricao: "",
        equipamento: "",
        maquina: "",
        foto_equipamento: "",
        data: "2026-04-02",
        status: "Pendente",
        company_id: "company-1",
        site_id: "site-1",
        inspetor_id: "user-1",
        categoria: "",
        periodicidade: "",
        nivel_risco_padrao: "",
        ativo: true,
        is_modelo: true,
        auditado_por_id: "",
        data_auditoria: "",
        resultado_auditoria: "",
        notas_auditoria: "",
        topicos: [{ id: "topic-1", titulo: "Tópico", ordem: 1 }],
        itens: [
          {
            id: "item-1",
            item: "Item com subitens",
            status: "sim",
            tipo_resposta: "sim_nao_na",
            obrigatorio: true,
            peso: 1,
            resposta: "",
            observacao: "",
            fotos: [],
            topico_id: "topic-1",
            topico_titulo: "Tópico",
            ordem_topico: 1,
            ordem_item: 1,
            subitens: [{ id: "sub-1", texto: "Cobertura adequada", ordem: 1 }],
            ...overrides,
          },
        ],
      },
    });

    return (
      <TemplateItem
        item={form.watch("itens.0")}
        index={0}
        structureMode="machines_equipment"
        register={form.register}
        watch={form.watch}
        setValue={form.setValue}
        remove={remove}
      />
    );
  }

  render(<Harness />);
  return { remove };
}

describe("TemplateItem", () => {
  it("mostra a resposta herdada dos subitens para itens sim/nao/na", () => {
    renderTemplateItem();

    const previewTitle = screen.getByText("Resposta do subitem na execução");
    expect(previewTitle).toBeInTheDocument();
    expect(
      within(previewTitle.parentElement as HTMLElement).getByText(
        "Sim / Não / N/A",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cada subitem será respondido individualmente no preenchimento do checklist.",
      ),
    ).toBeInTheDocument();
  });

  it("não mostra preview de resposta para item de texto livre", () => {
    renderTemplateItem({
      tipo_resposta: "texto",
    });

    expect(
      screen.queryByText("Resposta do subitem na execução"),
    ).not.toBeInTheDocument();
  });
});
