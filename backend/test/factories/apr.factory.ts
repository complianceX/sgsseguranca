import request from 'supertest';
import type { LoginSession, TestApp } from '../helpers/test-app';

export type CreateAprFactoryInput = {
  numero: string;
  titulo: string;
  siteId: string;
  elaboradorId: string;
  dataInicio?: string;
  dataFim?: string;
};

export async function createApr(
  testApp: TestApp,
  session: LoginSession,
  input: CreateAprFactoryInput,
) {
  const dataInicio = input.dataInicio || '2026-03-24';
  const dataFim = input.dataFim || '2026-03-25';
  const csrfHeaders = await testApp.csrfHeaders();

  const response = await request(
    testApp.app.getHttpServer() as Parameters<typeof request>[0],
  )
    .post('/aprs')
    .set(testApp.authHeaders(session))
    .set(csrfHeaders)
    .send({
      numero: input.numero,
      titulo: input.titulo,
      data_inicio: dataInicio,
      data_fim: dataFim,
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

  if (response.status !== 201) {
    throw new Error(
      `Unable to create APR in factory: status=${response.status} body=${JSON.stringify(response.body)}`,
    );
  }

  return response.body as { id: string; status: string; titulo: string };
}
