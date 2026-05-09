import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { ExpensesService } from './expenses.service';
import {
  ExpenseAdvance,
  ExpenseAdvanceMethod,
} from './entities/expense-advance.entity';
import { ExpenseCategory, ExpenseItem } from './entities/expense-item.entity';
import {
  ExpenseReport,
  ExpenseReportStatus,
} from './entities/expense-report.entity';

const companyId = '11111111-1111-4111-8111-111111111111';
const siteId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const reportId = '44444444-4444-4444-8444-444444444444';

function makeRepo<T extends object>() {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    exist: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeReport(overrides: Partial<ExpenseReport> = {}): ExpenseReport {
  return {
    id: reportId,
    company_id: companyId,
    site_id: siteId,
    responsible_id: userId,
    period_start: '2026-05-01',
    period_end: '2026-05-31',
    status: ExpenseReportStatus.ABERTA,
    notes: null,
    total_advances: '0.00',
    total_expenses: '0.00',
    balance: '0.00',
    site: { id: siteId, nome: 'Obra X' } as Site,
    responsible: { id: userId, nome: 'TST Demo' } as User,
    advances: [],
    items: [],
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  } as ExpenseReport;
}

describe('ExpensesService', () => {
  let reportsRepository: jest.Mocked<Repository<ExpenseReport>>;
  let advancesRepository: jest.Mocked<Repository<ExpenseAdvance>>;
  let itemsRepository: jest.Mocked<Repository<ExpenseItem>>;
  let sitesRepository: jest.Mocked<Repository<Site>>;
  let usersRepository: jest.Mocked<Repository<User>>;
  let tenantService: jest.Mocked<TenantService>;
  let documentStorageService: jest.Mocked<DocumentStorageService>;
  let service: ExpensesService;

  beforeEach(() => {
    reportsRepository = makeRepo<ExpenseReport>();
    advancesRepository = makeRepo<ExpenseAdvance>();
    itemsRepository = makeRepo<ExpenseItem>();
    sitesRepository = makeRepo<Site>();
    usersRepository = makeRepo<User>();
    tenantService = {
      getContext: jest.fn(() => ({
        companyId,
        isSuperAdmin: false,
        userId,
        siteScope: 'single',
        siteId,
        siteIds: [siteId],
      })),
    } as unknown as jest.Mocked<TenantService>;
    documentStorageService = {
      generateDocumentKey: jest.fn(() => 'documents/key.pdf'),
      uploadFile: jest.fn(),
      deleteFile: jest.fn(),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://signed.example/receipt.pdf'),
    } as unknown as jest.Mocked<DocumentStorageService>;

    reportsRepository.create.mockImplementation(
      (value) => value as ExpenseReport,
    );
    sitesRepository.exist.mockResolvedValue(true);
    usersRepository.exist.mockResolvedValue(true);
    reportsRepository.save.mockImplementation((value) =>
      Promise.resolve({
        id: reportId,
        ...value,
      } as ExpenseReport),
    );
    reportsRepository.findOne.mockResolvedValue(makeReport());

    service = new ExpensesService(
      reportsRepository,
      advancesRepository,
      itemsRepository,
      sitesRepository,
      usersRepository,
      tenantService,
      documentStorageService,
    );
  });

  it('cria prestação derivando company_id do tenant autenticado', async () => {
    await service.create({
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      site_id: siteId,
      responsible_id: userId,
      notes: 'Obra de maio',
    });

    expect(reportsRepository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        company_id: companyId,
        site_id: siteId,
        responsible_id: userId,
        status: ExpenseReportStatus.ABERTA,
      }),
    );
  });

  it('bloqueia obra fora do escopo do usuário site-scoped', async () => {
    await expect(
      service.create({
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        site_id: '99999999-9999-4999-8999-999999999999',
        responsible_id: userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia TST com siteScope all quando tenta criar despesa de outra obra', async () => {
    tenantService.getContext.mockReturnValue({
      companyId,
      isSuperAdmin: false,
      userId,
      siteId,
      siteIds: [siteId],
      siteScope: 'all',
    });

    await expect(
      service.create({
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        site_id: '99999999-9999-4999-8999-999999999999',
        responsible_id: userId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia usuário operacional tentando alterar prestação de outro responsável', async () => {
    reportsRepository.findOne.mockResolvedValue(
      makeReport({
        responsible_id: '99999999-9999-4999-8999-999999999999',
      }),
    );

    await expect(
      service.addAdvance(reportId, {
        amount: 100,
        advance_date: '2026-05-08',
        method: ExpenseAdvanceMethod.PIX,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite usuário operacional vinculado a múltiplas obras criar prestação em obra secundária', async () => {
    const secondarySiteId = '55555555-5555-4555-8555-555555555555';
    tenantService.getContext.mockReturnValue({
      companyId,
      isSuperAdmin: false,
      userId,
      siteId,
      siteIds: [siteId, secondarySiteId],
      siteScope: 'single',
    });

    await service.create({
      period_start: '2026-05-01',
      period_end: '2026-05-31',
      site_id: secondarySiteId,
      responsible_id: userId,
    });

    expect(reportsRepository.create.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        company_id: companyId,
        site_id: secondarySiteId,
        responsible_id: userId,
      }),
    );
  });

  it('bloqueia período inválido', async () => {
    await expect(
      service.create({
        period_start: '2026-06-01',
        period_end: '2026-05-01',
        site_id: siteId,
        responsible_id: userId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calcula totais, categorias e saldo no fechamento', async () => {
    tenantService.getContext.mockReturnValue({
      companyId,
      isSuperAdmin: true,
      userId,
      siteId,
      siteIds: [siteId],
      siteScope: 'all',
    });
    reportsRepository.findOne
      .mockResolvedValueOnce(
        makeReport({
          advances: [
            { amount: '500.00', advance_date: '2026-05-01' } as ExpenseAdvance,
          ],
          items: [
            {
              amount: '120.50',
              category: ExpenseCategory.ALIMENTACAO,
              expense_date: '2026-05-08',
            } as ExpenseItem,
            {
              amount: '80.00',
              category: ExpenseCategory.TRANSPORTE,
              expense_date: '2026-05-09',
            } as ExpenseItem,
          ],
        }),
      )
      .mockResolvedValueOnce(
        makeReport({
          status: ExpenseReportStatus.FECHADA,
          total_advances: '500.00',
          total_expenses: '200.50',
          balance: '299.50',
          totals_by_category: {
            alimentacao: '120.50',
            transporte: '80.00',
          },
          advances: [],
          items: [],
        }),
      );

    await service.close(reportId, userId);

    expect(reportsRepository.save.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        status: ExpenseReportStatus.FECHADA,
        total_advances: '500.00',
        total_expenses: '200.50',
        balance: '299.50',
        closed_by_id: userId,
      }),
    );
  });

  it('rejeita adiantamento quando prestação não está aberta', async () => {
    reportsRepository.findOne.mockResolvedValue(
      makeReport({ status: ExpenseReportStatus.FECHADA }),
    );

    await expect(
      service.addAdvance(reportId, {
        amount: 100,
        advance_date: '2026-05-08',
        method: ExpenseAdvanceMethod.PIX,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
