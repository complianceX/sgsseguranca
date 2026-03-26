import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('system_theme')
export class SystemTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'background_color', default: '#F5F5F4' })
  backgroundColor: string;

  @Column({ name: 'sidebar_color', default: '#2F2B28' })
  sidebarColor: string;

  @Column({ name: 'card_color', default: '#FFFFFF' })
  cardColor: string;

  @Column({ name: 'primary_color', default: '#4A443F' })
  primaryColor: string;

  @Column({ name: 'secondary_color', default: '#6C6661' })
  secondaryColor: string;

  @Column({ name: 'text_primary', default: '#2F2B28' })
  textPrimary: string;

  @Column({ name: 'text_secondary', default: '#66615B' })
  textSecondary: string;

  @Column({ name: 'success_color', default: '#18895B' })
  successColor: string;

  @Column({ name: 'warning_color', default: '#B9771E' })
  warningColor: string;

  @Column({ name: 'danger_color', default: '#C84A4A' })
  dangerColor: string;

  @Column({ name: 'info_color', default: '#6E6862' })
  infoColor: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
