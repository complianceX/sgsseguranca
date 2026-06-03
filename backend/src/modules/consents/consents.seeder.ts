import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsentsService } from './consents.service';

const POLICY_VERSION =
  process.env.LEGAL_POLICY_VERSION ||
  process.env.NEXT_PUBLIC_LEGAL_POLICY_VERSION ||
  '2026-04-24';
const TERMS_VERSION =
  process.env.LEGAL_TERMS_VERSION ||
  process.env.NEXT_PUBLIC_LEGAL_TERMS_VERSION ||
  '2026-04-24';

/**
 * Seed de textos base. O body_md aqui é um resumo operacional — a versão
 * integral renderizada na UI vem de frontend/app/privacidade e /termos.
 * O body_md persistido serve como referência auditável do texto aceito.
 *
 * Quando houver divergência material, atualize aqui E publique nova versão
 * via UI administrativa (a ser criada na Fase 3).
 */
const SEED_BODIES = {
  privacy: `# Política de Privacidade (resumo auditável) — versão ${POLICY_VERSION}

Este aceite representa ciência integral da Política de Privacidade publicada em /privacidade, nesta versão, incluindo:

- Identificação do controlador, encarregado (DPO) e canais oficiais.
- Categorias de dados tratados, inclusive dados sensíveis de saúde ocupacional.
- Finalidades e bases legais (LGPD Art. 7º e 11).
- Lista nominal de operadores (OpenAI, Supabase, Cloudflare, Sentry, New Relic, provedor de e-mail, storage, Redis) e transferência internacional.
- Retenção por tipo de dado e exclusão em backups.
- Direitos do titular (Art. 18) e canal de atendimento.
- Cookies estritamente necessários.

O texto íntegro é parte indissociável deste aceite.`,
  terms: `# Termos de Uso (resumo auditável) — versão ${TERMS_VERSION}

Este aceite representa ciência integral dos Termos de Uso publicados em /termos, nesta versão, incluindo:

- Elegibilidade, contas e credenciais pessoais e intransferíveis.
- Responsabilidades do Cliente e do usuário autorizado.
- Regras de uso permitido e condutas vedadas.
- IA como apoio, não substituição técnica.
- Propriedade intelectual e confidencialidade.
- Disponibilidade, suporte e evolução.
- Suspensão, encerramento, exportação ao término (janela de 30 dias).
- Comunicação de incidentes (48h).
- Limitação de responsabilidade e foro.`,
  ai_processing: `# Consentimento para processamento por IA — versão ${POLICY_VERSION}

Autorizo o processamento dos meus dados operacionais por funcionalidades de IA (SOPHIE), ciente de que:

- Dados pessoais diretos (CPF, e-mail, telefone, nomes) devem ser minimizados e filtrados antes do envio ao provedor.
- O provedor atualmente utilizado, quando habilitado contratualmente, é OpenAI, LLC (EUA), com possibilidade de transferência internacional conforme a Política de Privacidade vigente.
- A saída da IA é auxiliar e não substitui decisão humana.
- Posso revogar este consentimento a qualquer tempo em Configurações → Privacidade, sem prejuízo dos demais serviços.
- Nenhuma decisão estritamente automatizada com efeito jurídico é tomada pela plataforma.`,
  cookies: `# Cookies estritamente necessários — versão ${POLICY_VERSION}

Ciência de que o SGS usa cookies estritamente necessários para autenticação, proteção anti-bot (Cloudflare Turnstile) e continuidade de sessão. Não usamos cookies para publicidade ou rastreamento entre sites. A lista detalhada está em /cookies.`,
  marketing: `# Comunicações institucionais (opt-in) — versão ${POLICY_VERSION}

Autorizo o envio de comunicações institucionais (novidades do produto, treinamentos, materiais técnicos de SST). Posso revogar a qualquer momento. Este consentimento não é exigido para usar a plataforma.`,
} as const;

@Injectable()
export class ConsentsSeederService implements OnModuleInit {
  private readonly logger = new Logger(ConsentsSeederService.name);

  constructor(private readonly consentsService: ConsentsService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DISABLE_AUTO_CONSENT_SEED === 'true') {
      return;
    }
    await this.seed();
  }

  /**
   * Idempotente: se uma versão com o mesmo label e body já existe, não faz
   * nada. Se o body mudar, exige novo label (erro é explícito).
   */
  async seed(): Promise<void> {
    const entries: Array<{
      type: keyof typeof SEED_BODIES;
      versionLabel: string;
      summary: string;
    }> = [
      {
        type: 'privacy',
        versionLabel: POLICY_VERSION,
        summary: 'Política de Privacidade publicada em /privacidade.',
      },
      {
        type: 'terms',
        versionLabel: TERMS_VERSION,
        summary: 'Termos de Uso publicados em /termos.',
      },
      {
        type: 'ai_processing',
        versionLabel: POLICY_VERSION,
        summary: 'Consentimento para uso da IA SOPHIE (OpenAI).',
      },
      {
        type: 'cookies',
        versionLabel: POLICY_VERSION,
        summary: 'Ciência de cookies estritamente necessários.',
      },
      {
        type: 'marketing',
        versionLabel: POLICY_VERSION,
        summary: 'Opt-in para comunicações institucionais.',
      },
    ];

    for (const entry of entries) {
      try {
        await this.consentsService.publishVersion({
          type: entry.type,
          versionLabel: entry.versionLabel,
          bodyMd: SEED_BODIES[entry.type],
          summary: entry.summary,
        });
      } catch (error) {
        this.logger.warn({
          event: 'consent_seed_skip',
          type: entry.type,
          version: entry.versionLabel,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
