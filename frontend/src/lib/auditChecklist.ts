export type AuditChecklistAnswerValue = "sim" | "nao" | "na";
export type AuditChecklistCriticality = "baixa" | "media" | "alta" | "critica";
export type AuditChecklistPhotoRule = "always" | "nao";

export type AuditChecklistEvidence = {
  id: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  dataUrl: string;
  capturedAt: string;
  hash?: string;
};

export type AuditChecklistQuestion = {
  sectionId: string;
  sectionTitle: string;
  questionId: string;
  question: string;
  requirement: string;
  criticality: AuditChecklistCriticality;
  allowsPhoto?: boolean;
  photoRequiredWhen?: AuditChecklistPhotoRule;
  suggestedAction?: string;
};

export type AuditChecklistAnswer = AuditChecklistQuestion & {
  answer: AuditChecklistAnswerValue;
  observation?: string;
  evidences?: AuditChecklistEvidence[];
};

export const AUDIT_CHECKLIST_SECTIONS: Array<{
  id: string;
  title: string;
  questions: Omit<AuditChecklistQuestion, "sectionId" | "sectionTitle">[];
}> = [
  {
    id: "documentacao-sst",
    title: "Documentação SST",
    questions: [
      {
        questionId: "doc-pgr-vigente",
        question: "O PGR está vigente, assinado e compatível com a frente auditada?",
        requirement: "NR-01 / GRO / PGR",
        criticality: "alta",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Atualizar, aprovar e disponibilizar o PGR vigente para a frente auditada.",
      },
      {
        questionId: "doc-pcmso-coerente",
        question: "O PCMSO está coerente com os riscos do PGR e trabalhadores ativos?",
        requirement: "NR-07 / PCMSO",
        criticality: "alta",
        suggestedAction:
          "Revisar integração entre PGR, PCMSO e cadastro de trabalhadores ativos.",
      },
      {
        questionId: "doc-registros-rastreaveis",
        question: "Os registros avaliados possuem data, responsável e rastreabilidade?",
        requirement: "Procedimento interno de gestão documental",
        criticality: "media",
        suggestedAction:
          "Padronizar nomenclatura, responsáveis e evidências mínimas dos registros.",
      },
    ],
  },
  {
    id: "apr-pt-dds",
    title: "APR / PT / DDS",
    questions: [
      {
        questionId: "apr-antes-atividade",
        question: "A APR é preenchida antes do início das atividades críticas?",
        requirement: "NR-01 / Procedimento APR",
        criticality: "alta",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Implantar trava de início/execução sem APR aprovada para atividades críticas.",
      },
      {
        questionId: "apr-encerramento-validado",
        question: "A APR possui encerramento validado pelo responsável operacional?",
        requirement: "Procedimento APR / rastreabilidade",
        criticality: "alta",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Bloquear encerramento de APR sem assinatura e evidência de verificação final.",
      },
      {
        questionId: "pt-controles-criticos",
        question: "As PTs incluem controles críticos aplicáveis antes da liberação?",
        requirement: "PT / NR-10 / NR-35 / requisitos internos",
        criticality: "alta",
        suggestedAction:
          "Revisar checklist de PT e exigir validação dos controles críticos antes da liberação.",
      },
      {
        questionId: "dds-tema-risco",
        question: "Os DDS recentes estão alinhados aos riscos predominantes da operação?",
        requirement: "Programa de comunicação e treinamento SST",
        criticality: "media",
        suggestedAction:
          "Planejar DDS por matriz de risco semanal e registrar presença dos participantes.",
      },
    ],
  },
  {
    id: "epis",
    title: "EPIs",
    questions: [
      {
        questionId: "epi-ficha-atualizada",
        question: "As fichas de EPI estão atualizadas com CA, data e assinatura?",
        requirement: "NR-06",
        criticality: "alta",
        suggestedAction:
          "Regularizar fichas de entrega com CA, validade, assinatura e responsável.",
      },
      {
        questionId: "epi-uso-campo",
        question: "O uso de EPI em campo está compatível com os riscos observados?",
        requirement: "NR-06 / APR da atividade",
        criticality: "alta",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Reforçar fiscalização e DDS específico sobre uso correto de EPIs obrigatórios.",
      },
    ],
  },
  {
    id: "maquinas-equipamentos",
    title: "Máquinas e equipamentos",
    questions: [
      {
        questionId: "maquinas-protecao",
        question: "Máquinas e equipamentos possuem proteções e sinalizações preservadas?",
        requirement: "NR-12",
        criticality: "critica",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Interditar condição crítica quando aplicável e restaurar proteção/sinalização antes da operação.",
      },
      {
        questionId: "bloqueio-etiquetagem",
        question: "Há bloqueio e etiquetagem para intervenções de manutenção?",
        requirement: "NR-10 / NR-12 / LOTO",
        criticality: "critica",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Formalizar LOTO, treinar executantes e auditar bloqueios antes de cada intervenção.",
      },
    ],
  },
  {
    id: "ordem-limpeza-trafego",
    title: "Ordem, limpeza e tráfego",
    questions: [
      {
        questionId: "rotas-sinalizadas",
        question: "Rotas de pedestres e equipamentos móveis estão segregadas e sinalizadas?",
        requirement: "NR-12 / NR-22 / plano de tráfego",
        criticality: "alta",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Reforçar segregação física, sinalização horizontal/vertical e controle de velocidade.",
      },
      {
        questionId: "organizacao-frente",
        question: "A frente auditada apresenta organização, limpeza e ausência de obstruções?",
        requirement: "Boas práticas SST / housekeeping",
        criticality: "media",
        allowsPhoto: true,
        suggestedAction:
          "Executar 5S/housekeeping e registrar evidência pós-correção.",
      },
    ],
  },
  {
    id: "emergencia",
    title: "Emergência",
    questions: [
      {
        questionId: "emergencia-acessos",
        question: "Rotas de fuga, extintores e equipamentos de emergência estão desobstruídos?",
        requirement: "Plano de emergência / PPCI / requisitos internos",
        criticality: "critica",
        allowsPhoto: true,
        photoRequiredWhen: "nao",
        suggestedAction:
          "Desobstruir rota/equipamento imediatamente e registrar inspeção corretiva.",
      },
      {
        questionId: "simulados-registros",
        question: "Há registros recentes de simulados ou orientações de emergência?",
        requirement: "Plano de atendimento a emergências",
        criticality: "media",
        suggestedAction:
          "Programar simulado, registrar participantes e consolidar lições aprendidas.",
      },
    ],
  },
  {
    id: "nao-conformidades-capas",
    title: "Não conformidades e CAPAs",
    questions: [
      {
        questionId: "capas-prazo",
        question: "CAPAs abertas possuem responsável, prazo e status atualizado?",
        requirement: "Gestão de ações corretivas",
        criticality: "alta",
        suggestedAction:
          "Atualizar plano de CAPAs e escalar ações vencidas para liderança responsável.",
      },
      {
        questionId: "eficacia-verificada",
        question: "A eficácia das ações encerradas é verificada com evidência objetiva?",
        requirement: "Gestão de melhoria contínua SST",
        criticality: "media",
        allowsPhoto: true,
        suggestedAction:
          "Criar rotina de verificação de eficácia com evidência objetiva anexada.",
      },
    ],
  },
];

