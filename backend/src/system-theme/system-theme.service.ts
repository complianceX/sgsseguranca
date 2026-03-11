import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemTheme } from './entities/system-theme.entity';
import { UpdateSystemThemeDto } from './dto/update-system-theme.dto';

const DEFAULT_THEME: Omit<SystemTheme, 'id' | 'updatedAt'> = {
  backgroundColor: '#122318',
  sidebarColor: '#0b1710',
  cardColor: '#183224',
  primaryColor: '#22c55e',
  secondaryColor: '#16a34a',
  textPrimary: '#e2e8f0',
  textSecondary: '#b8c5d8',
  successColor: '#4ade80',
  warningColor: '#facc15',
  dangerColor: '#f87171',
  infoColor: '#60a5fa',
};

@Injectable()
export class SystemThemeService {
  constructor(
    @InjectRepository(SystemTheme)
    private readonly repo: Repository<SystemTheme>,
  ) {}

  async getTheme(): Promise<SystemTheme> {
    const theme = await this.repo.findOne({ where: {} });
    if (theme) return theme;
    return this.repo.save(this.repo.create(DEFAULT_THEME));
  }

  async updateTheme(dto: UpdateSystemThemeDto): Promise<SystemTheme> {
    const theme = await this.getTheme();
    Object.assign(theme, dto);
    return this.repo.save(theme);
  }

  async resetTheme(): Promise<SystemTheme> {
    const theme = await this.getTheme();
    Object.assign(theme, DEFAULT_THEME);
    return this.repo.save(theme);
  }
}
