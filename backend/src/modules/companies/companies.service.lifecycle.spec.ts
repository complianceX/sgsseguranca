import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CompaniesService } from './companies.service';
import { Company } from './entities/company.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StorageService } from '../../shared/services/storage.service';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { Dds } from '../dds/entities/dds.entity';
import { QueryFailedError } from 'typeorm';

const COMPANY_ID = 'company-uuid-1';

const makeCompany = (overrides: Partial<Company> = {}): Company =>
  ({
    id: COMPANY_ID,
    razao_social: 'Empresa Teste',
    cnpj: '12345678000190',
    status: true,
    logo_url: null,
    logo_storage_key: null,
    logo_content_type: null,
    logo_sha256: null,
    ...overrides,
  }) as Company;

const makeMockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn((e: unknown) => Promise.resolve(e as Company)),
  create: jest.fn((d: unknown) => d as Company),
  remove: jest.fn().mockResolvedValue(undefined),
  count: jest.fn().mockResolvedValue(0),
  createQueryBuilder: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  }),
  manager: {
    getRepository: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d: unknown) => d),
    }),
  },
});

describe('CompaniesService — lifecycle e validação', () => {
  let service: CompaniesService;
  let companyRepo: ReturnType<typeof makeMockRepo>;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    companyRepo = makeMockRepo();
    cacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(Site), useValue: makeMockRepo() },
        { provide: getRepositoryToken(User), useValue: makeMockRepo() },
        { provide: getRepositoryToken(Profile), useValue: makeMockRepo() },
        { provide: getRepositoryToken(Dds), useValue: makeMockRepo() },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn().mockResolvedValue({ key: 'logo/key.png' }),
            getPresignedInlineViewUrl: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('remove — restrições de lifecycle', () => {
    it('lança BadRequestException quando empresa tem usuários vinculados', async () => {
      companyRepo.findOne.mockResolvedValueOnce(makeCompany());
      companyRepo.manager.getRepository.mockReturnValueOnce({
        count: jest.fn().mockResolvedValue(3),
      });

      await expect(service.remove(COMPANY_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(companyRepo.remove).not.toHaveBeenCalled();
    });

    it('lança BadRequestException com mensagem de FK quando DB retorna code 23503', async () => {
      companyRepo.findOne.mockResolvedValueOnce(makeCompany());
      companyRepo.manager.getRepository.mockReturnValueOnce({
        count: jest.fn().mockResolvedValue(0),
      });

      const fkError = new QueryFailedError('DELETE', [], {
        code: '23503',
      } as never);
      companyRepo.remove.mockRejectedValueOnce(fkError);

      await expect(service.remove(COMPANY_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('remove empresa sem usuários vinculados e invalida caches', async () => {
      companyRepo.findOne.mockResolvedValueOnce(makeCompany());
      companyRepo.manager.getRepository.mockReturnValueOnce({
        count: jest.fn().mockResolvedValue(0),
      });

      await service.remove(COMPANY_ID);

      expect(companyRepo.remove).toHaveBeenCalledTimes(1);
      expect(cacheManager.del).toHaveBeenCalledWith('companies:all');
      expect(cacheManager.del).toHaveBeenCalledWith('companies:active:ids');
      expect(cacheManager.del).toHaveBeenCalledWith(`company:${COMPANY_ID}`);
    });

    it('lança NotFoundException ao remover empresa inexistente', async () => {
      companyRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.remove('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update — logo e invalidação de cache', () => {
    it('invalida 3 chaves de cache após update', async () => {
      const company = makeCompany();
      companyRepo.findOne.mockResolvedValueOnce(company);
      companyRepo.save.mockResolvedValueOnce(company);

      await service.update(COMPANY_ID, { razao_social: 'Nova Razão Social' });

      expect(cacheManager.del).toHaveBeenCalledWith('companies:all');
      expect(cacheManager.del).toHaveBeenCalledWith('companies:active:ids');
      expect(cacheManager.del).toHaveBeenCalledWith(`company:${COMPANY_ID}`);
    });

    it('lança BadRequestException quando logo tem tipo inválido (SVG)', async () => {
      const company = makeCompany();
      companyRepo.findOne.mockResolvedValueOnce(company);

      const svgBase64 = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ).toString('base64');

      await expect(
        service.update(COMPANY_ID, {
          logo_url: `data:image/svg+xml;base64,${svgBase64}`,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(companyRepo.save).not.toHaveBeenCalled();
    });

    it('lança BadRequestException quando logo excede 2MB', async () => {
      const company = makeCompany();
      companyRepo.findOne.mockResolvedValueOnce(company);

      const oversizedBuffer = Buffer.alloc(3 * 1024 * 1024, 0xff);
      const pngBase64 = oversizedBuffer.toString('base64');

      await expect(
        service.update(COMPANY_ID, {
          logo_url: `data:image/png;base64,${pngBase64}`,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança NotFoundException quando empresa não existe', async () => {
      companyRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.update('inexistente', { razao_social: 'Nova Empresa' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create — CNPJ e logo', () => {
    it('normaliza CNPJ removendo máscara antes de persistir', async () => {
      const company = makeCompany();
      jest
        .spyOn(service, 'ensureDefaultDdsThemeLibrary')
        .mockResolvedValue(undefined);
      companyRepo.save.mockResolvedValueOnce(company);

      await service.create({
        razao_social: 'Empresa',
        cnpj: '12.345.678/0001-90',
      });

      const calls = (companyRepo.create as jest.Mock).mock.calls as [
        Partial<Company>,
      ][];
      const created = calls[0][0];
      expect(created.cnpj).toBe('12345678000190');
    });

    it('lança BadRequestException quando logo tem content-type inválido', async () => {
      const gifBase64 = Buffer.from('GIF89a').toString('base64');

      await expect(
        service.create({
          razao_social: 'Empresa',
          logo_url: `data:image/gif;base64,${gifBase64}`,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('invalida caches companies:all e companies:active:ids após criação', async () => {
      const company = makeCompany();
      jest
        .spyOn(service, 'ensureDefaultDdsThemeLibrary')
        .mockResolvedValue(undefined);
      companyRepo.save.mockResolvedValueOnce(company);

      await service.create({ razao_social: 'Empresa', cnpj: '12345678000190' });

      expect(cacheManager.del).toHaveBeenCalledWith('companies:all');
      expect(cacheManager.del).toHaveBeenCalledWith('companies:active:ids');
    });
  });
});
