import { DashboardDocumentPendenciesService } from './dashboard-document-pendencies.service';

type MockRepo = {
  find: jest.Mock;
};

function createMockRepo(): MockRepo {
  return {
    find: jest.fn().mockResolvedValue([]),
  };
}

describe('DashboardDocumentPendenciesService', () => {
  let aprsRepository: MockRepo;
  let auditsRepository: MockRepo;
  let catsRepository: MockRepo;
  let checklistsRepository: MockRepo;
  let companiesRepository: MockRepo;
  let ddsRepository: MockRepo;
  let documentImportsRepository: MockRepo;
  let documentRegistryRepository: MockRepo;
  let documentVideosRepository: MockRepo;
  let inspectionsRepository: MockRepo;
  let nonConformitiesRepository: MockRepo;
  let ptsRepository: MockRepo;
  let rdosRepository: MockRepo;
  let signaturesRepository: MockRepo;
  let sitesRepository: MockRepo;
  let documentStorageService: { getSignedUrl: jest.Mock };
  let storageService: { getPresignedDownloadUrl: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock };
  let service: DashboardDocumentPendenciesService;

  beforeEach(() => {
    aprsRepository = createMockRepo();
    auditsRepository = createMockRepo();
    catsRepository = createMockRepo();
    checklistsRepository = createMockRepo();
    companiesRepository = createMockRepo();
    ddsRepository = createMockRepo();
    documentImportsRepository = createMockRepo();
    documentRegistryRepository = createMockRepo();
    documentVideosRepository = createMockRepo();
    inspectionsRepository = createMockRepo();
    nonConformitiesRepository = createMockRepo();
    ptsRepository = createMockRepo();
    rdosRepository = createMockRepo();
    signaturesRepository = createMockRepo();
    sitesRepository = createMockRepo();
    documentStorageService = {
      getSignedUrl: jest.fn(),
    };
    storageService = {
      getPresignedDownloadUrl: jest.fn(),
    };
    cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    };

    service = new DashboardDocumentPendenciesService(
      aprsRepository as never,
      auditsRepository as never,
      catsRepository as never,
      checklistsRepository as never,
      companiesRepository as never,
      ddsRepository as never,
      documentImportsRepository as never,
      documentRegistryRepository as never,
      documentVideosRepository as never,
      inspectionsRepository as never,
      nonConformitiesRepository as never,
      ptsRepository as never,
      rdosRepository as never,
      signaturesRepository as never,
      sitesRepository as never,
      documentStorageService as never,
      storageService as never,
      cacheManager as never,
    );
  });

  it('retorna vazio sem consultar fontes quando a criticidade pedida nunca existe', async () => {
    const response = await service.getDocumentPendencies({
      filters: { criticality: 'low' },
      currentCompanyId: 'company-1',
      permissions: ['can_view_dashboard'],
    });

    expect(response.summary.total).toBe(0);
    expect(response.items).toEqual([]);
    expect(aprsRepository.find).not.toHaveBeenCalled();
    expect(documentImportsRepository.find).not.toHaveBeenCalled();
    expect(documentRegistryRepository.find).not.toHaveBeenCalled();
    expect(documentVideosRepository.find).not.toHaveBeenCalled();
    expect(nonConformitiesRepository.find).not.toHaveBeenCalled();
  });

  it('evita fontes de storage quando o filtro pede apenas criticidade critical', async () => {
    const response = await service.getDocumentPendencies({
      filters: { criticality: 'critical' },
      currentCompanyId: 'company-1',
      permissions: ['can_view_rdos', 'can_import_documents'],
    });

    expect(response.summary.total).toBe(0);
    expect(documentRegistryRepository.find).not.toHaveBeenCalled();
    expect(documentVideosRepository.find).not.toHaveBeenCalled();
    expect(nonConformitiesRepository.find).not.toHaveBeenCalled();
    expect(documentStorageService.getSignedUrl).not.toHaveBeenCalled();
    expect(storageService.getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(rdosRepository.find).toHaveBeenCalled();
  });
});
