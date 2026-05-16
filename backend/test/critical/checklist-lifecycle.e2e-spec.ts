import { Role } from '../../src/auth/enums/roles.enum';
import { TestApp, type LoginSession } from '../helpers/test-app';
import request from 'supertest';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

const PDF_BUFFER = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj\n' +
    '<< /Type /Catalog /Pages 2 0 R >>\n' +
    'endobj\n' +
    '2 0 obj\n' +
    '<< /Type /Pages /Count 0 >>\n' +
    'endobj\n' +
    'xref\n' +
    '0 3\n' +
    '0000000000 65535 f \n' +
    '0000000010 00000 n \n' +
    '0000000060 00000 n \n' +
    'trailer\n' +
    '<< /Root 1 0 R /Size 3 >>\n' +
    'startxref\n' +
    '110\n' +
    '%%EOF',
  'utf8',
);

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAA' +
    'AAC0lEQVR42mP8/x8AAwMCAO+/4XkAAAAASUVORK5CYII=',
  'base64',
);

type ChecklistBody = {
  id?: string;
  fileKey?: string;
  folderPath?: string;
  originalName?: string;
};

type PdfAccessBody = {
  availability?: string;
  hasFinalPdf?: boolean;
  url?: string | null;
  fileKey?: string | null;
  folderPath?: string | null;
  originalName?: string | null;
  message?: string | null;
};

type PhotoAccessBody = {
  availability?: string;
  url?: string | null;
  fileKey?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  hasGovernedPhoto?: boolean;
  degraded?: boolean;
  message?: string | null;
};

type PhotoAttachBody = {
  photoReference?: string;
  storageMode?: string;
  message?: string;
  signaturesReset?: boolean;
};

