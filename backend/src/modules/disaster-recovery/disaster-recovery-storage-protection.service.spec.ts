import { createHash } from 'crypto';
import { DisasterRecoveryStorageProtectionService } from './disaster-recovery-storage-protection.service';
import type { DisasterRecoveryIntegrityScanReport } from './disaster-recovery.types';

describe('DisasterRecoveryStorageProtectionService', () => {
  const buildIntegrityReport = (): DisasterRecoveryIntegrityScanReport => ({
    summary: {
      environment: 'test',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      degraded: false,
      storageConfigured: true,
      storageTarget: {
        mode: 'managed',
        bucketName: 'primary-bucket',
        endpoint: 'https://primary.example',
      },
      scannedRegistryDocuments: 0,
      scannedGovernedVideos: 0,
      scannedGovernedAttachments: 0,
      scannedAprEvidences: 0,
      orphanArtifactsFound: 0,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
    },
    issues: [],
    inventory: [],
    orphanKeys: [],
    scannedPrefixes: [],
  });

  const buildSubject = () => {
    const executionService = {
      startExecution: jest.fn().mockResolvedValue({ id: 'exec-1' }),
      finalizeExecution: jest.fn().mockResolvedValue(undefined),
    };
    const integrityService = {
      scan: jest.fn<Promise<DisasterRecoveryIntegrityScanReport>, [unknown]>(),
    };
    const documentStorageService = {
      isStorageConfigured: jest.fn().mockReturnValue(true),
      getStorageConfigurationSummary: jest.fn().mockReturnValue({
        mode: 'managed',
        bucketName: 'primary-bucket',
        endpoint: 'https://primary.example',
      }),
      downloadFileBuffer: jest.fn(),
    };
    const replicaStorageService = {
      getConfigurationSummary: jest.fn().mockReturnValue({
        configured: true,
        bucketName: 'replica-bucket',
        endpoint: 'https://replica.example',
      }),
      fileExists: jest.fn(),
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
    };

    const service = new DisasterRecoveryStorageProtectionService(
      executionService as never,
      integrityService as never,
      documentStorageService as never,
      replicaStorageService as never,
    );

    return {
      service,
      executionService,
      integrityService,
      documentStorageService,
      replicaStorageService,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('retorna nota operacional quando storage principal não está configurado', async () => {
    const {
      service,
      documentStorageService,
      replicaStorageService,
      integrityService,
    } = buildSubject();
    documentStorageService.isStorageConfigured.mockReturnValue(false);
    replicaStorageService.getConfigurationSummary.mockReturnValue({
      configured: true,
      bucketName: 'replica-bucket',
      endpoint: 'https://replica.example',
    });

    const report = await service.replicateGovernedArtifacts({
      dryRun: true,
      triggerSource: 'test',
    });

    expect(report.summary.sourceStorageConfigured).toBe(false);
    expect(report.summary.failed).toBe(1);
    expect(report.notes[0]).toContain('Storage governado principal');
    expect(integrityService.scan).not.toHaveBeenCalled();
  });

  it('planeja cópia em dry-run e marca artefato de origem faltante', async () => {
    const {
      service,
      integrityService,
      replicaStorageService,
      executionService,
    } = buildSubject();
    const integrityReport = buildIntegrityReport();
    integrityReport.inventory = [
      {
        source: 'registry',
        module: 'apr',
        companyId: 'company-1',
        entityId: 'doc-1',
        fileKey: 'documents/company-1/apr/doc-1/final.pdf',
        expectedHash: 'hash-doc-1',
        metadata: {
          mimeType: 'application/pdf',
        },
      },
      {
        source: 'video',
        module: 'dds',
        companyId: 'company-1',
        entityId: 'doc-2',
        fileKey: 'documents/company-1/dds/doc-2/video.mp4',
        expectedHash: 'hash-doc-2',
        metadata: {
          mimeType: 'video/mp4',
        },
      },
    ];
    integrityReport.issues = [
      {
        severity: 'high',
        issueType: 'video_missing_artifact',
        module: 'dds',
        companyId: 'company-1',
        entityId: 'doc-2',
        fileKey: 'documents/company-1/dds/doc-2/video.mp4',
        message: 'Vídeo não encontrado.',
      },
    ];
    integrityService.scan.mockResolvedValue(integrityReport);
    replicaStorageService.fileExists.mockResolvedValue(false);

    const report = await service.replicateGovernedArtifacts({
      dryRun: true,
      triggerSource: 'test',
      companyId: 'company-1',
    });

    expect(report.summary.totalInventory).toBe(2);
    expect(report.summary.sourceMissing).toBe(1);
    expect(report.summary.copied).toBe(0);
    expect(report.items[0].action).toBe('planned');
    expect(report.items[1].action).toBe('source_missing');
    expect(executionService.startExecution).not.toHaveBeenCalled();
  });

  it('copia artefato para bucket secundário e registra hash quando executa de verdade', async () => {
    const {
      service,
      executionService,
      integrityService,
      documentStorageService,
      replicaStorageService,
    } = buildSubject();
    const integrityReport = buildIntegrityReport();
    integrityReport.inventory = [
      {
        source: 'registry',
        module: 'pt',
        companyId: 'company-1',
        entityId: 'doc-1',
        fileKey: 'documents/company-1/pt/doc-1/final.pdf',
        expectedHash: null,
        metadata: {
          mimeType: 'application/pdf',
        },
      },
    ];
    integrityService.scan.mockResolvedValue(integrityReport);
    replicaStorageService.fileExists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const buffer = Buffer.from('governed-document');
    documentStorageService.downloadFileBuffer.mockResolvedValue(buffer);

    const report = await service.replicateGovernedArtifacts({
      dryRun: false,
      triggerSource: 'manual',
      requestedByUserId: 'user-1',
      artifactPath: 'output/report.json',
    });

    const expectedHash = createHash('sha256').update(buffer).digest('hex');
    const uploadBufferMock = replicaStorageService.uploadBuffer as jest.Mock<
      Promise<void>,
      [
        {
          key: string;
          contentType: string;
          metadata: Record<string, string>;
        },
      ]
    >;
    const [uploadCall] = uploadBufferMock.mock.calls[0] || [];

    expect(executionService.startExecution).toHaveBeenCalledTimes(1);
    expect(uploadCall).toBeDefined();
    expect(uploadCall.key).toBe('documents/company-1/pt/doc-1/final.pdf');
    expect(uploadCall.contentType).toBe('application/pdf');
    expect(uploadCall.metadata['dr-source-key']).toBe(
      'documents/company-1/pt/doc-1/final.pdf',
    );
    expect(uploadCall.metadata['dr-sha256']).toBe(expectedHash);
    expect(report.summary.copied).toBe(1);
    expect(report.items[0].action).toBe('copied');
    expect(report.items[0].sha256).toBe(expectedHash);
    expect(executionService.finalizeExecution).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({
        status: 'success',
      }),
    );
  });
});
