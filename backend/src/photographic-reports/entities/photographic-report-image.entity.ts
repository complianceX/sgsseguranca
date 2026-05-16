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
import { PhotographicReportDay } from './photographic-report-day.entity';

@Entity('photographic_report_images')
@Index('IDX_photographic_report_images_report_order', [
  'report_id',
  'image_order',
])
export class PhotographicReportImage extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'uuid' })
  company_id: string;

  @ManyToOne(() => PhotographicReport, (report) => report.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: PhotographicReport;

  @Column({ type: 'uuid' })
  report_id: string;

  @ManyToOne(() => PhotographicReportDay, (day) => day.images, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'report_day_id' })
  reportDay?: PhotographicReportDay | null;

  @Column({ type: 'uuid', nullable: true })
  report_day_id: string | null;

  @Column({ type: 'text' })
  image_url: string;

  @Column({ type: 'integer', default: 1 })
  image_order: number;

  @Column({ type: 'text', nullable: true })
  manual_caption: string | null;

  @Column({ type: 'text', nullable: true })
  ai_title: string | null;

  @Column({ type: 'text', nullable: true })
  ai_description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  ai_positive_points: string[] | null;

  @Column({ type: 'text', nullable: true })
  ai_technical_assessment: string | null;

  @Column({ type: 'text', nullable: true })
  ai_condition_classification: string | null;

  @Column({ type: 'text', nullable: true })
  ai_recommendations: string[] | null;
}
