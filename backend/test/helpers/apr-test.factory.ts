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
          atividade: 'Trabalho em altura',
          agente_ambiental: 'Gravitacional',
          condicao_perigosa: 'Plataforma sem guarda-corpo',
          fonte_circunstancia: 'Estrutura elevada',
          lesao: 'Fratura por queda',
          probabilidade: 3,
          severidade: 4,
          medidas_prevencao: 'Uso de cinto de segurança e linha de vida',
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

export async function createTestTenant(
  testApp: TestApp,
): Promise<{ companyId: string; siteId: string }> {
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
