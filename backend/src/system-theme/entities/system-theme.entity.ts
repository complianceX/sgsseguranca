import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('system_theme')
export class SystemTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'background_color', default: '#f4f7fa' })
  backgroundColor: string;

  @Column({ name: 'sidebar_color', default: '#0d3d1f' })
  sidebarColor: string;

  @Column({ name: 'card_color', default: '#ffffff' })
  cardColor: string;

  @Column({ name: 'primary_color', default: '#16a34a' })
  primaryColor: string;

  @Column({ name: 'secondary_color', default: '#0052b4' })
  secondaryColor: string;

  @Column({ name: 'text_primary', default: '#101828' })
  textPrimary: string;

  @Column({ name: 'text_secondary', default: '#344054' })
  textSecondary: string;

  @Column({ name: 'success_color', default: '#15803d' })
  successColor: string;

  @Column({ name: 'warning_color', default: '#d97706' })
  warningColor: string;

  @Column({ name: 'danger_color', default: '#d92d20' })
  dangerColor: string;

  @Column({ name: 'info_color', default: '#0369a1' })
  infoColor: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
