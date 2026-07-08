import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../../shared/guards/tenant.guard';
import { TenantService } from '../../shared/tenant/tenant.service';
import { FileInspectionService } from '../../shared/security/file-inspection.service';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';

describe('AuditsController (http)', () => {
  let app: INestApplication;

  const auditsService = {
    create: jest.fn(),
    findPaginated: jest.fn(),
    listStoredFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };
  const tenantService = {
    getTenantId: jest.fn(() => 'company-1'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tenantService.getTenantId.mockReturnValue('company-1');
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuditsController],
      providers: [
        { provide: AuditsService, useValue: auditsService },
        { provide: TenantService, useValue: tenantService },
        { provide: FileInspectionService, useValue: { inspect: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('encaminha paginação válida para o service com tenant autenticado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    auditsService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 10,
      totalPages: 0,
    });

    await request(httpServer)
      .get('/audits?page=2&limit=10&search=interna')
      .expect(200);

    expect(auditsService.findPaginated).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 10,
        search: 'interna',
      },
      'company-1',
    );
  });

  it('rejeita company_id forjado na query de listagem', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/audits?company_id=tenant-forjado')
      .expect(400);

    expect(auditsService.findPaginated).not.toHaveBeenCalled();
  });

  it('rejeita limit acima do teto na listagem', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/audits?limit=999').expect(400);

    expect(auditsService.findPaginated).not.toHaveBeenCalled();
  });

  it('aceita payload de auditoria com objetos aninhados validados', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    auditsService.create.mockResolvedValue({ id: 'audit-1' });

    const payload = {
      titulo: 'Auditoria HSE de campo',
      data_auditoria: '2026-07-06',
      tipo_auditoria: 'Interna',
      site_id: '11111111-1111-4111-8111-111111111111',
      auditor_id: '22222222-2222-4222-8222-222222222222',
      referencias: ['NR-01'],
      caracterizacao: {
        cnae: '07.10-3-01',
        grau_risco: '4',
        num_trabalhadores: 128,
      },
      resultados_nao_conformidades: [
        {
          descricao: 'APR encerrada sem verificacao final',
          requisito: 'NR-01',
          evidencia: 'APR-2026-071',
          classificacao: 'Grave',
        },
      ],
      avaliacao_riscos: [
        {
          perigo: 'Equipamentos moveis em rota compartilhada',
          classificacao: 'Alto',
          impactos: 'Atropelamento',
          medidas_controle: 'Segregacao fisica e sinalizacao',
        },
      ],
      plano_acao: [
        {
          item: 'NC-01',
          acao: 'Bloquear encerramento de APR sem assinatura',
          responsavel: 'Coordenacao HSE',
          prazo: '2026-07-20',
          status: 'Pendente',
        },
      ],
      checklist_respostas: [
        {
          sectionId: 'apr-pt-dds',
          sectionTitle: 'APR / PT / DDS',
          questionId: 'apr-antes-atividade',
          question:
            'A APR é preenchida antes do início das atividades críticas?',
          requirement: 'NR-01 / Procedimento APR',
          criticality: 'alta',
          answer: 'nao',
          observation: 'APR aberta somente após início da atividade.',
          allowsPhoto: true,
          photoRequiredWhen: 'nao',
          suggestedAction: 'Implantar trava de início sem APR aprovada.',
          evidences: [
            {
              id: 'foto-1',
              fileName: 'apr-campo.jpg',
              mimeType: 'image/jpeg',
              size: 1280,
              dataUrl: 'data:image/jpeg;base64,AAA',
              capturedAt: '2026-07-06T12:00:00.000Z',
              hash: 'hash-1',
            },
          ],
        },
      ],
    };

    await request(httpServer).post('/audits').send(payload).expect(201);

    expect(auditsService.create).toHaveBeenCalledWith(payload, 'company-1');
  });

  it('rejeita resposta invalida no checklist estruturado', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/audits')
      .send({
        titulo: 'Auditoria HSE de campo',
        data_auditoria: '2026-07-06',
        tipo_auditoria: 'Interna',
        site_id: '11111111-1111-4111-8111-111111111111',
        auditor_id: '22222222-2222-4222-8222-222222222222',
        checklist_respostas: [
          {
            sectionId: 'apr-pt-dds',
            sectionTitle: 'APR / PT / DDS',
            questionId: 'apr-antes-atividade',
            question:
              'A APR é preenchida antes do início das atividades críticas?',
            requirement: 'NR-01 / Procedimento APR',
            criticality: 'alta',
            answer: 'talvez',
          },
        ],
      })
      .expect(400);

    expect(auditsService.create).not.toHaveBeenCalled();
  });

  it('rejeita classificacao invalida em nao conformidade', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/audits')
      .send({
        titulo: 'Auditoria HSE de campo',
        data_auditoria: '2026-07-06',
        tipo_auditoria: 'Interna',
        site_id: '11111111-1111-4111-8111-111111111111',
        auditor_id: '22222222-2222-4222-8222-222222222222',
        resultados_nao_conformidades: [
          {
            descricao: 'Desvio sem classificacao valida',
            requisito: 'NR-01',
            evidencia: 'APR-2026-071',
            classificacao: 'Alta',
          },
        ],
      })
      .expect(400);

    expect(auditsService.create).not.toHaveBeenCalled();
  });

  it('encaminha filtros semanais validados para listStoredFiles', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    auditsService.listStoredFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/audits/files/list?year=2026&week=12')
      .expect(200);

    expect(auditsService.listStoredFiles).toHaveBeenCalledWith({
      companyId: 'company-1',
      year: 2026,
      week: 12,
    });
  });

  it('rejeita week inválida nas rotas de arquivos governados', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer).get('/audits/files/list?week=99').expect(400);

    expect(auditsService.listStoredFiles).not.toHaveBeenCalled();
  });
});
