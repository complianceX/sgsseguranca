import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { UsersService } from '../users/users.service';
import { Signature } from './entities/signature.entity';
import { CreateSignatureDto } from './dto/create-signature.dto';

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
    const tenantId = this.tenantService.getTenantId();

    // HMAC-SHA256: assinatura com PIN derivado por PBKDF2
    if (createSignatureDto.type === 'hmac') {
      if (!createSignatureDto.pin) {
        throw new BadRequestException('PIN obrigatório para assinatura HMAC.');
      }
      const hmacKey = await this.usersService.deriveHmacKey(
        authenticatedUserId,
        createSignatureDto.pin,
      );
      const timestamp = new Date().toISOString();
      const message = [
        createSignatureDto.document_id,
        createSignatureDto.document_type,
        authenticatedUserId,
        timestamp,
      ].join('|');
      const hmacHex = this.usersService.computeHmac(hmacKey, message);
      // Sobrescreve signature_data com o HMAC (não há imagem neste tipo)
      createSignatureDto = {
        ...createSignatureDto,
        signature_data: hmacHex,
        pin: undefined,
      };
    }

    const generatedStamp = this.signatureTimestampService.issueFromRaw(
      createSignatureDto.signature_data,
    );
    const signedAt = new Date(generatedStamp.timestamp_issued_at);
    const registryContext =
      await this.documentGovernanceService.findRegistryContextForSignature(
        createSignatureDto.document_id,
        createSignatureDto.document_type,
        createSignatureDto.company_id || tenantId || null,
      );
    const signature = this.signaturesRepository.create({
      document_id: createSignatureDto.document_id,
      document_type: createSignatureDto.document_type,
      signature_data: createSignatureDto.signature_data,
      type: createSignatureDto.type,
      user_id: authenticatedUserId,
      company_id: createSignatureDto.company_id || tenantId,
      signature_hash:
        createSignatureDto.signature_hash || generatedStamp.signature_hash,
      timestamp_token:
        createSignatureDto.timestamp_token || generatedStamp.timestamp_token,
      timestamp_authority:
        createSignatureDto.timestamp_authority ||
        generatedStamp.timestamp_authority,
      signed_at: signedAt,
      integrity_payload: {
        document_id: createSignatureDto.document_id,
        document_type: createSignatureDto.document_type,
        user_id: authenticatedUserId,
        type: createSignatureDto.type,
        signed_at: signedAt.toISOString(),
        hmac_verified: createSignatureDto.type === 'hmac' ? true : undefined,
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
    return this.signaturesRepository.save(signature);
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
