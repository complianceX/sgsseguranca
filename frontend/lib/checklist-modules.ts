export type ChecklistCategoryValue =
  | "Operacional"
  | "Equipamento"
  | "EPI"
  | "SST"
  | "Qualidade"
  | "Interno";

export interface ChecklistCategoryOption {
  value: ChecklistCategoryValue;
  label: string;
  helper: string;
}

export interface ChecklistModuleArea {
  slug:
    | "central"
    | "normativos"
    | "operacionais"
    | "equipamentos"
    | "veiculos"
    | "epis";
  label: string;
  title: string;
  description: string;
  href: string;
  newHref: string;
  category?: ChecklistCategoryValue;
  segment?:
    | "normativos"
    | "operacionais"
    | "equipamentos"
    | "veiculos"
    | "epis";
}

export interface ChecklistRecordsArea {
  slug:
    | "central"
    | "normativos"
    | "operacionais"
    | "equipamentos"
    | "veiculos"
    | "epis";
  label: string;
  title: string;
  description: string;
  href: string;
  newHref: string;
  category?: ChecklistCategoryValue;
  segment?:
    | "normativos"
    | "operacionais"
    | "equipamentos"
    | "veiculos"
    | "epis";
}

export const checklistCategoryOptions: ChecklistCategoryOption[] = [
  {
    value: "Operacional",
    label: "Operacional",
    helper: "NRs, LOTO, rotinas de campo e verificações de atividade.",
  },
  {
    value: "Equipamento",
    label: "Equipamento",
    helper: "Máquinas, ferramentas, veículos e ativos de operação.",
  },
  {
    value: "EPI",
    label: "EPI",
    helper: "Inspeções de equipamentos de proteção individual.",
  },
  {
    value: "SST",
    label: "SST",
    helper: "Modelos gerais de segurança do trabalho.",
  },
  {
    value: "Qualidade",
    label: "Qualidade",
    helper: "Rotinas de conformidade e qualidade operacional.",
  },
  {
    value: "Interno",
    label: "Interno",
    helper: "Checklists administrativos e controles internos.",
  },
];

export const checklistModuleAreas: ChecklistModuleArea[] = [
  {
    slug: "central",
    label: "Central de Modelos",
    title: "Central de Modelos de Checklist",
    description:
      "Organize e gerencie todos os modelos do sistema em um único catálogo operacional.",
    href: "/dashboard/checklist-models",
    newHref: "/dashboard/checklist-models/new",
  },
  {
    slug: "normativos",
    label: "Normativos",
    title: "Modelos Normativos de Checklist",
    description:
      "Modelos ligados a NRs, LOTO e verificações formais de conformidade operacional.",
    href: "/dashboard/checklist-models/normativos",
    newHref: "/dashboard/checklist-models/new?categoria=Operacional&segment=normativos",
    category: "Operacional",
    segment: "normativos",
  },
  {
    slug: "operacionais",
    label: "Operacionais",
    title: "Checklists Operacionais",
    description:
      "Modelos normativos e de rotina operacional, como NRs, LOTO e verificações críticas de campo.",
    href: "/dashboard/checklist-models/operacionais",
    newHref: "/dashboard/checklist-models/new?categoria=Operacional&segment=operacionais",
    category: "Operacional",
    segment: "operacionais",
  },
  {
    slug: "equipamentos",
    label: "Equipamentos",
    title: "Checklists de Equipamentos",
    description:
      "Modelos para máquinas, ferramentas, plataformas, escadas, veículos e ativos operacionais.",
    href: "/dashboard/checklist-models/equipamentos",
    newHref: "/dashboard/checklist-models/new?categoria=Equipamento&segment=equipamentos",
    category: "Equipamento",
    segment: "equipamentos",
  },
  {
    slug: "veiculos",
    label: "Veículos",
    title: "Modelos de Checklist para Veículos",
    description:
      "Modelos para frota, caminhões, guindautos e outros ativos móveis de operação.",
    href: "/dashboard/checklist-models/veiculos",
    newHref: "/dashboard/checklist-models/new?categoria=Equipamento&segment=veiculos",
    category: "Equipamento",
    segment: "veiculos",
  },
  {
    slug: "epis",
    label: "EPI",
    title: "Checklists de EPI",
    description:
      "Modelos voltados para verificação, conservação e liberação de equipamentos de proteção individual.",
    href: "/dashboard/checklist-models/epis",
    newHref: "/dashboard/checklist-models/new?categoria=EPI&segment=epis",
    category: "EPI",
    segment: "epis",
  },
];

export const checklistRecordsAreas: ChecklistRecordsArea[] = [
  {
    slug: "central",
    label: "Todos",
    title: "Central de Checklists",
    description:
      "Base consolidada dos checklists executados em campo, com leitura operacional e evidências.",
    href: "/dashboard/checklists",
    newHref: "/dashboard/checklists/new",
  },
  {
    slug: "normativos",
    label: "Normativos",
    title: "Checklists Normativos",
    description:
      "Execuções relacionadas a NRs, LOTO e verificações normativas críticas.",
    href: "/dashboard/checklists/normativos",
    newHref: "/dashboard/checklists/new?categoria=Operacional&segment=normativos",
    category: "Operacional",
    segment: "normativos",
  },
  {
    slug: "operacionais",
    label: "Operacionais",
    title: "Checklists Operacionais",
    description:
      "Checklists de rotina de campo, atividade e liberação operacional.",
    href: "/dashboard/checklists/operacionais",
    newHref: "/dashboard/checklists/new?categoria=Operacional&segment=operacionais",
    category: "Operacional",
    segment: "operacionais",
  },
  {
    slug: "equipamentos",
    label: "Equipamentos",
    title: "Checklists de Equipamentos",
    description:
      "Inspeções de ativos, máquinas, ferramentas e plataformas operacionais.",
    href: "/dashboard/checklists/equipamentos",
    newHref: "/dashboard/checklists/new?categoria=Equipamento&segment=equipamentos",
    category: "Equipamento",
    segment: "equipamentos",
  },
  {
    slug: "veiculos",
    label: "Veículos",
    title: "Checklists de Veículos",
    description:
      "Frota, caminhões, guindautos e equipamentos móveis de operação.",
    href: "/dashboard/checklists/veiculos",
    newHref: "/dashboard/checklists/new?categoria=Equipamento&segment=veiculos",
    category: "Equipamento",
    segment: "veiculos",
  },
  {
    slug: "epis",
    label: "EPIs",
    title: "Checklists de EPI",
    description:
      "Checklists para verificação, conservação e liberação de equipamentos de proteção individual.",
    href: "/dashboard/checklists/epis",
    newHref: "/dashboard/checklists/new?categoria=EPI&segment=epis",
    category: "EPI",
    segment: "epis",
  },
];

export const getChecklistModuleArea = (
  slug: ChecklistModuleArea["slug"],
): ChecklistModuleArea =>
  checklistModuleAreas.find((area) => area.slug === slug) ??
  checklistModuleAreas[0];

export const getChecklistRecordsArea = (
  slug: ChecklistRecordsArea["slug"],
): ChecklistRecordsArea =>
  checklistRecordsAreas.find((area) => area.slug === slug) ??
  checklistRecordsAreas[0];
