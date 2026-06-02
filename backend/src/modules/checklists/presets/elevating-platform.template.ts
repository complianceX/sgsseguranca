import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildElevatingPlatformTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'elevating-topic-1',
      titulo: 'Identificação, Documentação e Liberação',
      ordem: 1,
      itens: [
        {
          subitem: 'Identificação',
          item: 'A placa ou etiqueta do fabricante está legível com marca, modelo e rastreabilidade do equipamento?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação física antes da liberação.',
        },
        {
          subitem: 'Capacidade nominal',
          item: 'A capacidade nominal e os limites operacionais estão legíveis?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o equipamento até restabelecer a identificação da capacidade.',
        },
        {
          subitem: 'Manual e procedimento',
          item: 'O manual do fabricante e o procedimento operacional estão disponíveis para consulta?',
          criticidade: 'alto',
          acao: 'Disponibilizar os documentos aplicáveis antes da operação.',
        },
        {
          subitem: 'Inspeção e liberação',
          item: 'Existe registro de inspeção e liberação vigente para o equipamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Executar a inspeção pendente e manter o equipamento bloqueado até aprovação.',
        },
      ],
    },
    {
      id: 'elevating-topic-2',
      titulo: 'Estrutura, Acesso e Dispositivos',
      ordem: 2,
      itens: [
        {
          subitem: 'Estrutura',
          item: 'A estrutura, o cesto e o chassi estão sem trincas, deformações ou corrosão severa?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Retirar o equipamento de operação e encaminhar para avaliação estrutural.',
        },
        {
          subitem: 'Guarda-corpo e acesso',
          item: 'O guarda-corpo, o portão e os acessos estão íntegros e firmes?',
          criticidade: 'critico',
          bloqueia: true,
          fotoObrigatoria: true,
          acao: 'Impedir o uso até recomposição integral do sistema de proteção.',
        },
        {
          subitem: 'Ancoragem',
          item: 'O ponto de ancoragem está identificado e íntegro quando aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até restabelecer ponto homologado pelo fabricante.',
        },
        {
          subitem: 'Ausência de vazamentos',
          item: 'Não há vazamentos, peças soltas ou improvisos estruturais aparentes?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o equipamento e corrigir a condição insegura antes da liberação.',
        },
      ],
    },
    {
      id: 'elevating-topic-3',
      titulo: 'Comandos, Controles e Teste Funcional',
      ordem: 3,
      itens: [
        {
          subitem: 'Comandos',
          item: 'Os comandos da base e do cesto estão respondendo corretamente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interditar o equipamento até correção e reteste funcional.',
        },
        {
          subitem: 'Parada de emergência',
          item: 'Os botões de parada de emergência funcionam e interrompem os movimentos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o equipamento até reparo e validação.',
        },
        {
          subitem: 'Descida de emergência',
          item: 'O sistema de descida de emergência está operante?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear imediatamente o equipamento até reparo e validação.',
        },
        {
          subitem: 'Alarmes e limitadores',
          item: 'Os alarmes, sensores e limitadores de segurança estão funcionando?',
          criticidade: 'alto',
          acao: 'Corrigir os dispositivos de indicação e segurança antes da liberação.',
        },
      ],
    },
    {
      id: 'elevating-topic-4',
      titulo: 'Estabilidade, Área e Interferências',
      ordem: 4,
      itens: [
        {
          subitem: 'Piso e apoio',
          item: 'O piso está firme, nivelado e capaz de suportar o equipamento?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Proibir o posicionamento até definir base segura ou tratar o piso.',
        },
        {
          subitem: 'Estabilizadores',
          item: 'Os estabilizadores, travamentos e apoios estão funcionando e posicionados corretamente quando aplicáveis?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear o uso até restabelecer a estabilidade prevista pelo fabricante.',
        },
        {
          subitem: 'Redes e obstáculos',
          item: 'A operação está sem interferência perigosa com redes elétricas ou estruturas aéreas?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até eliminação da interferência perigosa.',
        },
        {
          subitem: 'Isolamento da área',
          item: 'A área está isolada, sinalizada e com condições de clima e visibilidade seguras?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até tornar a área segura para operação.',
        },
      ],
    },
    {
      id: 'elevating-topic-5',
      titulo: 'Operador, EPI, Resgate e Encerramento',
      ordem: 5,
      itens: [
        {
          subitem: 'Operador autorizado',
          item: 'O operador está capacitado e formalmente autorizado para o equipamento utilizado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Impedir a operação por esse trabalhador até regularização formal.',
        },
        {
          subitem: 'EPI e briefing',
          item: 'Os EPIs aplicáveis e as orientações de segurança foram conferidos antes da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Substituir o EPI inadequado e alinhar a equipe antes do início da tarefa.',
        },
        {
          subitem: 'Plano de resgate',
          item: 'Existe procedimento de emergência e resgate compatível com a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até definição e comunicação do plano de resgate.',
        },
        {
          subitem: 'Encerramento seguro',
          item: 'O equipamento é recolhido, desligado e protegido contra uso indevido após a atividade?',
          criticidade: 'medio',
          acao: 'Regularizar o encerramento seguro após a atividade.',
        },
      ],
    },
  ]);
}
