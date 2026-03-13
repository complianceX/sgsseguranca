import { type LucideIcon, AlertTriangle, Archive, ClipboardCheck, FileText, Radio, ShieldCheck, Stethoscope, Users } from 'lucide-react';

export type AiRouteContext = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  assistantIntro: string;
  promptPrefix: string;
  suggestions: string[];
};

const defaultContext: AiRouteContext = {
  title: 'SOPHIE',
  subtitle: 'Suporte operacional para o TST com analise de imagem, riscos e orientacao tecnica.',
  icon: ShieldCheck,
  assistantIntro:
    'Sou a SOPHIE da GST. Posso apoiar o TST com análise de imagem, liberação operacional, conformidade, APR, PT, NC e documentos.',
  promptPrefix:
    'Contexto atual: SOPHIE prestando apoio geral de SST no SaaS <GST> Gestão de Segurança do Trabalho. Atue como suporte técnico para o TST, responda com objetividade, segurança e foco operacional.',
  suggestions: [
    'Analise os riscos desta foto e diga as acoes imediatas.',
    'Quais bloqueios impedem liberar esta atividade com segurança?',
    'Monte uma orientação rápida de campo para hoje.',
    'Quais documentos preciso revisar antes da operação?',
  ],
};

const contexts: Array<{ matcher: (pathname: string) => boolean; context: AiRouteContext }> = [
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/tst'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Suporte ao TST em campo com bloqueios, pendencias do dia e analise visual de risco.',
      icon: Radio,
      assistantIntro:
        'Estou no modo TST em campo. Posso priorizar pendências do dia, analisar imagens, validar bloqueios e orientar a liberação operacional.',
      promptPrefix:
        'Contexto atual: tela TST em campo com pendências do dia, consulta por CPF, bloqueios operacionais, fila offline e suporte para análise rápida de risco.',
      suggestions: [
        'Analise esta imagem e aponte risco critico imediato.',
        'Quais prioridades devo atacar primeiro nesta operação?',
        'Como avaliar rapidamente um trabalhador bloqueado por CPF?',
        'Quais ações imediatas tomar em caso de risco crítico em campo?',
      ],
    },
  },
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/aprs'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Risco residual, controles e análise operacional da atividade.',
      icon: FileText,
      assistantIntro:
        'Estou no modo APR. Posso ajudar a revisar perigos, hierarquia de controles e consistência da análise preliminar de risco.',
      promptPrefix:
        'Contexto atual: módulo APR com risco residual, controles e necessidade de evidências operacionais.',
      suggestions: [
        'Revise os principais perigos desta APR.',
        'Quais controles faltam pela hierarquia de proteção?',
        'Como reduzir o risco residual antes da execução?',
      ],
    },
  },
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/pts'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Liberação segura, bloqueios e evidências antes da aprovação.',
      icon: ClipboardCheck,
      assistantIntro:
        'Estou no modo Permissão de Trabalho. Posso orientar bloqueios, checagens críticas e condições para aprovação segura.',
      promptPrefix:
        'Contexto atual: módulo PT com regras de bloqueio, aprovação e checagens críticas de segurança.',
      suggestions: [
        'Quais requisitos devo validar antes de aprovar a PT?',
        'Liste bloqueios críticos para trabalho em altura.',
        'Como justificar uma reprovação por risco residual crítico?',
      ],
    },
  },
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/nonconformities'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Classificação, criticidade, contenção e plano de ação.',
      icon: AlertTriangle,
      assistantIntro:
        'Estou no modo Não Conformidades. Posso ajudar a classificar criticidade, orientar contenção e estruturar plano de ação.',
      promptPrefix:
        'Contexto atual: módulo de não conformidades com criticidade, CAPA e recorrência operacional.',
      suggestions: [
        'Como classificar esta NC por criticidade?',
        'Quais ações imediatas de contenção devo registrar?',
        'Como estruturar um plano de ação com SLA?',
      ],
    },
  },
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/document-registry'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Pacote semanal, rastreabilidade e conformidade documental.',
      icon: Archive,
      assistantIntro:
        'Estou no modo documental. Posso orientar pacotes semanais, rastreabilidade, validação e organização dos documentos.',
      promptPrefix:
        'Contexto atual: registry documental com filtros por empresa, semana, módulo e pacote consolidado.',
      suggestions: [
        'Quais documentos devo incluir no pacote semanal da obra?',
        'Como validar rastreabilidade documental desta semana?',
        'Quais gaps documentais merecem prioridade?',
      ],
    },
  },
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/medical-exams'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Aptidão, vencimentos e bloqueios médicos operacionais.',
      icon: Stethoscope,
      assistantIntro:
        'Estou no modo exames médicos. Posso apoiar vencimentos de ASO, aptidão ocupacional e restrições para operação.',
      promptPrefix:
        'Contexto atual: módulo de exames médicos e aptidão ocupacional com foco em vencimentos e bloqueios.',
      suggestions: [
        'Quais vencimentos precisam de ação nesta semana?',
        'Como tratar operação com ASO vencido?',
        'Quais sinais exigem bloqueio médico imediato?',
      ],
    },
  },
  {
    matcher: (pathname) => pathname.startsWith('/dashboard/employees'),
    context: {
      title: 'SOPHIE',
      subtitle: 'Status operacional do trabalhador e prontidão documental.',
      icon: Users,
      assistantIntro:
        'Estou no modo mobilização. Posso revisar status operacional do trabalhador, documentos pendentes e bloqueios.',
      promptPrefix:
        'Contexto atual: módulo de funcionários e prontidão operacional com foco em mobilização e conformidade.',
      suggestions: [
        'O que preciso validar antes de mobilizar um trabalhador?',
        'Como resumir pendências operacionais por colaborador?',
        'Quais documentos são bloqueantes para entrada em obra?',
      ],
    },
  },
];

export function getAiRouteContext(pathname: string | null | undefined): AiRouteContext {
  if (!pathname) return defaultContext;
  return contexts.find((item) => item.matcher(pathname))?.context ?? defaultContext;
}
