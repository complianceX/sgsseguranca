import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '../../common/entities/base-audit.entity';
import { Company } from '../../companies/entities/company.entity';
import { PhotographicReport } from './photographic-report.entity';

export enum PhotographicReportExportType {
  WORD = 'word',
  PDF = 'pdf',
}

@Entity('photographic_report_exports')
@Index('IDX_photographic_report_exports_report_type', [
  'report_id',
  'export_type',
])
export class PhotographicReportExport extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => PhotographicReport, (report) => report.exports, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: PhotographicReport;

  @Column({ type: 'uuid' })
  report_id: string;

  @Column({ type: 'enum', enum: PhotographicReportExportType })
  export_type: PhotographicReportExportType;

  @Column({ type: 'text' })
  file_url: string;

  @Column({ type: 'uuid', nullable: true })
  generated_by: string | null;

  @Column({ type: 'timestamp' })
  generated_at: Date;
}
