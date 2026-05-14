import type {
  EquipamentoItem,
  MaoDeObraItem,
  MaterialItem,
  OcorrenciaItem,
  Rdo,
  ServicoItem,
} from "@/services/rdosService";

type RdoRowKeyed<T> = T & {
  __rowKey: string;
};

export type PendingActivityPhoto = {
  file: File;
  previewUrl: string;
  name: string;
};

export type RdoMaoDeObraItem = RdoRowKeyed<MaoDeObraItem>;
export type RdoEquipamentoItem = RdoRowKeyed<EquipamentoItem>;
export type RdoMaterialItem = RdoRowKeyed<MaterialItem>;
export type RdoServicoItem = RdoRowKeyed<ServicoItem>;
export type RdoOcorrenciaItem = RdoRowKeyed<OcorrenciaItem>;

export type RdoFormState = {
  data: string;
  site_id: string;
  responsavel_id: string;
  clima_manha: string;
  clima_tarde: string;
  temperatura_min: string;
  temperatura_max: string;
  condicao_terreno: string;
  mao_de_obra: RdoMaoDeObraItem[];
  equipamentos: RdoEquipamentoItem[];
  materiais_recebidos: RdoMaterialItem[];
  servicos_executados: RdoServicoItem[];
  ocorrencias: RdoOcorrenciaItem[];
  houve_acidente: boolean;
  houve_paralisacao: boolean;
  motivo_paralisacao: string;
  observacoes: string;
  programa_servicos_amanha: string;
};

export type RdoSignModalState = {
  rdo: Rdo;
  tipo: "responsavel" | "engenheiro";
} | null;
