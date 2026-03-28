import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type EntityManager,
  DataSource,
  In,
  IsNull,
  Repository,
} from 'typeorm';
import { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { resolveRegistryModuleForSignatureDocumentType } from '../document-registry/document-governance.service';
import { UsersService } from '../users/users.service';
import { Signature } from './entities/signature.entity';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
import { Apr, AprStatus } from '../aprs/entities/apr.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Checklist } from '../checklists/entities/checklist.entity';
import { Inspection } from '../inspections/entities/inspection.entity';
import { Cat } from '../cats/entities/cat.entity';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';
import { Audit } from '../audits/entities/audit.entity';
import { Rdo } from '../rdos/entities/rdo.entity';
import {
  SIGNATURE_LEGAL_ASSURANCE,
  SIGNATURE_PROOF_SCOPES,
  SIGNATURE_VERIFICATION_MODES,
  canonicalizeSignaturePayload,
  hashCanonicalSignaturePayload,
  hashSignatureEvidence,
} from './signature-proof.util';

type SignatureWriteInput = CreateSignatureDto & {
  signer_user_id?: string;
};

type SignatureVerificationMode =
  (typeof SIGNATURE_VERIFICATION_MODES)[keyof typeof SIGNATURE_VERIFICATION_MODES];

type SignatureProofScope =
  (typeof SIGNATURE_PROOF_SCOPES)[keyof typeof SIGNATURE_PROOF_SCOPES];

type SignatureLegalAssurance =
  (typeof SIGNATURE_LEGAL_ASSURANCE)[keyof typeof SIGNATURE_LEGAL_ASSURANCE];

type SignatureDocumentBinding = {
  module: string;
  proofScope: SignatureProofScope;
  reference: string | null;
  status: string | null;
  version: string | number | null;
  updatedAt: string | null;
  bindingHash: string;
  registryEntryId: string | null;
  documentCode: string | null;
  fileHash: string | null;
  fileKey: string | null;
};

type SignatureVerificationDetails = {
  verificationMode: SignatureVerificationMode;
  proofScope: SignatureProofScope | null;
  legalAssurance: SignatureLegalAssurance;
  canonicalPayloadHash: string | null;
  signatureEvidenceHash: string | null;
  documentBindingHash: string | null;
};

@Injectable()
export class SignaturesService {
  constructor(
    @InjectRepository(Signature)
    private signaturesRepository: Repository<Signature>,
    private readonly dataSource: DataSource,
    private readonly tenantService: TenantService,
    private readonly signatureTimestampService: SignatureTimestampService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly usersService: UsersService,
    private readonly forensicTrailService: ForensicTrailService,
  ) {}

  async create(
    createSignatureDto: CreateSignatureDto,
    authenticatedUserId: string,
  ): Promise<Signature> {
    const companyId =
      createSignatureDto.company_id || this.tenantService.getTenantId() || null;
    await this.assertDocumentSignatureMutable({
      documentId: createSignatureDto.document_id,
      documentType: createSignatureDto.document_type,
      companyId,
    });
    return this.signaturesRepository.manager.transaction((manager) =>
      this.persistSignature(
        createSignatureDto,
        authenticatedUserId,
        authenticatedUserId,
        manager,
      ),
    );
  }

  async replaceDocumentSignatures(input: {
    document_id: string;
    document_type: string;
    company_id?: string;
    authenticated_user_id: string;
    signatures: SignatureWriteInput[];
  }): Promise<Signature[]> {
    await this.assertDocumentSignatureMutable({
      documentId: input.document_id,
      documentType: input.document_type,
      companyId: input.company_id || this.tenantService.getTenantId() || null,
    });
    return this.signaturesRepository.manager.transaction(async (manager) => {
      await manager.getRepository(Signature).delete({
        document_id: input.document_id,
        document_type: input.document_type,
      });

      const created: Signature[] = [];
      for (const signatureInput of input.signatures) {
        created.push(
          await this.persistSignature(
            {
              ...signatureInput,
              document_id: input.document_id,
              document_type: input.document_type,
              company_id: signatureInput.company_id || input.company_id,
            },
            input.authenticated_user_id,
            signatureInput.signer_user_id || signatureInput.user_id,
            manager,
          ),
        );
      }

      return created;
    });
  }

  async findManyByDocuments(
    documentIds: string[],
    documentType: string,
    options?: {
      companyId?: string;
      typePrefix?: string;
    },
  ): Promise<Signature[]> {
    if (documentIds.length === 0) {
      return [];
    }

    const tenantId = this.tenantService.getTenantId();
    const effectiveCompanyId = options?.companyId || tenantId;
    const query = this.signaturesRepository
      .createQueryBuilder('signature')
      .where('signature.document_id IN (:...documentIds)', { documentIds })
      .andWhere('signature.document_type = :documentType', { documentType })
      .orderBy('signature.created_at', 'DESC');

    if (effectiveCompanyId) {
      query.andWhere(
        '(signature.company_id = :companyId OR signature.company_id IS NULL)',
        { companyId: effectiveCompanyId },
      );
    }

    if (options?.typePrefix) {
      query.andWhere('signature.type LIKE :typePrefix', {
        typePrefix: `${options.typePrefix}%`,
      });
    }

    return query.getMany();
  }

  private async persistSignature(
    createSignatureDto: CreateSignatureDto,
    authenticatedUserId: string,
    signerUserId = authenticatedUserId,
    manager?: EntityManager,
  ): Promise<Signature> {
    const tenantId = this.tenantService.getTenantId();
    let payload = { ...createSignatureDto };
    const effectiveCompanyId = payload.company_id || tenantId || null;
    const signedAtIso = new Date().toISOString();

    if (payload.type === 'hmac') {
      if (!payload.pin) {
        throw new BadRequestException('PIN obrigatório para assinatura HMAC.');
      }
      const hmacKey = await this.usersService.deriveHmacKey(
        signerUserId,
        payload.pin,
      );
      const message = [
        payload.document_id,
        payload.document_type,
        signerUserId,
        effectiveCompanyId || '',
        signedAtIso,
      ].join('|');
      const hmacHex = this.usersService.computeHmac(hmacKey, message);
      payload = {
        ...payload,
        signature_data: hmacHex,
        pin: undefined,
      };
    }

    const registryContext =
      await this.documentGovernanceService.findRegistryContextForSignature(
        payload.document_id,
        payload.document_type,
        effectiveCompanyId,
      );
    const documentBinding = await this.resolveDocumentBindingContext({
      documentId: payload.document_id,
      documentType: payload.document_type,
      companyId: effectiveCompanyId,
      registryContext,
    });
    const signatureEvidenceHash = hashSignatureEvidence(payload.signature_data);
    const verificationMode = SIGNATURE_VERIFICATION_MODES.SERVER_VERIFIABLE;
    const proofScope = documentBinding.proofScope;
    const legalAssurance = SIGNATURE_LEGAL_ASSURANCE.NOT_LEGAL_STRONG;
    const canonicalPayload = canonicalizeSignaturePayload({
      schema_version: 2,
      verification_mode: verificationMode,
      legal_assurance: legalAssurance,
      document: {
        id: payload.document_id,
        type: payload.document_type,
        module: documentBinding.module,
        company_id: effectiveCompanyId,
        reference: documentBinding.reference,
        status: documentBinding.status,
        version: documentBinding.version,
        updated_at: documentBinding.updatedAt,
        proof_scope: proofScope,
        binding_hash: documentBinding.bindingHash,
        registry_entry_id: documentBinding.registryEntryId,
        document_code: documentBinding.documentCode,
        file_hash: documentBinding.fileHash,
        file_key: documentBinding.fileKey,
      },
      signer: {
        user_id: signerUserId,
        captured_by_user_id:
          authenticatedUserId !== signerUserId ? authenticatedUserId : null,
      },
      signature: {
        type: payload.type,
        evidence_hash: signatureEvidenceHash,
        evidence_kind: this.resolveEvidenceKind(
          payload.type,
          payload.signature_data,
        ),
      },
      signed_at: signedAtIso,
    });
    const canonicalPayloadHash =
      hashCanonicalSignaturePayload(canonicalPayload);
    const generatedStamp = this.signatureTimestampService.issueFromHash(
      canonicalPayloadHash,
      signedAtIso,
    );
    const signedAt = new Date(generatedStamp.timestamp_issued_at);
    const signatureRepository =
      manager?.getRepository(Signature) ?? this.signaturesRepository;
    const signature = signatureRepository.create({
      document_id: payload.document_id,
      document_type: payload.document_type,
      signature_data: payload.signature_data,
      type: payload.type,
      user_id: signerUserId,
      company_id: effectiveCompanyId || undefined,
      signature_hash: generatedStamp.signature_hash,
      timestamp_token: generatedStamp.timestamp_token,
      timestamp_authority: generatedStamp.timestamp_authority,
      signed_at: signedAt,
      integrity_payload: {
        schema_version: 2,
        document_id: payload.document_id,
        document_type: payload.document_type,
        user_id: signerUserId,
        captured_by_user_id:
          authenticatedUserId !== signerUserId
            ? authenticatedUserId
            : undefined,
        type: payload.type,
        signed_at: signedAt.toISOString(),
        verification_mode: verificationMode,
        legal_assurance: legalAssurance,
        proof_scope: proofScope,
        canonical_payload_hash: canonicalPayloadHash,
        canonical_payload: canonicalPayload,
        signature_evidence_hash: signatureEvidenceHash,
        signature_evidence_kind: this.resolveEvidenceKind(
          payload.type,
          payload.signature_data,
        ),
        hmac_verified: payload.type === 'hmac' ? true : undefined,
        document_binding: {
          module: documentBinding.module,
          reference: documentBinding.reference,
          status: documentBinding.status,
          version: documentBinding.version,
          updated_at: documentBinding.updatedAt,
          proof_scope: documentBinding.proofScope,
          binding_hash: documentBinding.bindingHash,
        },
        document_registry: registryContext
          ? {
              entry_id: registryContext.registryEntryId,
              module: registryContext.module,
              document_code: registryContext.documentCode,
              file_hash: registryContext.fileHash,
              file_key: registryContext.fileKey,
            }
          : undefined,
      },
    });
    const savedSignature = await signatureRepository.save(signature);
    const signatureModule =
      registryContext?.module ||
      resolveRegistryModuleForSignatureDocumentType(payload.document_type) ||
      normalizeModuleFromDocumentType(payload.document_type);

    await this.forensicTrailService.append(
      {
        eventType: FORENSIC_EVENT_TYPES.SIGNATURE_RECORDED,
        module: signatureModule,
        entityId: payload.document_id,
        companyId: effectiveCompanyId,
        userId: signerUserId,
        occurredAt: signedAt,
        metadata: {
          signatureId: savedSignature.id,
          signatureType: payload.type,
          documentType: payload.document_type,
          signedAt: signedAt.toISOString(),
          signatureHash: savedSignature.signature_hash || null,
          signatureEvidenceHash,
          verificationMode,
          proofScope,
          timestampAuthority: savedSignature.timestamp_authority || null,
          registryEntryId: registryContext?.registryEntryId || null,
          documentCode: registryContext?.documentCode || null,
          documentFileHash: registryContext?.fileHash || null,
          documentBindingHash: documentBinding.bindingHash,
        },
      },
      manager ? { manager } : undefined,
    );

    return savedSignature;
  }

  async findByDocument(
    document_id: string,
    document_type: string,
  ): Promise<Signature[]> {
    const tenantId = this.tenantService.getTenantId();
    const where = tenantId
      ? [
          { document_id, document_type, company_id: tenantId },
          { document_id, document_type, company_id: IsNull() },
        ]
      : { document_id, document_type };
    return this.signaturesRepository.find({
      where,
      relations: ['user'],
    });
  }

  async remove(
    signatureId: string,
    requesterId: string,
    requesterRole?: string | null,
  ): Promise<void> {
    const tenantId = this.tenantService.getTenantId();
    const signature = await this.signaturesRepository.findOne({
      where: tenantId
        ? [
            { id: signatureId, company_id: tenantId },
            { id: signatureId, company_id: IsNull() },
          ]
        : { id: signatureId },
    });

    if (!signature) {
      throw new NotFoundException('Assinatura não encontrada.');
    }

    const isOwner = signature.user_id === requesterId;
    const isPrivileged = this.isPrivilegedRole(requesterRole);

    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException(
        'Sem permissão para remover esta assinatura.',
      );
    }

    await this.assertDocumentSignatureMutable({
      documentId: signature.document_id,
      documentType: signature.document_type,
      companyId: signature.company_id || tenantId || null,
    });

    await this.signaturesRepository.delete({ id: signature.id });
  }

  async removeByDocument(
    document_id: string,
    document_type: string,
    requesterId: string,
    requesterRole?: string | null,
  ): Promise<void> {
    const tenantId = this.tenantService.getTenantId();
    const where = tenantId
      ? [
          { document_id, document_type, company_id: tenantId },
          { document_id, document_type, company_id: IsNull() },
        ]
      : { document_id, document_type };
    const signatures = await this.signaturesRepository.find({ where });

    if (signatures.length === 0) {
      return;
    }

    const isPrivileged = this.isPrivilegedRole(requesterRole);
    if (!isPrivileged) {
      const hasUnauthorized = signatures.some(
        (signature) => signature.user_id !== requesterId,
      );
      if (hasUnauthorized) {
        throw new ForbiddenException(
          'Sem permissão para remover assinaturas deste documento.',
        );
      }
    }

    await this.assertDocumentSignatureMutable({
      documentId: document_id,
      documentType: document_type,
      companyId: tenantId || signatures[0]?.company_id || null,
    });

    await this.signaturesRepository.delete({
      id: In(signatures.map((signature) => signature.id)),
    });
  }

  async removeByDocumentSystem(
    document_id: string,
    document_type: string,
  ): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const deleteResult = await this.signaturesRepository.delete(
      tenantId
        ? [
            { document_id, document_type, company_id: tenantId },
            { document_id, document_type, company_id: IsNull() },
          ]
        : { document_id, document_type },
    );

    return deleteResult.affected ?? 0;
  }

  async verifyById(signatureId: string): Promise<{
    id: string;
    valid: boolean;
    signed_at?: string;
    timestamp_authority?: string;
    signature_hash?: string;
    verification_mode: SignatureVerificationMode;
    legal_assurance: SignatureLegalAssurance;
    proof_scope?: SignatureProofScope | null;
    document_binding_hash?: string | null;
    signature_evidence_hash?: string | null;
  }> {
    const tenantId = this.tenantService.getTenantId();
    const signature = await this.signaturesRepository.findOne({
      where: tenantId
        ? [
            { id: signatureId, company_id: tenantId },
            { id: signatureId, company_id: IsNull() },
          ]
        : { id: signatureId },
    });

    if (!signature) {
      throw new NotFoundException('Assinatura não encontrada.');
    }

    const hasFields = Boolean(
      signature.signature_hash && signature.timestamp_token,
    );
    const valid = hasFields
      ? this.signatureTimestampService.verify(
          signature.signature_hash as string,
          signature.timestamp_token as string,
        )
      : false;
    const verificationDetails = this.extractVerificationDetails(signature);

    return {
      id: signature.id,
      valid,
      signed_at: signature.signed_at?.toISOString(),
      timestamp_authority: signature.timestamp_authority,
      signature_hash: signature.signature_hash,
      verification_mode: verificationDetails.verificationMode,
      legal_assurance: verificationDetails.legalAssurance,
      proof_scope: verificationDetails.proofScope,
      document_binding_hash: verificationDetails.documentBindingHash,
      signature_evidence_hash: verificationDetails.signatureEvidenceHash,
    };
  }

  async verifyByHashPublic(signatureHash: string): Promise<{
    valid: boolean;
    message?: string;
  }> {
    const normalizedHash = String(signatureHash || '')
      .trim()
      .toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalizedHash)) {
      return {
        valid: false,
        message: 'Hash SHA-256 inválido.',
      };
    }

    const signature = await this.signaturesRepository.findOne({
      where: { signature_hash: normalizedHash },
    });

    if (!signature) {
      return {
        valid: false,
        message: 'Assinatura não localizada.',
      };
    }

    const persistedHash = signature.signature_hash;
    const timestampToken = signature.timestamp_token;
    const valid =
      typeof persistedHash === 'string' &&
      typeof timestampToken === 'string' &&
      this.signatureTimestampService.verify(persistedHash, timestampToken);

    return {
      valid,
      message: valid
        ? 'Assinatura validada com sucesso.'
        : 'Assinatura localizada, mas inválida.',
    };
  }

  private resolveEvidenceKind(type: string, signatureData: string): string {
    if (type === 'hmac') {
      return 'pin_hmac';
    }

    if (type.startsWith('team_photo_')) {
      return 'json';
    }

    if (signatureData.startsWith('data:image')) {
      return 'image_data_url';
    }

    return 'raw_text';
  }

  private async resolveDocumentBindingContext(input: {
    documentId: string;
    documentType: string;
    companyId: string | null;
    registryContext: {
      registryEntryId: string;
      module: string;
      documentCode: string | null;
      fileHash: string | null;
      fileKey: string | null;
    } | null;
  }): Promise<SignatureDocumentBinding> {
    const module =
      input.registryContext?.module ||
      resolveRegistryModuleForSignatureDocumentType(input.documentType) ||
      normalizeModuleFromDocumentType(input.documentType);
    const entityContext = await this.loadEntityBindingContext(
      module,
      input.documentId,
      input.companyId,
    );

    const bindingHash =
      input.registryContext?.fileHash ||
      entityContext?.stateHash ||
      hashCanonicalSignaturePayload({
        documentId: input.documentId,
        documentType: input.documentType,
        companyId: input.companyId,
      });
    const proofScope = input.registryContext?.fileHash
      ? SIGNATURE_PROOF_SCOPES.GOVERNED_FINAL_DOCUMENT
      : entityContext?.stateHash
        ? SIGNATURE_PROOF_SCOPES.DOCUMENT_REVISION
        : SIGNATURE_PROOF_SCOPES.DOCUMENT_IDENTITY;

    return {
      module,
      proofScope,
      reference: entityContext?.reference || null,
      status: entityContext?.status || null,
      version: entityContext?.version ?? null,
      updatedAt: entityContext?.updatedAt || null,
      bindingHash,
      registryEntryId: input.registryContext?.registryEntryId || null,
      documentCode: input.registryContext?.documentCode || null,
      fileHash: input.registryContext?.fileHash || null,
      fileKey: input.registryContext?.fileKey || null,
    };
  }

  private async assertDocumentSignatureMutable(input: {
    documentId: string;
    documentType: string;
    companyId: string | null;
  }): Promise<void> {
    const module =
      resolveRegistryModuleForSignatureDocumentType(input.documentType) ||
      normalizeModuleFromDocumentType(input.documentType);

    const registryContext =
      await this.documentGovernanceService.findRegistryContextForSignature(
        input.documentId,
        input.documentType,
        input.companyId,
      );
    const hasGovernedFinalPdf = Boolean(registryContext?.fileKey);

    switch (module) {
      case 'apr': {
        const apr = await this.dataSource.getRepository(Apr).findOne({
          where: input.companyId
            ? { id: input.documentId, company_id: input.companyId }
            : { id: input.documentId },
          select: ['id', 'company_id', 'status', 'pdf_file_key'],
        });

        if (!apr) {
          throw new NotFoundException('APR não encontrada para assinatura.');
        }

        if (hasGovernedFinalPdf || apr.pdf_file_key) {
          throw new BadRequestException(
            'APR com PDF final emitido está bloqueada para alterações de assinatura. Gere uma nova versão para seguir com alterações.',
          );
        }

        const isPendingApr = String(apr.status) === String(AprStatus.PENDENTE);
        if (!isPendingApr) {
          throw new BadRequestException(
            'Somente APRs pendentes podem ter assinaturas alteradas diretamente. Use nova versão se precisar ajustar signatários.',
          );
        }
        return;
      }
      case 'pt': {
        const pt = await this.dataSource.getRepository(Pt).findOne({
          where: input.companyId
            ? { id: input.documentId, company_id: input.companyId }
            : { id: input.documentId },
          select: ['id', 'company_id', 'pdf_file_key'],
        });

        if (!pt) {
          throw new NotFoundException('PT não encontrada para assinatura.');
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'PT',
          hasLegacyPdf: Boolean(pt.pdf_file_key),
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'dds': {
        const dds = await this.dataSource.getRepository(Dds).findOne({
          where: input.companyId
            ? { id: input.documentId, company_id: input.companyId }
            : { id: input.documentId },
          select: ['id', 'company_id', 'is_modelo', 'pdf_file_key'],
        });

        if (!dds) {
          throw new NotFoundException('DDS não encontrado para assinatura.');
        }

        if (dds.is_modelo) {
          throw new BadRequestException(
            'Modelos de DDS não aceitam alterações de assinatura por este fluxo.',
          );
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'DDS',
          hasLegacyPdf: Boolean(dds.pdf_file_key),
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'checklist': {
        const checklist = await this.dataSource
          .getRepository(Checklist)
          .findOne({
            where: input.companyId
              ? { id: input.documentId, company_id: input.companyId }
              : { id: input.documentId },
            select: ['id', 'company_id', 'is_modelo', 'pdf_file_key'],
          });

        if (!checklist) {
          throw new NotFoundException(
            'Checklist não encontrado para assinatura.',
          );
        }

        if (checklist.is_modelo) {
          throw new BadRequestException(
            'Modelos de checklist não aceitam alterações de assinatura por este fluxo.',
          );
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'Checklist',
          hasLegacyPdf: Boolean(checklist.pdf_file_key),
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'inspection': {
        const inspection = await this.dataSource
          .getRepository(Inspection)
          .findOne({
            where: input.companyId
              ? { id: input.documentId, company_id: input.companyId }
              : { id: input.documentId },
            select: ['id', 'company_id'],
          });

        if (!inspection) {
          throw new NotFoundException(
            'Relatório de inspeção não encontrado para assinatura.',
          );
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'Relatório de inspeção',
          hasLegacyPdf: false,
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'cat': {
        const cat = await this.dataSource.getRepository(Cat).findOne({
          where: input.companyId
            ? { id: input.documentId, company_id: input.companyId }
            : { id: input.documentId },
          select: ['id', 'company_id', 'pdf_file_key'],
        });

        if (!cat) {
          throw new NotFoundException('CAT não encontrada para assinatura.');
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'CAT',
          hasLegacyPdf: Boolean(cat.pdf_file_key),
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'nonconformity': {
        const nonconformity = await this.dataSource
          .getRepository(NonConformity)
          .findOne({
            where: input.companyId
              ? { id: input.documentId, company_id: input.companyId }
              : { id: input.documentId },
            select: ['id', 'company_id', 'pdf_file_key'],
          });

        if (!nonconformity) {
          throw new NotFoundException(
            'Não conformidade não encontrada para assinatura.',
          );
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'Não conformidade',
          hasLegacyPdf: Boolean(nonconformity.pdf_file_key),
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'audit': {
        const audit = await this.dataSource.getRepository(Audit).findOne({
          where: input.companyId
            ? { id: input.documentId, company_id: input.companyId }
            : { id: input.documentId },
          select: ['id', 'company_id', 'pdf_file_key'],
        });

        if (!audit) {
          throw new NotFoundException(
            'Auditoria não encontrada para assinatura.',
          );
        }

        this.assertNoFinalPdfSignatureMutation({
          documentLabel: 'Auditoria',
          hasLegacyPdf: Boolean(audit.pdf_file_key),
          hasGovernedFinalPdf,
        });
        return;
      }
      case 'rdo':
        // O RDO já possui fluxo próprio e verificável de assinatura operacional.
        return;
      default:
        return;
    }
  }

  private async loadEntityBindingContext(
    module: string,
    documentId: string,
    companyId: string | null,
  ): Promise<{
    reference: string | null;
    status: string | null;
    version: string | number | null;
    updatedAt: string | null;
    stateHash: string;
  } | null> {
    switch (module) {
      case 'apr': {
        const apr = await this.dataSource.getRepository(Apr).findOne({
          where: companyId
            ? { id: documentId, company_id: companyId }
            : { id: documentId },
          select: [
            'id',
            'company_id',
            'numero',
            'versao',
            'status',
            'updated_at',
          ],
        });
        if (!apr) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: apr.id,
          companyId: apr.company_id,
          reference: apr.numero,
          status: apr.status,
          version: apr.versao,
          updatedAt: apr.updated_at,
        });
      }
      case 'pt': {
        const pt = await this.dataSource.getRepository(Pt).findOne({
          where: companyId
            ? { id: documentId, company_id: companyId }
            : { id: documentId },
          select: ['id', 'company_id', 'numero', 'status', 'updated_at'],
        });
        if (!pt) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: pt.id,
          companyId: pt.company_id,
          reference: pt.numero,
          status: pt.status,
          version: null,
          updatedAt: pt.updated_at,
        });
      }
      case 'dds': {
        const dds = await this.dataSource.getRepository(Dds).findOne({
          where: companyId
            ? { id: documentId, company_id: companyId }
            : { id: documentId },
          select: ['id', 'company_id', 'tema', 'status', 'updated_at'],
        });
        if (!dds) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: dds.id,
          companyId: dds.company_id,
          reference: dds.tema,
          status: dds.status,
          version: null,
          updatedAt: dds.updated_at,
        });
      }
      case 'checklist': {
        const checklist = await this.dataSource
          .getRepository(Checklist)
          .findOne({
            where: companyId
              ? { id: documentId, company_id: companyId }
              : { id: documentId },
            select: ['id', 'company_id', 'titulo', 'status', 'updated_at'],
          });
        if (!checklist) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: checklist.id,
          companyId: checklist.company_id,
          reference: checklist.titulo,
          status: checklist.status,
          version: null,
          updatedAt: checklist.updated_at,
        });
      }
      case 'inspection': {
        const inspection = await this.dataSource
          .getRepository(Inspection)
          .findOne({
            where: companyId
              ? { id: documentId, company_id: companyId }
              : { id: documentId },
            select: [
              'id',
              'company_id',
              'tipo_inspecao',
              'setor_area',
              'updated_at',
            ],
          });
        if (!inspection) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: inspection.id,
          companyId: inspection.company_id,
          reference: `${inspection.tipo_inspecao} - ${inspection.setor_area}`,
          status: null,
          version: null,
          updatedAt: inspection.updated_at,
        });
      }
      case 'cat': {
        const cat = await this.dataSource.getRepository(Cat).findOne({
          where: companyId
            ? { id: documentId, company_id: companyId }
            : { id: documentId },
          select: ['id', 'company_id', 'numero', 'status', 'updated_at'],
        });
        if (!cat) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: cat.id,
          companyId: cat.company_id,
          reference: cat.numero,
          status: cat.status,
          version: null,
          updatedAt: cat.updated_at,
        });
      }
      case 'nonconformity': {
        const nonconformity = await this.dataSource
          .getRepository(NonConformity)
          .findOne({
            where: companyId
              ? { id: documentId, company_id: companyId }
              : { id: documentId },
            select: ['id', 'company_id', 'codigo_nc', 'status', 'updated_at'],
          });
        if (!nonconformity) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: nonconformity.id,
          companyId: nonconformity.company_id,
          reference: nonconformity.codigo_nc,
          status: nonconformity.status,
          version: null,
          updatedAt: nonconformity.updated_at,
        });
      }
      case 'audit': {
        const audit = await this.dataSource.getRepository(Audit).findOne({
          where: companyId
            ? { id: documentId, company_id: companyId }
            : { id: documentId },
          select: ['id', 'company_id', 'titulo', 'updated_at'],
        });
        if (!audit) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: audit.id,
          companyId: audit.company_id,
          reference: audit.titulo,
          status: null,
          version: null,
          updatedAt: audit.updated_at,
        });
      }
      case 'rdo': {
        const rdo = await this.dataSource.getRepository(Rdo).findOne({
          where: companyId
            ? { id: documentId, company_id: companyId }
            : { id: documentId },
          select: ['id', 'company_id', 'numero', 'status', 'updated_at'],
        });
        if (!rdo) {
          return null;
        }

        return this.buildEntityBindingContext({
          module,
          documentId: rdo.id,
          companyId: rdo.company_id,
          reference: rdo.numero,
          status: rdo.status,
          version: null,
          updatedAt: rdo.updated_at,
        });
      }
      default:
        return null;
    }
  }

  private assertNoFinalPdfSignatureMutation(input: {
    documentLabel: string;
    hasLegacyPdf: boolean;
    hasGovernedFinalPdf: boolean;
  }) {
    if (!input.hasLegacyPdf && !input.hasGovernedFinalPdf) {
      return;
    }

    throw new BadRequestException(
      `${input.documentLabel} com PDF final emitido está bloqueado para alterações de assinatura.`,
    );
  }

  private buildEntityBindingContext(input: {
    module: string;
    documentId: string;
    companyId: string | null;
    reference: string | null;
    status: string | null;
    version: string | number | null;
    updatedAt: Date | null;
  }) {
    const updatedAtIso = input.updatedAt?.toISOString() || null;
    const stateHash = hashCanonicalSignaturePayload({
      module: input.module,
      document_id: input.documentId,
      company_id: input.companyId,
      reference: input.reference,
      status: input.status,
      version: input.version,
      updated_at: updatedAtIso,
    });

    return {
      reference: input.reference,
      status: input.status,
      version: input.version,
      updatedAt: updatedAtIso,
      stateHash,
    };
  }

  private extractVerificationDetails(
    signature: Signature,
  ): SignatureVerificationDetails {
    const integrityPayload =
      (signature.integrity_payload as Record<string, unknown> | null) || null;
    const documentBinding =
      (integrityPayload?.document_binding as
        | Record<string, unknown>
        | undefined) || undefined;

    const verificationMode = this.isKnownVerificationMode(
      integrityPayload?.verification_mode,
    )
      ? integrityPayload?.verification_mode
      : SIGNATURE_VERIFICATION_MODES.LEGACY_CLIENT_HASH;
    const proofScope = this.isKnownProofScope(integrityPayload?.proof_scope)
      ? integrityPayload?.proof_scope
      : null;
    const legalAssurance = this.isKnownLegalAssurance(
      integrityPayload?.legal_assurance,
    )
      ? integrityPayload?.legal_assurance
      : SIGNATURE_LEGAL_ASSURANCE.NOT_LEGAL_STRONG;

    return {
      verificationMode,
      proofScope,
      legalAssurance,
      canonicalPayloadHash:
        typeof integrityPayload?.canonical_payload_hash === 'string'
          ? integrityPayload.canonical_payload_hash
          : null,
      signatureEvidenceHash:
        typeof integrityPayload?.signature_evidence_hash === 'string'
          ? integrityPayload.signature_evidence_hash
          : null,
      documentBindingHash:
        typeof documentBinding?.binding_hash === 'string'
          ? documentBinding.binding_hash
          : null,
    };
  }

  private isKnownVerificationMode(
    value: unknown,
  ): value is SignatureVerificationMode {
    return Object.values(SIGNATURE_VERIFICATION_MODES).includes(
      value as SignatureVerificationMode,
    );
  }

  private isKnownProofScope(value: unknown): value is SignatureProofScope {
    return Object.values(SIGNATURE_PROOF_SCOPES).includes(
      value as SignatureProofScope,
    );
  }

  private isKnownLegalAssurance(
    value: unknown,
  ): value is SignatureLegalAssurance {
    return Object.values(SIGNATURE_LEGAL_ASSURANCE).includes(
      value as SignatureLegalAssurance,
    );
  }

  private isPrivilegedRole(roleName?: string | null): boolean {
    if (!roleName) {
      return false;
    }

    const normalized = roleName.trim().toLowerCase();
    const privilegedRoles = new Set([
      'admin',
      'manager',
      'super_admin',
      'administrador geral',
      'administrador da empresa',
      'admin empresa',
      'supervisor / encarregado',
    ]);

    return privilegedRoles.has(normalized);
  }
}

function normalizeModuleFromDocumentType(documentType: string): string {
  const normalized = String(documentType || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (normalized === 'auditoria') {
    return 'audit';
  }

  if (
    normalized === 'nao_conformidade' ||
    normalized === 'nonconformity' ||
    normalized === 'nc'
  ) {
    return 'nonconformity';
  }

  if (normalized === 'inspecao' || normalized === 'inspection') {
    return 'inspection';
  }

  return normalized || 'document';
}
