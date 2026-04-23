import { Role } from '../../src/auth/enums/roles.enum';
import type { TestApp, LoginSession } from './test-app';

export type AprFactoryInput = {
  numero: string;
  titulo: string;
  siteId: string;
  elaboradorId: string;
  dataInicio?: string;
  dataFim?: string;
};

export type AprBody = {
  id: string;
  status: string;
  titulo?: string;
  numero?: string;
  pdf_file_key?: string | null;
  versao?: number;
};

export async function createTestApr(
  testApp: TestApp,
  session: LoginSession,
  input: AprFactoryInput,
): Promise<AprBody> {
  const csrfHeaders = await testApp.csrfHeaders();
  const res = await testApp
    .request()
    .post('/aprs')
    .set(testApp.authHeaders(session))
    .set(csrfHeaders)
    .send({
      numero: input.numero,
      titulo: input.titulo,
      data_inicio: input.dataInicio ?? '2026-04-18',
      data_fim: input.dataFim ?? '2026-04-19',
      site_id: input.siteId,
      elaborador_id: input.elaboradorId,
      participants: [input.elaboradorId],
      risk_items: [
        {
          atividade: 'Operação de rotina',
          agente_ambiental: 'Ruído',
          condicao_perigosa: 'Exposição eventual',
          fonte_circunstancia: 'Linha de produção',
          lesao: 'Perda auditiva',
          probabilidade: 2,
          severidade: 2,
          medidas_prevencao: 'Uso de EPI e monitoramento',
          responsavel: 'Técnico SST',
        },
      ],
    });

  if (res.status !== 201) {
    throw new Error(
      `[AprTestFactory] createTestApr falhou: status=${res.status} body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body as AprBody;
}

export function createTestTenant(testApp: TestApp): {
  companyId: string;
  siteId: string;
} {
  const tenant = testApp.getTenant('tenantA');
  return { companyId: tenant.companyId, siteId: tenant.siteId };
}

export async function createCreatorSession(
  testApp: TestApp,
): Promise<LoginSession> {
  return testApp.loginAs(Role.TST, 'tenantA');
}

export async function createApproverSession(
  testApp: TestApp,
): Promise<LoginSession> {
  return testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
}
