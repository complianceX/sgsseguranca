import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CompaniesService } from '../companies/companies.service';
import { MailService } from '../../infra/mail/mail.service';
import { isApiCronDisabled } from '../../shared/utils/scheduler.util';

const TRIAL_WARNING_DAYS = [7, 3, 1] as const;

@Injectable()
export class TrialLifecycleScheduler {
  private readonly logger = new Logger(TrialLifecycleScheduler.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Roda diariamente às 01:15 UTC.
   * 1. Marca como trial_expired todos os trials que passaram de trial_ends_at.
   * 2. Envia e-mails de aviso D-7, D-3 e D-1 para empresas em trial.
   */
  @Cron('15 1 * * *')
  async runDailyTrialLifecycle(): Promise<void> {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: trial lifecycle agendado foi pulado neste runtime.',
      );
      return;
    }

    await this.expireStaleTrials();
    await this.sendTrialWarnings();
  }

  private async expireStaleTrials(): Promise<void> {
    try {
      const count = await this.companiesService.markExpiredTrials();
      if (count > 0) {
        this.logger.log({ event: 'trials_marked_expired', count });
      }
    } catch (error) {
      this.logger.error(
        'Falha ao marcar trials expirados.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async sendTrialWarnings(): Promise<void> {
    for (const daysAhead of TRIAL_WARNING_DAYS) {
      try {
        const companies =
          await this.companiesService.findTrialsExpiringIn(daysAhead);

        for (const company of companies) {
          if (!company.email_contato) {
            continue;
          }

          await this.mailService
            .sendMailSimple(
              company.email_contato,
              this.buildSubject(daysAhead),
              this.buildPlainText(company.razao_social, daysAhead),
              { companyId: company.id },
              undefined,
              {
                html: this.buildHtml(
                  company.razao_social,
                  daysAhead,
                  company.trial_ends_at!,
                ),
                filename: 'trial-expiry-warning',
              },
            )
            .catch((err: Error) => {
              this.logger.warn({
                event: 'trial_warning_email_failed',
                companyId: company.id,
                daysAhead,
                error: err.message,
              });
            });
        }

        if (companies.length > 0) {
          this.logger.log({
            event: 'trial_warnings_sent',
            daysAhead,
            count: companies.length,
          });
        }
      } catch (error) {
        this.logger.error(
          `Falha ao processar avisos D-${daysAhead} de trial.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  private buildSubject(daysAhead: number): string {
    return daysAhead === 1
      ? 'Último dia de teste gratuito no SGS'
      : `Seu período de teste no SGS encerra em ${daysAhead} dias`;
  }

  private buildPlainText(razaoSocial: string, daysAhead: number): string {
    return (
      `O período de teste de ${razaoSocial} no SGS encerra em ` +
      `${daysAhead} dia${daysAhead > 1 ? 's' : ''}. ` +
      `Entre em contato com nossa equipe para continuar utilizando a plataforma.`
    );
  }

  private buildHtml(
    razaoSocial: string,
    daysAhead: number,
    trialEndsAt: Date,
  ): string {
    const dateStr = trialEndsAt.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    });

    const alertColor = daysAhead === 1 ? '#b91c1c' : '#d97706';
    const alertLabel =
      daysAhead === 1 ? 'Último dia de teste' : `${daysAhead} dias restantes`;

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08)">

        <tr>
          <td style="background:${alertColor};padding:20px 32px">
            <p style="margin:0;color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">
              SGS — Sistema de Gestão de Segurança
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 32px 24px">
            <h1 style="margin:0 0 8px;font-size:22px;color:#111827">
              ${this.escapeHtml(alertLabel)}
            </h1>
            <p style="margin:0;color:#6b7280;font-size:14px">Aviso de expiração de período de teste</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 28px">
            <p style="margin:0 0 16px;color:#374151;line-height:1.65">
              Olá, equipe da <strong>${this.escapeHtml(razaoSocial)}</strong>.
            </p>
            <p style="margin:0 0 16px;color:#374151;line-height:1.65">
              O período de teste gratuito da sua empresa no SGS
              <strong>encerra em ${daysAhead} dia${daysAhead > 1 ? 's' : ''}</strong> (${dateStr}).
            </p>
            <p style="margin:0;color:#374151;line-height:1.65">
              Para continuar gerenciando APRs, PTs, DDS, treinamentos, exames e toda a conformidade SST
              da sua empresa sem interrupção, fale com nossa equipe comercial.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 32px">
            <a href="mailto:contato@sgsseguranca.com.br"
               style="display:inline-block;background:#2f5d46;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
              Falar com a equipe SGS
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
              Após o encerramento do período de teste, o acesso será suspenso automaticamente
              até a regularização contratual. Este é um aviso automático do SGS.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
