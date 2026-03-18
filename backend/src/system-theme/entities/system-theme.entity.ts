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

  @Column({ name: 'background_color', default: '#EEF3F8' })
  backgroundColor: string;

  @Column({ name: 'sidebar_color', default: '#081523' })
  sidebarColor: string;

  @Column({ name: 'card_color', default: '#FFFFFF' })
  cardColor: string;

  @Column({ name: 'primary_color', default: '#1E5EFF' })
  primaryColor: string;

  @Column({ name: 'secondary_color', default: '#4D647B' })
  secondaryColor: string;

  @Column({ name: 'text_primary', default: '#11253B' })
  textPrimary: string;

  @Column({ name: 'text_secondary', default: '#66788B' })
  textSecondary: string;

  @Column({ name: 'success_color', default: '#18895B' })
  successColor: string;

  @Column({ name: 'warning_color', default: '#B9771E' })
  warningColor: string;

  @Column({ name: 'danger_color', default: '#C84A4A' })
  dangerColor: string;

  @Column({ name: 'info_color', default: '#0F738E' })
  infoColor: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
