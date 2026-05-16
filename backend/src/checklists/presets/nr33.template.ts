import type { ChecklistTopicValue } from '../types/checklist-item.type';
import { buildPresetTopics } from './preset-template.utils';

export function buildNr33OperationalTopics(): ChecklistTopicValue[] {
  return buildPresetTopics([
    {
      id: 'nr33-topic-1',
      titulo: 'PET e Controle Formal da Entrada',
      ordem: 1,
      itens: [
        {
          subitem: 'Permissão de entrada e trabalho',
          item: 'A PET foi emitida, aprovada e está disponível no local da atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até emissão e aprovação formal da PET.',
        },
        {
          subitem: 'Cadastro do espaço',
          item: 'O espaço confinado está identificado, sinalizado e com cadastro técnico disponível?',
          criticidade: 'alto',
          acao: 'Regularizar a identificação e o cadastro do espaço antes da entrada.',
        },
        {
          subitem: 'Análise de risco',
          item: 'A análise de risco contempla atmosfera, energias perigosas, resgate e riscos adicionais?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até emissão ou revisão da análise de risco.',
        },
        {
          subitem: 'Autorização da atividade',
          item: 'A atividade foi formalmente autorizada pelas partes responsáveis antes da entrada?',
          criticidade: 'alto',
          acao: 'Regularizar a autorização formal antes da entrada no espaço.',
        },
      ],
    },
    {
      id: 'nr33-topic-2',
      titulo: 'Equipe, Vigia e Capacitação',
      ordem: 2,
      itens: [
        {
          subitem: 'Capacitação',
          item: 'Os trabalhadores, supervisores e vigias possuem capacitação NR-33 compatível e vigente?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização das capacitações aplicáveis.',
        },
        {
          subitem: 'Vigia',
          item: 'Existe vigia designado, identificado e dedicado ao monitoramento da entrada?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até definição formal do vigia.',
        },
        {
          subitem: 'Aptidão',
          item: 'Os trabalhadores estão aptos para a atividade quando houver exigência ocupacional aplicável?',
          criticidade: 'alto',
          acao: 'Afastar o trabalhador da atividade até validação da aptidão aplicável.',
        },
        {
          subitem: 'Quantidade de pessoas',
          item: 'A quantidade de pessoas no espaço é compatível com a atividade e com o plano de resgate?',
          criticidade: 'alto',
          acao: 'Readequar a equipe antes do início ou continuidade da atividade.',
        },
      ],
    },
    {
      id: 'nr33-topic-3',
      titulo: 'Avaliação Atmosférica e Ventilação',
      ordem: 3,
      itens: [
        {
          subitem: 'Faixas aceitáveis',
          item: 'Os resultados de oxigênio, inflamáveis e contaminantes tóxicos estão dentro dos limites seguros definidos?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até restabelecimento das faixas seguras.',
        },
        {
          subitem: 'Instrumentos',
          item: 'Os instrumentos de monitoramento atmosférico são adequados, calibrados e funcionais?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até regularização dos instrumentos de monitoramento.',
        },
        {
          subitem: 'Monitoramento contínuo',
          item: 'Existe monitoramento contínuo da atmosfera quando a atividade ou o risco exigem?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até implantação do monitoramento contínuo aplicável.',
        },
        {
          subitem: 'Ventilação',
          item: 'A ventilação adotada é suficiente para manter a atmosfera em condição segura?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até restabelecimento da ventilação segura.',
        },
      ],
    },
    {
      id: 'nr33-topic-4',
      titulo: 'Isolamento, Energias e Resgate',
      ordem: 4,
      itens: [
        {
          subitem: 'Bloqueio de energias',
          item: 'As energias perigosas do espaço foram isoladas, bloqueadas e identificadas antes da entrada?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até controle efetivo das energias perigosas.',
        },
        {
          subitem: 'Isolamento da área',
          item: 'A área externa está isolada e sinalizada para impedir acesso indevido?',
          criticidade: 'alto',
          acao: 'Isolar e sinalizar a área antes da continuidade.',
        },
        {
          subitem: 'Equipamentos de resgate',
          item: 'Os equipamentos de resgate e retirada estão disponíveis, íntegros e compatíveis com a atividade?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até disponibilização dos meios de resgate aplicáveis.',
        },
        {
          subitem: 'Plano de emergência',
          item: 'O plano de emergência e resgate é conhecido pela equipe e praticável para o espaço avaliado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a entrada até alinhamento do plano de emergência e resgate.',
        },
      ],
    },
    {
      id: 'nr33-topic-5',
      titulo: 'Execução, Comunicação e Encerramento',
      ordem: 5,
      itens: [
        {
          subitem: 'Comunicação',
          item: 'A comunicação entre trabalhadores internos e vigia está assegurada durante toda a atividade?',
          criticidade: 'alto',
          acao: 'Restabelecer a comunicação antes da continuidade da atividade.',
        },
        {
          subitem: 'EPI e EPC',
          item: 'Os EPIs e EPCs previstos para a atividade estão disponíveis e em uso adequado?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Bloquear a atividade até disponibilização e uso correto dos controles previstos.',
        },
        {
          subitem: 'Suspensão por desvio',
          item: 'A atividade é suspensa imediatamente quando houver desvio crítico ou condição insegura?',
          criticidade: 'critico',
          bloqueia: true,
          acao: 'Interromper a atividade e retirar os trabalhadores até correção do desvio.',
        },
        {
          subitem: 'Encerramento da PET',
          item: 'O encerramento da atividade e da PET ocorre com registro formal e retirada controlada da equipe?',
          criticidade: 'medio',
          acao: 'Formalizar o encerramento e registrar as ocorrências observadas.',
        },
      ],
    },
  ]);
}
