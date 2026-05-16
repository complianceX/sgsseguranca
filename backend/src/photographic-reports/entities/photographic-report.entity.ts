import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { PhotographicReportDay } from './photographic-report-day.entity';
import { PhotographicReportImage } from './photographic-report-image.entity';
import { PhotographicReportExport } from './photographic-report-export.entity';

export enum PhotographicReportStatus {
  RASCUNHO = 'Rascunho',
  AGUARDANDO_FOTOS = 'Aguardando fotos',
  AGUARDANDO_ANALISE = 'Aguardando análise',
  ANALISADO = 'Analisado',
  EM_EDICAO = 'Em edição',
  FINALIZADO = 'Finalizado',
  EXPORTADO = 'Exportado',
  CANCELADO = 'Cancelado',
}

export enum PhotographicReportTone {
  POSITIVO = 'Positivo',
  TECNICO = 'Técnico',
  PREVENTIVO = 'Preventivo',
}

export enum PhotographicReportAreaStatus {
  LOJA_ABERTA = 'Loja aberta',
  LOJA_FECHADA = 'Loja fechada',
  AREA_CONTROLADA = 'Área controlada',
  AREA_ISOLADA = 'Área isolada',
}

export enum PhotographicReportShift {
  DIURNO = 'Diurno',
  NOTURNO = 'Noturno',
  INTEGRAL = 'Integral',
}

@Entity('photographic_reports')
@Index('IDX_photographic_reports_company_created', ['company_id', 'created_at'])
@Index('IDX_photographic_reports_company_status', ['company_id', 'status'])
export class PhotographicReport extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  client_id: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  project_id: string | null;

  @Column({ type: 'varchar', length: 160 })
  client_name: string;

  @Column({ type: 'varchar', length: 160 })
  project_name: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  unit_name: string | null;

  @Column({ type: 'varchar', length: 220, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 120 })
  activity_type: string;

  @Column({
    type: 'enum',
    enum: PhotographicReportTone,
    default: PhotographicReportTone.POSITIVO,
  })
  report_tone: PhotographicReportTone;

  @Column({
    type: 'enum',
    enum: PhotographicReportAreaStatus,
    default: PhotographicReportAreaStatus.LOJA_ABERTA,
  })
  area_status: PhotographicReportAreaStatus;

  @Column({
    type: 'enum',
    enum: PhotographicReportShift,
    default: PhotographicReportShift.DIURNO,
  })
  shift: PhotographicReportShift;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'date', nullable: true })
  end_date: string | null;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'varchar', length: 160 })
  responsible_name: string;

  @Column({ type: 'varchar', length: 180 })
  contractor_company: string;

  @Column({ type: 'text', nullable: true })
  general_observations: string | null;

  @Column({ type: 'text', nullable: true })
  ai_summary: string | null;

  @Column({ type: 'text', nullable: true })
  final_conclusion: string | null;

  @Column({
    type: 'enum',
    enum: PhotographicReportStatus,
    default: PhotographicReportStatus.RASCUNHO,
  })
  status: PhotographicReportStatus;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @OneToMany(() => PhotographicReportDay, (day) => day.report, {
    cascade: true,
  })
  days?: PhotographicReportDay[];

  @OneToMany(() => PhotographicReportImage, (image) => image.report, {
    cascade: true,
  })
  images?: PhotographicReportImage[];

  @OneToMany(
    () => PhotographicReportExport,
    (exportItem) => exportItem.report,
    {
      cascade: true,
    },
  )
  exports?: PhotographicReportExport[];
}
