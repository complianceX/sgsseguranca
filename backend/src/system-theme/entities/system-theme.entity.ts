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

  @Column({ name: 'background_color', default: '#F4F7FB' })
  backgroundColor: string;

  @Column({ name: 'sidebar_color', default: '#0E1F33' })
  sidebarColor: string;

  @Column({ name: 'card_color', default: '#FFFFFF' })
  cardColor: string;

  @Column({ name: 'primary_color', default: '#2563EB' })
  primaryColor: string;

  @Column({ name: 'secondary_color', default: '#355372' })
  secondaryColor: string;

  @Column({ name: 'text_primary', default: '#102033' })
  textPrimary: string;

  @Column({ name: 'text_secondary', default: '#5A6C82' })
  textSecondary: string;

  @Column({ name: 'success_color', default: '#1E8A52' })
  successColor: string;

  @Column({ name: 'warning_color', default: '#B7791F' })
  warningColor: string;

  @Column({ name: 'danger_color', default: '#C43D3D' })
  dangerColor: string;

  @Column({ name: 'info_color', default: '#1B6F94' })
  infoColor: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
