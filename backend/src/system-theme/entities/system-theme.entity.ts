import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('system_theme')
export class SystemTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'background_color', default: '#f7f8fa' })
  backgroundColor: string;

  @Column({ name: 'sidebar_color', default: '#183a2c' })
  sidebarColor: string;

  @Column({ name: 'card_color', default: '#ffffff' })
  cardColor: string;

  @Column({ name: 'primary_color', default: '#1e6b43' })
  primaryColor: string;

  @Column({ name: 'secondary_color', default: '#274c77' })
  secondaryColor: string;

  @Column({ name: 'text_primary', default: '#111827' })
  textPrimary: string;

  @Column({ name: 'text_secondary', default: '#5f6b79' })
  textSecondary: string;

  @Column({ name: 'success_color', default: '#2e7d32' })
  successColor: string;

  @Column({ name: 'warning_color', default: '#b7791f' })
  warningColor: string;

  @Column({ name: 'danger_color', default: '#c0392b' })
  dangerColor: string;

  @Column({ name: 'info_color', default: '#3b6b93' })
  infoColor: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
