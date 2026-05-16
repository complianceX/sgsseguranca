import type { ChecklistTopicValue } from '../types/checklist-item.type';
import {
  buildPresetTopics,
  type PresetChecklistTopicDefinition,
} from './preset-template.utils';

const topics: PresetChecklistTopicDefinition[] = [
  {
    id: 'pemt-topic-1',
    titulo: 'Identificação, Documentação e Liberação',
    ordem: 1,
    itens: [
      {
        subitem: 'Manual',
        item: 'O manual do fabricante está disponível para consulta?',
        criticidade: 'alto',
        acao: 'Disponibilizar o manual aplicável antes da liberação.',
      },
      {
        subitem: 'Identificação',
        item: 'A identificação da plataforma, patrimônio ou série está legível?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Regularizar a identificação física e rastreável antes do uso.',
      },
      {
        subitem: 'Capacidade',
        item: 'A capacidade nominal e os limites de carga estão legíveis?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Bloquear o equipamento até restabelecer a identificação da capacidade.',
      },
      {
        subitem: 'Liberação',
        item: 'Existe registro de inspeção e liberação vigente?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Executar a inspeção pendente e manter o equipamento bloqueado até aprovação.',
      },
    ],
  },
  {
    id: 'pemt-topic-2',
    titulo: 'Estrutura, Acesso e Proteções',
    ordem: 2,
    itens: [
      {
        subitem: 'Estrutura',
        item: 'Chassi, plataforma e estrutura estão sem trincas, deformações ou corrosão severa?',
        criticidade: 'critico',
        bloqueia: true,
        fotoObrigatoria: true,
        acao: 'Retirar o equipamento de operação e encaminhar para avaliação estrutural.',
      },
      {
        subitem: 'Acesso',
        item: 'O guarda-corpo, portão ou barra de acesso estão íntegros e firmes?',
        criticidade: 'critico',
        bloqueia: true,
        fotoObrigatoria: true,
        acao: 'Impedir o uso até recomposição integral do sistema de proteção.',
      },
      {
        subitem: 'Condição geral',
        item: 'Há ausência de vazamentos, partes soltas ou improvisos estruturais?',
        criticidade: 'critico',
        bloqueia: true,
        fotoObrigatoria: true,
        acao: 'Bloquear o equipamento e corrigir a condição insegura antes da liberação.',
      },
    ],
  },
  {
    id: 'pemt-topic-3',
    titulo: 'Sistema Elétrico e Energia',
    ordem: 3,
    itens: [
      {
        subitem: 'Cabos e conexões',
        item: 'Os cabos, chicotes, conexões e comandos estão sem danos aparentes?',
        criticidade: 'critico',
        bloqueia: true,
        fotoObrigatoria: true,
        acao: 'Bloquear o equipamento e substituir os componentes elétricos danificados.',
      },
      {
        subitem: 'Painéis',
        item: 'Os painéis, compartimentos e proteções elétricas estão fechados?',
        criticidade: 'alto',
        acao: 'Restabelecer o fechamento e a proteção do compartimento antes do uso.',
      },
      {
        subitem: 'Energia',
        item: 'A bateria, a carga e o carregador estão em condição segura para operação?',
        criticidade: 'alto',
        acao: 'Regularizar o sistema de alimentação antes da próxima operação.',
      },
    ],
  },
  {
    id: 'pemt-topic-4',
    titulo: 'Comandos e Emergência',
    ordem: 4,
    itens: [
      {
        subitem: 'Comandos',
        item: 'Os comandos da base e da plataforma estão respondendo corretamente?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Interditar o equipamento até correção e reteste funcional.',
      },
      {
        subitem: 'Parada de emergência',
        item: 'A parada de emergência e a descida de emergência estão operantes?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Bloquear imediatamente o equipamento até reparo e validação.',
      },
      {
        subitem: 'Alarmes e indicadores',
        item: 'Os alarmes, indicadores e limitadores de segurança estão funcionando?',
        criticidade: 'alto',
        acao: 'Corrigir os dispositivos de indicação e segurança antes da liberação.',
      },
    ],
  },
  {
    id: 'pemt-topic-5',
    titulo: 'Estabilidade e Área de Operação',
    ordem: 5,
    itens: [
      {
        subitem: 'Piso',
        item: 'O piso está firme, nivelado e capaz de suportar o equipamento?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Proibir o posicionamento até definir base segura ou tratar o piso.',
      },
      {
        subitem: 'Estabilização',
        item: 'Os estabilizadores, apoios e travamentos estão funcionando e posicionados corretamente?',
        criticidade: 'critico',
        bloqueia: true,
        fotoObrigatoria: true,
        acao: 'Bloquear o uso até restabelecer a estabilidade prevista pelo fabricante.',
      },
      {
        subitem: 'Área',
        item: 'A área está isolada, sinalizada e com clima e visibilidade seguros?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Suspender a atividade até tornar a área segura para operação.',
      },
    ],
  },
  {
    id: 'pemt-topic-6',
    titulo: 'Operador, EPI e Comunicação',
    ordem: 6,
    itens: [
      {
        subitem: 'Operador',
        item: 'O operador está capacitado e formalmente autorizado?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Impedir a operação por esse trabalhador até regularização formal.',
      },
      {
        subitem: 'EPI e briefing',
        item: 'Os EPIs, conectores e orientações de segurança foram conferidos antes da operação?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Substituir o EPI inadequado e alinhar a equipe antes do início da tarefa.',
      },
    ],
  },
  {
    id: 'pemt-topic-7',
    titulo: 'Operação Segura, Manutenção e Pós-Uso',
    ordem: 7,
    itens: [
      {
        subitem: 'Limites operacionais',
        item: 'A capacidade, o deslocamento e os limites do fabricante estão sendo respeitados?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Paralisar a operação e replanejar conforme os limites técnicos aplicáveis.',
      },
      {
        subitem: 'Falhas e encerramento',
        item: 'As falhas e manutenções pendentes foram registradas antes do recolhimento seguro?',
        criticidade: 'critico',
        bloqueia: true,
        acao: 'Bloquear o equipamento, registrar a ocorrência e concluir o encerramento seguro.',
      },
    ],
  },
];

export function buildPemtTopics(): ChecklistTopicValue[] {
  return buildPresetTopics(topics);
}