describeE2E('E2E Critical - Checklist lifecycle', () => {
  let testApp: TestApp;
  let adminSession: LoginSession;
  let workerSession: LoginSession;
  let tenantBAdminSession: LoginSession;
  let csrfHeaders: Record<string, string>;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();

    adminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    workerSession = await testApp.loginAs(Role.TRABALHADOR, 'tenantA');
    tenantBAdminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantB');
    csrfHeaders = await testApp.csrfHeaders();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('fecha o checklist operacional ponta a ponta com foto governada e PDF final', async () => {
    const tenantA = testApp.getTenant('tenantA');
    const inspector = testApp.getUser('tenantA', Role.TST);
    const httpServer = testApp.app.getHttpServer() as Parameters<
      typeof request
    >[0];

    const createRes = await testApp
      .request()
      .post('/checklists')
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .send({
        titulo: 'Checklist E2E Governado',
        descricao: 'Fluxo completo com fotos e PDF final',
        data: '2026-05-15',
        site_id: tenantA.siteId,
        inspetor_id: inspector.id,
        itens: [
          {
            item: 'Verificar trava da plataforma',
            status: 'sim',
            tipo_resposta: 'sim_nao_na',
            obrigatorio: true,
            peso: 1,
            fotos: [],
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const checklistId = String((createRes.body as ChecklistBody).id || '');
    expect(checklistId).toBeTruthy();

    const equipmentAttachRes = await testApp
      .request()
      .post(`/checklists/${checklistId}/equipment-photo`)
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .attach('file', PNG_BUFFER, {
        filename: 'foto-equipamento.png',
        contentType: 'image/png',
      });

    expect(equipmentAttachRes.status).toBe(201);
    const equipmentAttachBody = equipmentAttachRes.body as PhotoAttachBody;
    expect(equipmentAttachBody.storageMode).toBe('governed-storage');
    expect(equipmentAttachBody.photoReference).toContain(
      'gst:checklist-photo:',
    );

    const equipmentAccessRes = await testApp
      .request()
      .get(`/checklists/${checklistId}/equipment-photo/access`)
      .set(testApp.authHeaders(adminSession));

    expect(equipmentAccessRes.status).toBe(200);
    const equipmentAccessBody = equipmentAccessRes.body as PhotoAccessBody;
    expect(equipmentAccessBody.hasGovernedPhoto).toBe(true);
    expect(['ready', 'registered_without_signed_url']).toContain(
      equipmentAccessBody.availability || '',
    );
    if (equipmentAccessBody.availability === 'ready') {
      expect(typeof equipmentAccessBody.url).toBe('string');
      const equipmentDownloadRes = await requestDownload(
        httpServer,
        String(equipmentAccessBody.url || ''),
      );
      expect(equipmentDownloadRes.status).toBe(200);
      expect(
        String(equipmentDownloadRes.headers['content-type'] || ''),
      ).toContain('image/png');
    } else {
      expect(equipmentAccessBody.url).toBeNull();
    }

    const itemAttachRes = await testApp
      .request()
      .post(`/checklists/${checklistId}/items/0/photos`)
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .attach('file', PNG_BUFFER, {
        filename: 'foto-item.png',
        contentType: 'image/png',
      });

    expect(itemAttachRes.status).toBe(201);
    const itemAttachBody = itemAttachRes.body as PhotoAttachBody;
    expect(itemAttachBody.storageMode).toBe('governed-storage');

    const itemAccessRes = await testApp
      .request()
      .get(`/checklists/${checklistId}/items/0/photos/0/access`)
      .set(testApp.authHeaders(adminSession));

    expect(itemAccessRes.status).toBe(200);
    const itemAccessBody = itemAccessRes.body as PhotoAccessBody;
    expect(itemAccessBody.hasGovernedPhoto).toBe(true);
    expect(['ready', 'registered_without_signed_url']).toContain(
      itemAccessBody.availability || '',
    );
    if (itemAccessBody.availability === 'ready') {
      expect(typeof itemAccessBody.url).toBe('string');
      const itemDownloadRes = await requestDownload(
        httpServer,
        String(itemAccessBody.url || ''),
      );
      expect(itemDownloadRes.status).toBe(200);
      expect(String(itemDownloadRes.headers['content-type'] || '')).toContain(
        'image/png',
      );
    } else {
      expect(itemAccessBody.url).toBeNull();
    }

    const signatureRes = await testApp
      .request()
      .post('/signatures')
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .send({
        document_id: checklistId,
        document_type: 'CHECKLIST',
        signature_data: 'assinatura-e2e-checklist',
        type: 'simple',
      });

    expect(signatureRes.status).toBe(201);

    const finalizeRes = await testApp
      .request()
      .post(`/checklists/${checklistId}/file`)
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .attach('file', PDF_BUFFER, {
        filename: 'checklist-final.pdf',
        contentType: 'application/pdf',
      });

    expect(finalizeRes.status).toBe(201);
    const finalizeBody = finalizeRes.body as ChecklistBody;
    expect(finalizeBody.fileKey).toMatch(/^documents\/.+\.pdf$/i);
    expect(finalizeBody.folderPath).toMatch(/^documents\/.+/i);

    const pdfAccessRes = await testApp
      .request()
      .get(`/checklists/${checklistId}/pdf`)
      .set(testApp.authHeaders(adminSession));

    expect(pdfAccessRes.status).toBe(200);
    const pdfAccessBody = pdfAccessRes.body as PdfAccessBody;
    expect(pdfAccessBody.hasFinalPdf).toBe(true);
    expect(['ready', 'registered_without_signed_url']).toContain(
      pdfAccessBody.availability || '',
    );
    if (pdfAccessBody.availability === 'ready') {
      expect(typeof pdfAccessBody.url).toBe('string');
      const pdfDownloadRes = await requestDownload(
        httpServer,
        String(pdfAccessBody.url || ''),
      );
      expect(pdfDownloadRes.status).toBe(200);
      expect(String(pdfDownloadRes.headers['content-type'] || '')).toContain(
        'application/pdf',
      );
      expect(
        String(pdfDownloadRes.headers['content-disposition'] || ''),
      ).toContain('checklist-final.pdf');
    } else {
      expect(pdfAccessBody.url).toBeNull();
    }

    const lockedAttachRes = await testApp
      .request()
      .post(`/checklists/${checklistId}/equipment-photo`)
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .attach('file', PNG_BUFFER, {
        filename: 'foto-equipamento-nova.png',
        contentType: 'image/png',
      });

    expect(lockedAttachRes.status).toBe(400);
    expect(
      String((lockedAttachRes.body as { message?: string }).message || ''),
    ).toContain('Edição bloqueada');
  }, 120_000);

  it('retorna 404 quando a foto do equipamento ainda nao foi anexada', async () => {
    const tenantA = testApp.getTenant('tenantA');
    const inspector = testApp.getUser('tenantA', Role.TST);

    const createRes = await testApp
      .request()
      .post('/checklists')
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .send({
        titulo: 'Checklist E2E sem foto governada',
        descricao: 'Fluxo curto para validar acesso ausente',
        data: '2026-05-15',
        site_id: tenantA.siteId,
        inspetor_id: inspector.id,
        itens: [
          {
            item: 'Verificar etiqueta de segurança',
            status: 'sim',
            tipo_resposta: 'sim_nao_na',
            obrigatorio: true,
            peso: 1,
            fotos: [],
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const checklistId = String((createRes.body as ChecklistBody).id || '');
    expect(checklistId).toBeTruthy();

    const accessRes = await testApp
      .request()
      .get(`/checklists/${checklistId}/equipment-photo/access`)
      .set(testApp.authHeaders(adminSession));

    expect(accessRes.status).toBe(404);
    expect(
      String((accessRes.body as { message?: string }).message || ''),
    ).toContain('foto do equipamento');
  });

  it('retorna 401 para rota de checklist sem token', async () => {
    const httpServer = testApp.app.getHttpServer() as Parameters<
      typeof request
    >[0];

    const res = await request(httpServer).get(
      '/checklists/11111111-1111-4111-8111-111111111111/pdf',
    );

    expect(res.status).toBe(401);
  });

  it('retorna 403 quando usuário sem permissão de gestão tenta criar checklist', async () => {
    const tenantA = testApp.getTenant('tenantA');
    const inspector = testApp.getUser('tenantA', Role.TST);

    const res = await testApp
      .request()
      .post('/checklists')
      .set(testApp.authHeaders(workerSession))
      .set(csrfHeaders)
      .send({
        titulo: 'Checklist bloqueado para trabalhador',
        descricao: 'Tentativa sem can_manage_checklists',
        data: '2026-05-15',
        site_id: tenantA.siteId,
        inspetor_id: inspector.id,
        itens: [{ item: 'Item', status: 'sim', tipo_resposta: 'sim_nao_na' }],
      });

    expect(res.status).toBe(403);
  });

  it('bloqueia acesso cross-tenant ao checklist (404) e spoofing de header (403)', async () => {
    const tenantA = testApp.getTenant('tenantA');
    const inspector = testApp.getUser('tenantA', Role.TST);

    const createRes = await testApp
      .request()
      .post('/checklists')
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders)
      .send({
        titulo: 'Checklist isolamento tenant',
        descricao: 'Validação negativa de isolamento',
        data: '2026-05-15',
        site_id: tenantA.siteId,
        inspetor_id: inspector.id,
        itens: [
          { item: 'Isolamento', status: 'sim', tipo_resposta: 'sim_nao_na' },
        ],
      });

    expect(createRes.status).toBe(201);
    const checklistId = String((createRes.body as ChecklistBody).id || '');
    expect(checklistId).toBeTruthy();

    const crossTenantRes = await testApp
      .request()
      .get(`/checklists/${checklistId}/pdf`)
      .set(testApp.authHeaders(tenantBAdminSession));
    expect(crossTenantRes.status).toBe(404);

    const spoofedTenantRes = await testApp
      .request()
      .get(`/checklists/${checklistId}/pdf`)
      .set(
        testApp.authHeaders(adminSession, {
          companyIdOverride: testApp.getTenant('tenantB').companyId,
        }),
      );
    expect(spoofedTenantRes.status).toBe(403);
  });
});

async function requestDownload(httpServer: unknown, url: string) {
  if (url.startsWith('http')) {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/storage/download/')) {
      return request(httpServer as Parameters<typeof request>[0]).get(
        `${parsed.pathname}${parsed.search}`,
      );
    }

    return request(`${parsed.protocol}//${parsed.host}`).get(
      `${parsed.pathname}${parsed.search}`,
    );
  }

  return request(httpServer as Parameters<typeof request>[0]).get(url);
}
