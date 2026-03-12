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

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

@Injectable()
export class SystemThemeService {
  private cachedTheme: SystemTheme | null = null;
  private cacheExpiresAt = 0;

  constructor(
    @InjectRepository(SystemTheme)
    private readonly repo: Repository<SystemTheme>,
  ) {}

  async getTheme(): Promise<SystemTheme> {
    const now = Date.now();
    if (this.cachedTheme && this.cacheExpiresAt > now) {
      return this.cachedTheme;
    }
    const theme = await this.repo.findOne({ where: {} });
    const result = theme ?? await this.repo.save(this.repo.create(DEFAULT_THEME));
    this.cachedTheme = result;
    this.cacheExpiresAt = now + CACHE_TTL_MS;
    return result;
  }

  async updateTheme(dto: UpdateSystemThemeDto): Promise<SystemTheme> {
    const theme = await this.getTheme();
    Object.assign(theme, dto);
    const saved = await this.repo.save(theme);
    this.cachedTheme = saved;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return saved;
  }

  async resetTheme(): Promise<SystemTheme> {
    const theme = await this.getTheme();
    Object.assign(theme, DEFAULT_THEME);
    const saved = await this.repo.save(theme);
    this.cachedTheme = saved;
    this.cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return saved;
  }
}
