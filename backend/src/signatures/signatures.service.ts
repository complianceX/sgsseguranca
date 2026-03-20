import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, IsNull, Repository } from 'typeorm';
import { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { UsersService } from '../users/users.service';
import { Signature } from './entities/signature.entity';
import { CreateSignatureDto } from './dto/create-signature.dto';

type SignatureWriteInput = CreateSignatureDto & {
  signer_user_id?: string;
};

@Injectable()
export class SignaturesService {
  constructor(
    @InjectRepository(Signature)
    private signaturesRepository: Repository<Signature>,
    private readonly tenantService: TenantService,
    private readonly signatureTimestampService: SignatureTimestampService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    createSignatureDto: CreateSignatureDto,
    authenticatedUserId: string,
  ): Promise<Signature> {
    return this.persistSignature(
      createSignatureDto,
      authenticatedUserId,
      authenticatedUserId,
    );
  }

  async replaceDocumentSignatures(input: {
    document_id: string;
    document_type: string;
    company_id?: string;
    authenticated_user_id: string;
    signatures: SignatureWriteInput[];
  }): Promise<Signature[]> {
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

    // HMAC-SHA256: assinatura com PIN derivado por PBKDF2
    if (payload.type === 'hmac') {
      if (!payload.pin) {
        throw new BadRequestException('PIN obrigatório para assinatura HMAC.');
      }
      const hmacKey = await this.usersService.deriveHmacKey(
        signerUserId,
        payload.pin,
      );
      const timestamp = new Date().toISOString();
      const message = [
        payload.document_id,
        payload.document_type,
        signerUserId,
        timestamp,
      ].join('|');
      const hmacHex = this.usersService.computeHmac(hmacKey, message);
      // Sobrescreve signature_data com o HMAC (não há imagem neste tipo)
      payload = {
        ...payload,
        signature_data: hmacHex,
        pin: undefined,
      };
    }

    const generatedStamp = this.signatureTimestampService.issueFromRaw(
      payload.signature_data,
    );
    const signedAt = new Date(generatedStamp.timestamp_issued_at);
    const registryContext =
      await this.documentGovernanceService.findRegistryContextForSignature(
        payload.document_id,
        payload.document_type,
        payload.company_id || tenantId || null,
      );
    const signatureRepository =
      manager?.getRepository(Signature) ?? this.signaturesRepository;
    const signature = signatureRepository.create({
      document_id: payload.document_id,
      document_type: payload.document_type,
      signature_data: payload.signature_data,
      type: payload.type,
      user_id: signerUserId,
      company_id: payload.company_id || tenantId,
      signature_hash: payload.signature_hash || generatedStamp.signature_hash,
      timestamp_token:
        payload.timestamp_token || generatedStamp.timestamp_token,
      timestamp_authority:
        payload.timestamp_authority || generatedStamp.timestamp_authority,
      signed_at: signedAt,
      integrity_payload: {
        document_id: payload.document_id,
        document_type: payload.document_type,
        user_id: signerUserId,
        captured_by_user_id:
          authenticatedUserId !== signerUserId
            ? authenticatedUserId
            : undefined,
        type: payload.type,
        signed_at: signedAt.toISOString(),
        hmac_verified: payload.type === 'hmac' ? true : undefined,
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
    return signatureRepository.save(signature);
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

    return {
      id: signature.id,
      valid,
      signed_at: signature.signed_at?.toISOString(),
      timestamp_authority: signature.timestamp_authority,
      signature_hash: signature.signature_hash,
    };
  }

  async verifyByHashPublic(signatureHash: string): Promise<{
    valid: boolean;
    message?: string;
    signature?: {
      hash: string;
      signed_at?: string;
      timestamp_authority?: string;
      document_id?: string;
      document_type?: string;
      type?: string;
    };
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

    const valid = Boolean(
      signature.signature_hash &&
      signature.timestamp_token &&
      this.signatureTimestampService.verify(
        signature.signature_hash,
        signature.timestamp_token,
      ),
    );

    return {
      valid,
      message: valid
        ? 'Assinatura validada com sucesso.'
        : 'Assinatura localizada, mas inválida.',
      signature: {
        hash: signature.signature_hash as string,
        signed_at: signature.signed_at?.toISOString(),
        timestamp_authority: signature.timestamp_authority,
        document_id: signature.document_id,
        document_type: signature.document_type,
        type: signature.type,
      },
    };
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