export const AUDIT_CHECKLIST_QUESTIONS: AuditChecklistQuestion[] =
  AUDIT_CHECKLIST_SECTIONS.flatMap((section) =>
    section.questions.map((question) => ({
      ...question,
      sectionId: section.id,
      sectionTitle: section.title,
    })),
  );

export function createDefaultAuditChecklistAnswers(): AuditChecklistAnswer[] {
  return AUDIT_CHECKLIST_QUESTIONS.map((question) => ({
    ...question,
    answer: "na",
    observation: "",
    evidences: [],
  }));
}

export function mergeAuditChecklistAnswers(
  existing?: AuditChecklistAnswer[] | null,
): AuditChecklistAnswer[] {
  const byQuestionId = new Map(
    (existing ?? []).map((answer) => [answer.questionId, answer]),
  );

  return AUDIT_CHECKLIST_QUESTIONS.map((question) => {
    const current = byQuestionId.get(question.questionId);
    return {
      ...question,
      answer: current?.answer ?? "na",
      observation: current?.observation ?? "",
      evidences: current?.evidences ?? [],
    };
  });
}

export function formatAuditChecklistAnswer(value?: AuditChecklistAnswerValue) {
  switch (value) {
    case "sim":
      return "Sim";
    case "nao":
      return "Não";
    case "na":
    default:
      return "N/A";
  }
}
