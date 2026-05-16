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
import { PhotographicReport } from './photographic-report.entity';
import { PhotographicReportImage } from './photographic-report-image.entity';

@Entity('photographic_report_days')
@Index('IDX_photographic_report_days_report_date', [
  'report_id',
  'activity_date',
])
export class PhotographicReportDay extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => PhotographicReport, (report) => report.days, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: PhotographicReport;

  @Column({ type: 'uuid' })
  report_id: string;

  @Column({ type: 'date' })
  activity_date: string;

  @Column({ type: 'text', nullable: true })
  day_summary: string | null;

  @OneToMany(() => PhotographicReportImage, (image) => image.reportDay)
  images?: PhotographicReportImage[];
}
