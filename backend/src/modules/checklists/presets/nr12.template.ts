import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildNr12OperationalTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'nr12-topic-1',
      titulo: 'Inventário, Documentação e Análise',
      ordem: 1,
      itens: [
        {
          subitem: 'Inventário',
          item: 'A máquina consta do inventário com identificação, capacidade e riscos associados?',
          criticidade: 'alto',
          acao: 'Atualizar o inventário antes da continuidade operacional.',
        },
        {
          subitem: 'Manual',
          item: 'O manual do fabricante está disponível em português e acessível aos usuários?',
          criticidade: 'alto',
          acao: 'Disponibilizar o manual ou instrução técnica equivalente antes da operação.',
        },
        {
          subitem: 'Procedimentos',
          item: 'Os procedimentos de operação, limpeza, ajuste e manutenção estão formalizados e disponíveis?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização dos procedimentos aplicáveis.',
        },
        {
          subitem: 'Análise de risco',
          item: 'A análise de risco está disponível e compatível com a configuração real da máquina?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até validação da análise de risco da máquina.',
        },
      ],
    },
    {
      id: 'nr12-topic-2',
      titulo: 'Instalação, Arranjo e Estrutura',
      ordem: 2,
      itens: [
        {
          subitem: 'Estabilidade',
          item: 'A máquina está instalada, nivelada e fixada com estabilidade operacional?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até correção da instalação e estabilidade da máquina.',
        },
        {
          subitem: 'Espaçamento',
          item: 'Há espaço suficiente para operação, abastecimento, manutenção e evacuação segura?',
          criticidade: 'alto',
          acao: 'Readequar o arranjo físico antes da continuidade operacional.',
        },
        {
          subitem: 'Piso e acesso',
          item: 'O piso, os acessos e as plataformas de apoio estão íntegros e seguros?',
          criticidade: 'alto',
          acao: 'Corrigir o piso e os acessos antes da operação.',
        },
        {
          subitem: 'Iluminação',
          item: 'A iluminação é suficiente para operação, inspeção, ajuste e manutenção?',
          criticidade: 'alto',
          acao: 'Adequar a iluminação antes da execução da atividade.',
        },
      ],
    },
    {
      id: 'nr12-topic-3',
      titulo: 'Proteções e Dispositivos de Segurança',
      ordem: 3,
      itens: [
        {
          subitem: 'Proteções fixas',
          item: 'As proteções fixas estão instaladas, íntegras e impedem acesso à zona de perigo?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a máquina até recomposição das proteções fixas.',
        },
        {
          subitem: 'Proteções móveis',
          item: 'As proteções móveis estão íntegras, fixadas corretamente e sem possibilidade de neutralização?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Bloquear imediatamente a máquina até correção das proteções móveis.',
        },
        {
          subitem: 'Intertravamentos',
          item: 'Os intertravamentos e sensores de segurança estão funcionando corretamente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a máquina até correção do sistema de intertravamento.',
        },
        {
          subitem: 'Burlas',
          item: 'Não há pontes, by-pass ou neutralização de dispositivos de segurança?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a máquina e eliminar a neutralização indevida.',
        },
      ],
    },
    {
      id: 'nr12-topic-4',
      titulo: 'Comandos, Partida e Bloqueio',
      ordem: 4,
      itens: [
        {
          subitem: 'Partida segura',
          item: 'O sistema de partida exige ação intencional e evita acionamento involuntário?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a máquina até correção do sistema de partida.',
        },
        {
          subitem: 'Parada normal',
          item: 'O dispositivo de parada normal funciona corretamente e está acessível ao operador?',
          criticidade: 'alto',
          acao: 'Corrigir o sistema de parada normal antes do uso.',
        },
        {
          subitem: 'Parada de emergência',
          item: 'Os dispositivos de parada de emergência estão acessíveis, identificados e funcionam corretamente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a máquina até correção da parada de emergência.',
        },
        {
          subitem: 'Bloqueio de energias',
          item: 'O bloqueio e etiquetagem contemplam todas as energias perigosas da máquina?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção até implantação do bloqueio de energias perigosas.',
        },
      ],
    },
    {
      id: 'nr12-topic-5',
      titulo: 'Operação, Manutenção e Pessoas',
      ordem: 5,
      itens: [
        {
          subitem: 'Abastecimento e limpeza',
          item: 'O abastecimento, a retirada de material e a limpeza ocorrem sem exposição à zona de perigo?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até eliminação da exposição insegura.',
        },
        {
          subitem: 'Manutenção segura',
          item: 'A manutenção, o setup e os ajustes ocorrem com energias perigosas controladas?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente a intervenção até controle efetivo das energias perigosas.',
        },
        {
          subitem: 'Capacitação',
          item: 'Os operadores e intervenientes estão capacitados e autorizados para a máquina?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a operação até capacitação e autorização adequadas.',
        },
        {
          subitem: 'Interdição por desvio grave',
          item: 'A máquina é retirada de uso quando há desvio grave que compromete a segurança?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar imediatamente a máquina até eliminação do desvio grave.',
        },
      ],
    },
  ]);
}
