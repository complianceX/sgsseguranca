import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildNr10OperationalTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'nr10-topic-1',
      titulo: 'Gestão Documental e Técnica',
      ordem: 1,
      itens: [
        {
          subitem: 'Prontuário',
          item: 'O prontuário de instalações elétricas está disponível e atualizado quando exigível?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização e atualização do prontuário aplicável.',
        },
        {
          subitem: 'Diagrama unifilar',
          item: 'O diagrama unifilar atualizado está disponível com aterramento e proteções definidos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização do diagrama atualizado.',
        },
        {
          subitem: 'Procedimentos',
          item: 'Os procedimentos específicos de trabalho estão formalizados e disponíveis no local?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Suspender a atividade até disponibilização dos procedimentos aplicáveis.',
        },
        {
          subitem: 'Responsável técnico',
          item: 'Os documentos técnicos foram emitidos ou aprovados por profissional habilitado quando exigível?',
          criticidade: 'alto',
          acao: 'Submeter a documentação à validação técnica antes da execução.',
        },
      ],
    },
    {
      id: 'nr10-topic-2',
      titulo: 'Planejamento, Risco e Equipe',
      ordem: 2,
      itens: [
        {
          subitem: 'Análise de risco',
          item: 'A análise de risco contempla o risco elétrico e os riscos adicionais da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Trabalho energizado',
          item: 'A intervenção energizada está tecnicamente justificada e controlada quando aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a intervenção energizada até justificativa técnica e controles aplicáveis.',
        },
        {
          subitem: 'Capacitação',
          item: 'Os trabalhadores possuem treinamento NR-10 compatível e vigente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização dos treinamentos aplicáveis.',
        },
        {
          subitem: 'Autorização formal',
          item: 'Os trabalhadores estão formalmente autorizados para a atividade elétrica específica?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou atualização da autorização formal.',
        },
      ],
    },
    {
      id: 'nr10-topic-3',
      titulo: 'Proteções, EPI e Ferramental',
      ordem: 3,
      itens: [
        {
          subitem: 'Proteção coletiva',
          item: 'As medidas de proteção coletiva previstas estão implantadas?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação das medidas de proteção coletiva.',
        },
        {
          subitem: 'EPI específico',
          item: 'Os EPIs do risco elétrico e dos riscos adicionais estão disponíveis e em uso correto?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização e uso correto dos EPIs aplicáveis.',
        },
        {
          subitem: 'Adornos',
          item: 'A equipe está sem adornos pessoais para trabalhos com eletricidade ou em suas proximidades?',
          criticidade: 'alto',
          acao: 'Retirar adornos e reinspecionar a equipe antes do início da atividade.',
        },
        {
          subitem: 'Ferramental',
          item: 'O ferramental e os instrumentos são adequados, íntegros e compatíveis com a classe de tensão?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até substituição ou adequação do ferramental e instrumentos.',
        },
      ],
    },
    {
      id: 'nr10-topic-4',
      titulo: 'Desenergização, Bloqueio e Liberação',
      ordem: 4,
      itens: [
        {
          subitem: 'Seccionamento',
          item: 'O seccionamento foi realizado conforme o procedimento aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até execução correta do seccionamento.',
        },
        {
          subitem: 'Bloqueio',
          item: 'O bloqueio e o impedimento de reenergização estão implementados e controlados?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até implantação do bloqueio e impedimento de reenergização.',
        },
        {
          subitem: 'Ausência de tensão',
          item: 'A ausência de tensão foi constatada com instrumento adequado e procedimento válido?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até constatação formal da ausência de tensão.',
        },
        {
          subitem: 'Aterramento temporário',
          item: 'O aterramento temporário foi instalado quando aplicável?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até instalação do aterramento temporário aplicável.',
        },
      ],
    },
    {
      id: 'nr10-topic-5',
      titulo: 'Área, Sinalização e Emergência',
      ordem: 5,
      itens: [
        {
          subitem: 'Zonas de risco',
          item: 'As zonas livre, controlada e de risco estão delimitadas e controladas conforme a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até delimitação correta e controle das zonas.',
        },
        {
          subitem: 'Sinalização',
          item: 'A sinalização de segurança está implantada para advertência, bloqueio e restrição de acesso?',
          criticidade: 'alto',
          acao: 'Implantar ou corrigir a sinalização antes do início da atividade.',
        },
        {
          subitem: 'Delimitação da área',
          item: 'A área de trabalho está isolada e protegida contra acesso indevido de terceiros?',
          criticidade: 'alto',
          acao: 'Isolar e delimitar a área antes do início ou continuidade da atividade.',
        },
        {
          subitem: 'Emergência e resgate',
          item: 'O plano de emergência, os meios de resgate e a resposta a incêndio estão assegurados?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até alinhamento com o plano de emergência aplicável.',
        },
      ],
    },
  ]);
}
