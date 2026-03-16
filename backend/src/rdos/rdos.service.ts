import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Rdo } from './entities/rdo.entity';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { MailService } from '../mail/mail.service';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['enviado'],
  enviado: ['aprovado', 'rascunho'],
  aprovado: [],
};

const CLIMA_LABEL: Record<string, string> = {
  ensolarado: 'Ensolarado ☀️',
  nublado: 'Nublado ☁️',
  chuvoso: 'Chuvoso 🌧️',
  parcialmente_nublado: 'Parcialmente Nublado 🌤️',
};

@Injectable()
export class RdosService {
  constructor(
    @InjectRepository(Rdo)
    private rdosRepository: Repository<Rdo>,
    private tenantService: TenantService,
    private mailService: MailService,
  ) {}

  private async generateNumero(companyId: string): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.rdosRepository.count({
      where: { company_id: companyId },
    });
    return `RDO-${yyyymm}-${String(count + 1).padStart(3, '0')}`;
  }

  async create(createRdoDto: CreateRdoDto): Promise<Rdo> {
    const companyId =
      createRdoDto.company_id ?? this.tenantService.getTenantId();
    const numero = await this.generateNumero(companyId!);
    const rdo = this.rdosRepository.create({
      ...createRdoDto,
      company_id: companyId,
      numero,
    });
    return this.rdosRepository.save(rdo);
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    site_id?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<OffsetPage<Rdo>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC')
      .addOrderBy('rdo.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.andWhere('rdo.company_id = :tenantId', { tenantId });
    }
    if (opts?.site_id) {
      qb.andWhere('rdo.site_id = :siteId', { siteId: opts.site_id });
    }
    if (opts?.status) {
      qb.andWhere('rdo.status = :status', { status: opts.status });
    }
    if (opts?.data_inicio) {
      qb.andWhere('rdo.data >= :dataInicio', { dataInicio: opts.data_inicio });
    }
    if (opts?.data_fim) {
      qb.andWhere('rdo.data <= :dataFim', { dataFim: opts.data_fim });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Rdo> {
    const tenantId = this.tenantService.getTenantId();
    const rdo = await this.rdosRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'responsavel', 'company'],
    });
    if (!rdo) {
      throw new NotFoundException(`RDO com ID ${id} não encontrado`);
    }
    return rdo;
  }

  async update(id: string, updateRdoDto: UpdateRdoDto): Promise<Rdo> {
    const rdo = await this.findOne(id);
    Object.assign(rdo, updateRdoDto);
    return this.rdosRepository.save(rdo);
  }

  async updateStatus(id: string, newStatus: string): Promise<Rdo> {
    const rdo = await this.findOne(id);
    const allowed = ALLOWED_STATUS_TRANSITIONS[rdo.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de "${rdo.status}" para "${newStatus}" não permitida`,
      );
    }
    rdo.status = newStatus;
    return this.rdosRepository.save(rdo);
  }

  async sign(
    id: string,
    body: {
      tipo: 'responsavel' | 'engenheiro';
      nome: string;
      cpf: string;
      hash: string;
      timestamp: string;
    },
  ): Promise<Rdo> {
    const rdo = await this.findOne(id);
    const sigData = JSON.stringify({
      nome: body.nome,
      cpf: body.cpf,
      hash: body.hash,
      timestamp: body.timestamp,
      signed_at: new Date().toISOString(),
    });
    if (body.tipo === 'responsavel') {
      rdo.assinatura_responsavel = sigData;
    } else {
      rdo.assinatura_engenheiro = sigData;
    }
    return this.rdosRepository.save(rdo);
  }

  async markPdfSaved(
    id: string,
    body: { filename: string },
  ): Promise<Rdo> {
    const rdo = await this.findOne(id);
    rdo.pdf_file_key = `rdos/${id}/${body.filename}`;
    rdo.pdf_folder_path = `rdos/${id}`;
    rdo.pdf_original_name = body.filename;
    return this.rdosRepository.save(rdo);
  }

  async sendEmail(id: string, to: string[]): Promise<void> {
    const rdo = await this.findOne(id);
    const dataFormatada = new Date(rdo.data).toLocaleDateString('pt-BR');
    const totalTrab = (rdo.mao_de_obra ?? []).reduce(
      (s, m) => s + (m.quantidade ?? 0),
      0,
    );
    const totalEquip = (rdo.equipamentos ?? []).length;
    const totalServicos = (rdo.servicos_executados ?? []).length;
    const totalOcorrencias = (rdo.ocorrencias ?? []).length;

    const climaManha = rdo.clima_manha ? CLIMA_LABEL[rdo.clima_manha] ?? rdo.clima_manha : '-';
    const climaTarde = rdo.clima_tarde ? CLIMA_LABEL[rdo.clima_tarde] ?? rdo.clima_tarde : '-';

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1e6b43,#0c2e1a);padding:28px 32px;color:white;">
          <div style="font-size:11px;letter-spacing:0.1em;opacity:0.7;text-transform:uppercase;margin-bottom:4px;">GST — Gestão de Segurança do Trabalho</div>
          <h1 style="margin:0;font-size:22px;font-weight:700;">Relatório Diário de Obra</h1>
          <div style="font-size:15px;opacity:0.85;margin-top:4px;">${rdo.numero} &nbsp;·&nbsp; ${dataFormatada}</div>
        </div>
        <div style="padding:28px 32px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b7280;">Obra/Setor</td><td style="padding:8px 0;font-weight:600;color:#111827;">${rdo.site?.nome ?? '-'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Responsável</td><td style="padding:8px 0;font-weight:600;color:#111827;">${rdo.responsavel?.nome ?? '-'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;"><span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;">${rdo.status.toUpperCase()}</span></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Clima manhã</td><td style="padding:8px 0;color:#111827;">${climaManha}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Clima tarde</td><td style="padding:8px 0;color:#111827;">${climaTarde}</td></tr>
            ${rdo.temperatura_min != null ? `<tr><td style="padding:8px 0;color:#6b7280;">Temperatura</td><td style="padding:8px 0;color:#111827;">${rdo.temperatura_min}°C — ${rdo.temperatura_max}°C</td></tr>` : ''}
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:#f0fdf4;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#166534;">${totalTrab}</div>
              <div style="font-size:12px;color:#4b7a5c;">Trabalhadores</div>
            </div>
            <div style="background:#eff6ff;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#1d4ed8;">${totalServicos}</div>
              <div style="font-size:12px;color:#3b5ec4;">Serviços exec.</div>
            </div>
            <div style="background:#fefce8;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#854d0e;">${totalEquip}</div>
              <div style="font-size:12px;color:#a16207;">Equipamentos</div>
            </div>
            <div style="background:#fdf4ff;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#7e22ce;">${totalOcorrencias}</div>
              <div style="font-size:12px;color:#6b21a8;">Ocorrências</div>
            </div>
          </div>
          ${rdo.houve_acidente ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px;color:#991b1b;font-weight:600;">⚠️ Acidente registrado neste RDO</div>' : ''}
          ${rdo.houve_paralisacao ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;color:#92400e;font-weight:600;">⏸️ Paralisação: ${rdo.motivo_paralisacao ?? 'sem motivo informado'}</div>` : ''}
          ${rdo.observacoes ? `<div style="margin-top:16px;"><div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Observações</div><div style="font-size:14px;color:#374151;line-height:1.6;">${rdo.observacoes}</div></div>` : ''}
        </div>
        <div style="padding:16px 32px;background:#f8fafc;text-align:center;font-size:11px;color:#9ca3af;">
          GST — Gestão de Segurança do Trabalho · Enviado automaticamente
        </div>
      </div>
    `;

    for (const email of to) {
      await this.mailService.sendMail(
        email,
        `RDO ${rdo.numero} — ${dataFormatada} · ${rdo.site?.nome ?? ''}`,
        `RDO ${rdo.numero} de ${dataFormatada}. Acesse o sistema para visualizar o documento completo.`,
        html,
        { companyId: rdo.company_id },
      );
    }
  }

  async listFiles(opts?: { year?: string; week?: string }): Promise<Rdo[]> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .where('rdo.pdf_file_key IS NOT NULL');

    if (tenantId) {
      qb.andWhere('rdo.company_id = :tenantId', { tenantId });
    }
    if (opts?.year) {
      qb.andWhere('EXTRACT(YEAR FROM rdo.data) = :year', { year: opts.year });
    }

    return qb.orderBy('rdo.data', 'DESC').getMany();
  }

  async remove(id: string): Promise<void> {
    const rdo = await this.findOne(id);
    await this.rdosRepository.remove(rdo);
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC');

    if (tenantId) {
      qb.where('rdo.company_id = :tenantId', { tenantId });
    }

    const rdos = await qb.getMany();

    const rows = rdos.map((r) => {
      const totalTrab = (r.mao_de_obra ?? []).reduce((s, m) => s + (m.quantidade ?? 0), 0);
      return {
        'Número': r.numero,
        'Data': new Date(r.data).toLocaleDateString('pt-BR'),
        'Obra/Setor': r.site?.nome ?? '',
        'Responsável': r.responsavel?.nome ?? '',
        'Status': r.status,
        'Total Trabalhadores': totalTrab,
        'Equipamentos': (r.equipamentos ?? []).length,
        'Materiais': (r.materiais_recebidos ?? []).length,
        'Serviços Exec.': (r.servicos_executados ?? []).length,
        'Ocorrências': (r.ocorrencias ?? []).length,
        'Clima Manhã': r.clima_manha ? CLIMA_LABEL[r.clima_manha] ?? r.clima_manha : '',
        'Clima Tarde': r.clima_tarde ? CLIMA_LABEL[r.clima_tarde] ?? r.clima_tarde : '',
        'Temp. Mín (°C)': r.temperatura_min ?? '',
        'Temp. Máx (°C)': r.temperatura_max ?? '',
        'Condição Terreno': r.condicao_terreno ?? '',
        'Houve Acidente': r.houve_acidente ? 'Sim' : 'Não',
        'Houve Paralisação': r.houve_paralisacao ? 'Sim' : 'Não',
        'Motivo Paralisação': r.motivo_paralisacao ?? '',
        'Tem PDF': r.pdf_file_key ? 'Sim' : 'Não',
        'Assinado Responsável': r.assinatura_responsavel ? 'Sim' : 'Não',
        'Assinado Engenheiro': r.assinatura_engenheiro ? 'Sim' : 'Não',
        'Observações': r.observacoes ?? '',
        'Programa Amanhã': r.programa_servicos_amanha ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RDOs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
}
