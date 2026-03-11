import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('system_theme')
export class SystemTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'background_color', default: '#122318' })
  backgroundColor: string;

  @Column({ name: 'sidebar_color', default: '#0b1710' })
  sidebarColor: string;

  @Column({ name: 'card_color', default: '#183224' })
  cardColor: string;

  @Column({ name: 'primary_color', default: '#22c55e' })
  primaryColor: string;

  @Column({ name: 'secondary_color', default: '#16a34a' })
  secondaryColor: string;

  @Column({ name: 'text_primary', default: '#e2e8f0' })
  textPrimary: string;

  @Column({ name: 'text_secondary', default: '#b8c5d8' })
  textSecondary: string;

  @Column({ name: 'success_color', default: '#4ade80' })
  successColor: string;

  @Column({ name: 'warning_color', default: '#facc15' })
  warningColor: string;

  @Column({ name: 'danger_color', default: '#f87171' })
  dangerColor: string;

  @Column({ name: 'info_color', default: '#60a5fa' })
  infoColor: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
