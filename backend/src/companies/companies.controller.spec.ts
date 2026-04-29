import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { TenantService } from '../common/tenant/tenant.service';

describe('CompaniesController', () => {
  const company = {
    id: 'company-1',
    razao_social: 'Empresa Teste',
    cnpj: '12345678000190',
    endereco: 'Rua A',
    responsavel: 'Responsavel',
    email_contato: null,
    logo_url: null,
    status: true,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  let companiesService: jest.Mocked<
    Pick<CompaniesService, 'findOne' | 'findPaginated'>
  >;
  let tenantService: jest.Mocked<
    Pick<TenantService, 'isSuperAdmin' | 'getTenantId'>
  >;
  let controller: CompaniesController;

  beforeEach(() => {
    companiesService = {
      findOne: jest.fn().mockResolvedValue(company),
      findPaginated: jest.fn().mockResolvedValue({
        data: [company],
        total: 1,
        page: 1,
        limit: 100,
        lastPage: 1,
      }),
    };
    tenantService = {
      isSuperAdmin: jest.fn().mockReturnValue(false),
      getTenantId: jest.fn().mockReturnValue('company-1'),
    };
    controller = new CompaniesController(
      companiesService as unknown as CompaniesService,
      tenantService as unknown as TenantService,
    );
  });

  it('retorna somente a propria empresa para usuario tenant-scoped', async () => {
    const result = await controller.findAll(
      { user: { company_id: 'company-1' } },
      '1',
      '200',
    );

    expect(companiesService.findOne).toHaveBeenCalledWith('company-1');
    expect(companiesService.findPaginated).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [company],
      total: 1,
      page: 1,
      limit: 100,
      lastPage: 1,
    });
  });

  it('normaliza page/limit invalidos na listagem tenant-scoped', async () => {
    const result = await controller.findAll(
      { user: { company_id: 'company-1' } },
      'abc',
      '200',
    );

    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
  });

  it('mantem listagem global para admin geral', async () => {
    tenantService.isSuperAdmin.mockReturnValue(true);

    await controller.findAll(
      { user: { company_id: 'company-1' } },
      '2',
      '50',
      'teste',
    );

    expect(companiesService.findPaginated).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      search: 'teste',
    });
    expect(companiesService.findOne).not.toHaveBeenCalled();
  });
});
