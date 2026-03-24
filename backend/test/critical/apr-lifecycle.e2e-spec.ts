import { Role } from '../../src/auth/enums/roles.enum';
import { AprStatus } from '../../src/aprs/entities/apr.entity';
import { createApr } from '../factories/apr.factory';
import { TestApp } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

describeE2E('E2E Critical - APR lifecycle CRUD', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await TestApp.create();
    await testApp.resetDatabase();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('should create, update, paginate, finalize and soft-delete APR', async () => {
    const adminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    const tenantA = testApp.getTenant('tenantA');
    const tecnicA = testApp.getUser('tenantA', Role.TST);

    const createdApr = await createApr(testApp, adminSession, {
      numero: 'APR-LIFE-001',
      titulo: 'APR Ciclo de Vida',
      siteId: tenantA.siteId,
      elaboradorId: tecnicA.id,
    });

    expect(createdApr.id).toBeTruthy();
    expect(createdApr.status).toBe(AprStatus.PENDENTE);

    const updated = await testApp
      .request()
      .patch(`/aprs/${createdApr.id}`)
      .set(testApp.authHeaders(adminSession))
      .send({
        titulo: 'APR Ciclo de Vida Atualizada',
      });
    const updatedBody = updated.body as { titulo?: string };

    expect(updated.status).toBe(200);
    expect(updatedBody.titulo).toBe('APR Ciclo de Vida Atualizada');

    const list = await testApp
      .request()
      .get('/aprs?page=1&limit=5')
      .set(testApp.authHeaders(adminSession));
    const listBody = list.body as {
      data?: Array<{ id?: string }>;
      total?: number;
      page?: number;
      lastPage?: number;
    };
    const listItems = Array.isArray(listBody.data) ? listBody.data : [];

    expect(list.status).toBe(200);
    expect(Array.isArray(listBody.data)).toBe(true);
    expect(typeof listBody.total).toBe('number');
    expect(listBody.page).toBe(1);
    expect(typeof listBody.lastPage).toBe('number');
    expect(listItems.some((item) => item.id === createdApr.id)).toBe(true);

    const approved = await testApp
      .request()
      .post(`/aprs/${createdApr.id}/approve`)
      .set(testApp.authHeaders(adminSession));
    const approvedBody = approved.body as { status?: string };

    expect([200, 201]).toContain(approved.status);
    expect(approvedBody.status).toBe(AprStatus.APROVADA);

    const aprToDelete = await createApr(testApp, adminSession, {
      numero: 'APR-LIFE-DELETE-001',
      titulo: 'APR para soft delete',
      siteId: tenantA.siteId,
      elaboradorId: tecnicA.id,
    });

    const deleted = await testApp
      .request()
      .delete(`/aprs/${aprToDelete.id}`)
      .set(testApp.authHeaders(adminSession));

    expect(deleted.status).toBe(200);

    const getDeleted = await testApp
      .request()
      .get(`/aprs/${aprToDelete.id}`)
      .set(testApp.authHeaders(adminSession));

    expect(getDeleted.status).toBe(404);

    const deletedEntityRaw: unknown = await testApp.dataSource.query(
      'SELECT id, deleted_at FROM aprs WHERE id = $1',
      [aprToDelete.id],
    );

    expect(Array.isArray(deletedEntityRaw)).toBe(true);
    if (!Array.isArray(deletedEntityRaw)) {
      throw new Error('Expected query result to be an array');
    }
    const deletedEntity = deletedEntityRaw as Array<{
      id?: string;
      deleted_at?: string | null;
    }>;
    expect(deletedEntity.length).toBe(1);
    expect(deletedEntity[0]?.deleted_at).toBeTruthy();
  });
});
