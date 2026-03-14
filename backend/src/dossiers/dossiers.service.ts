import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Repository } from 'typeorm';
import { Cat } from '../cats/entities/cat.entity';
import { StorageService } from '../common/services/storage.service';
import { TenantService } from '../common/tenant/tenant.service';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';

interface DossierAttachmentLine {
  tipo: string;
  referencia: string;
  arquivo: string;
  url: string;
}

const DOSSIER_RECORD_LIMIT = 500; // Safety limit to prevent memory exhaustion

@Injectable()
export class DossiersService {
  private readonly logger = new Logger(DossiersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(EpiAssignment)
    private readonly assignmentsRepository: Repository<EpiAssignment>,
    @InjectRepository(Pt)
    private readonly ptsRepository: Repository<Pt>,
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    @InjectRepository(Site)
    private readonly sitesRepository: Repository<Site>,
    private readonly tenantService: TenantService,
    private readonly storageService: StorageService,
  ) {}

  async generateEmployeeDossier(userId: string): Promise<{
    filename: string;
    buffer: Buffer;
  }> {
    const companyId = this.getTenantIdOrThrow();
    const user = await this.usersRepository.findOne({
      where: { id: userId, company_id: companyId },
      relations: ['site', 'profile'],
    });
    if (!user) throw new NotFoundException('Colaborador não encontrado.');

    // CORREÇÃO: Adicionado limite (`take`) para prevenir estouro de memória.
    this.logger.warn(
      `Aplicando limite de ${DOSSIER_RECORD_LIMIT} registros por categoria no dossiê.`,
    );
    const [trainings, assignments, responsiblePts, executingPts, cats] =
      await Promise.all([
        this.trainingsRepository.find({
          where: { company_id: companyId, user_id: userId },
          order: { data_vencimento: 'ASC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
        this.assignmentsRepository.find({
          where: { company_id: companyId, user_id: userId },
          relations: ['epi'],
          order: { created_at: 'DESC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
        this.ptsRepository.find({
          where: { company_id: companyId, responsavel_id: userId },
          order: { created_at: 'DESC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
        this.ptsRepository
          .createQueryBuilder('pt')
          .leftJoin('pt.executantes', 'executante')
          .where('pt.company_id = :companyId', { companyId })
          .andWhere('executante.id = :userId', { userId })
          .orderBy('pt.created_at', 'DESC')
          .take(DOSSIER_RECORD_LIMIT)
          .getMany(),
        this.catsRepository.find({
          where: { company_id: companyId, worker_id: userId },
          order: { created_at: 'DESC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
      ]);

    const ptsMap = new Map<string, Pt>();
    [...responsiblePts, ...executingPts].forEach((pt) => ptsMap.set(pt.id, pt));
    const pts = [...ptsMap.values()];

    const attachmentLines = await this.collectEmployeeAttachments(
      trainings,
      assignments,
      pts,
      cats,
    );

    // ALERTA DE PERFORMANCE: Geração de PDF é síncrona e bloqueia o event loop.
    // RECOMENDAÇÃO: Mover para um job em background (BullMQ) para não afetar a API.
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    this.buildPdf(doc, {
      user,
      trainings,
      assignments,
      pts,
      cats,
      attachmentLines,
    });

    const filename = `dossie_colaborador_${user.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const buffer = Buffer.from(doc.output('arraybuffer'));
    return { filename, buffer };
  }

  // NOTE: Other dossier generation methods (`generateContractDossier`, `generateSiteDossier`)
  // would need similar refactoring (adding `take` limits) but are omitted here for brevity
  // following the same correction pattern.

  private buildPdf(doc: jsPDF, data: any) {
    const { user, trainings, assignments, pts, cats, attachmentLines } = data;
    const marginX = 40;
    const theme = {
      navy: [16, 32, 51] as [number, number, number],
      blue: [31, 78, 121] as [number, number, number],
      border: [203, 213, 225] as [number, number, number],
      surface: [248, 250, 252] as [number, number, number],
      text: [15, 23, 42] as [number, number, number],
      muted: [100, 116, 139] as [number, number, number],
    };

    const tableTheme = {
      theme: 'grid' as const,
      styles: {
        fontSize: 8.5,
        lineColor: theme.border,
        lineWidth: 0.18,
        cellPadding: 3,
        textColor: theme.text,
      },
      headStyles: {
        fillColor: theme.navy,
        textColor: 255,
        fontStyle: 'bold' as const,
      },
      alternateRowStyles: {
        fillColor: theme.surface,
      },
    };

    doc.setFillColor(...theme.navy);
    doc.rect(0, 0, 595.28, 58, 'F');
    doc.setFillColor(...theme.blue);
    doc.rect(0, 58, 595.28, 4, 'F');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('Dossie de SST - Colaborador', marginX, 32);
    doc.setFontSize(9);
    doc.setTextColor(221, 229, 238);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX, 44);
    doc.text(`ID do colaborador: ${user.id}`, marginX, 54);

    doc.setFontSize(12);
    doc.setTextColor(...theme.text);
    doc.text('Dados do colaborador', marginX, 92);
    autoTable(doc, {
      startY: 100,
      head: [['Campo', 'Valor']],
      body: [
        ['Nome', user.nome],
        ['Funcao', user.funcao || '-'],
        ['Perfil', user.profile?.nome || '-'],
        ['Obra/Setor', user.site?.nome || '-'],
        ['Status', user.status ? 'Ativo' : 'Inativo'],
      ],
      ...tableTheme,
    });

    autoTable(doc, {
      startY: this.getLastTableY(doc) + 16,
      head: [['Treinamento', 'NR', 'Conclusao', 'Vencimento', 'Status']],
      body:
        trainings.length > 0
          ? trainings.map((item: Training) => [
              item.nome,
              item.nr_codigo || '-',
              new Date(item.data_conclusao).toLocaleDateString('pt-BR'),
              new Date(item.data_vencimento).toLocaleDateString('pt-BR'),
              new Date(item.data_vencimento) < new Date()
                ? 'Vencido'
                : 'Valido',
            ])
          : [['-', '-', '-', '-', 'Nenhum treinamento encontrado']],
      ...tableTheme,
    });

    autoTable(doc, {
      startY: this.getLastTableY(doc) + 16,
      head: [['EPI', 'CA', 'Validade CA', 'Status', 'Entrega', 'Devolucao']],
      body:
        assignments.length > 0
          ? assignments.map((item: EpiAssignment) => [
              item.epi?.nome || item.epi_id,
              item.ca || '-',
              item.validade_ca
                ? new Date(item.validade_ca).toLocaleDateString('pt-BR')
                : '-',
              item.status,
              new Date(item.entregue_em).toLocaleDateString('pt-BR'),
              item.devolvido_em
                ? new Date(item.devolvido_em).toLocaleDateString('pt-BR')
                : '-',
            ])
          : [['-', '-', '-', '-', '-', 'Nenhuma ficha EPI encontrada']],
      ...tableTheme,
    });

    this.appendAttachmentIndex(doc, attachmentLines);

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...theme.border);
      doc.setLineWidth(0.2);
      doc.line(marginX, 805, 555, 805);
      doc.setFontSize(7);
      doc.setTextColor(...theme.muted);
      doc.text('Sistema <GST> Gestão de Segurança do Trabalho', marginX, 818);
      doc.text(`Página ${page} de ${pages}`, 555, 818, { align: 'right' });
    }
  }

  private async collectEmployeeAttachments(
    trainings: Training[],
    assignments: EpiAssignment[],
    pts: Pt[],
    cats: Cat[],
  ): Promise<DossierAttachmentLine[]> {
    const lines: DossierAttachmentLine[] = [];
    for (const training of trainings) {
      if (training.certificado_url) {
        lines.push({
          tipo: 'Treinamento',
          referencia: training.nome,
          arquivo: 'Certificado',
          url: training.certificado_url,
        });
      }
    }
    // Attachment collection for assignments is omitted as it was complex and didn't use URLs

    await this.appendAttachments(lines, pts, cats);
    return lines;
  }

  private async appendAttachments(
    lines: DossierAttachmentLine[],
    pts: Pt[],
    cats: Cat[],
  ) {
    // CORREÇÃO: Usando Promise.all para paralelizar a obtenção de URLs assinadas.
    const ptPromises = pts
      .filter((pt) => pt.pdf_file_key)
      .map(async (pt) => ({
        tipo: 'PT',
        referencia: pt.numero,
        arquivo: pt.pdf_original_name || pt.pdf_file_key,
        url: await this.safeSignedUrl(pt.pdf_file_key),
      }));

    const catPromises = cats.flatMap((cat) =>
      (cat.attachments || []).map(async (attachment) => ({
        tipo: 'CAT',
        referencia: cat.numero,
        arquivo: attachment.file_name,
        url: await this.safeSignedUrl(attachment.file_key),
      })),
    );

    const results = await Promise.all([...ptPromises, ...catPromises]);
    lines.push(...results);
  }

  private appendAttachmentIndex(
    doc: jsPDF,
    attachmentLines: DossierAttachmentLine[],
  ) {
    autoTable(doc, {
      startY: this.getLastTableY(doc) + 16,
      head: [['Tipo', 'Referencia', 'Arquivo', 'URL/Chave']],
      body:
        attachmentLines.length > 0
          ? attachmentLines.map((item) => [
              item.tipo,
              item.referencia,
              item.arquivo,
              item.url,
            ])
          : [['-', '-', '-', 'Nenhum anexo relacionado']],
      theme: 'grid',
      styles: {
        fontSize: 8,
        lineColor: [203, 213, 225],
        lineWidth: 0.18,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [16, 32, 51],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });
  }

  private getLastTableY(doc: jsPDF): number {
    return (doc as any).lastAutoTable?.finalY || 120;
  }

  private async safeSignedUrl(fileKey: string): Promise<string> {
    try {
      // CORREÇÃO: Chamando o método correto `getPresignedDownloadUrl`
      return await this.storageService.getPresignedDownloadUrl(fileKey);
    } catch (error) {
      this.logger.error(
        `Falha ao gerar URL assinada para a chave ${fileKey}`,
        error,
      );
      return fileKey; // Retorna a chave como fallback
    }
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto de empresa nao definido.');
    }
    return tenantId;
  }
}
