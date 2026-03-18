import { BadRequestException, Injectable, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, Subject, concat, from, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';
import { SystemTheme } from './entities/system-theme.entity';
import { UpdateSystemThemeDto } from './dto/update-system-theme.dto';
import {
  DEFAULT_THEME,
  LEGACY_DARK_THEME,
  LEGACY_DEFAULT_THEME,
  SYSTEM_THEME_PRESETS,
  type SystemThemePresetId,
} from './system-theme.presets';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const THEME_STREAM_HEARTBEAT_MS = 25_000;

@Injectable()
export class SystemThemeService {
  private cachedTheme: SystemTheme | null = null;
  private cacheExpiresAt = 0;
  private readonly themeUpdates$ = new Subject<SystemTheme>();

  constructor(
    @InjectRepository(SystemTheme)
    private readonly repo: Repository<SystemTheme>,
  ) {}

  private updateCache(theme: SystemTheme, now = Date.now()): SystemTheme {
    this.cachedTheme = theme;
    this.cacheExpiresAt = now + CACHE_TTL_MS;
    return theme;
  }

  private emitThemeUpdate(theme: SystemTheme): void {
    this.themeUpdates$.next(theme);
  }

  private matchesTokens(
    theme: SystemTheme,
    tokens: UpdateSystemThemeDto,
  ): boolean {
    return Object.entries(tokens).every(([key, value]) => {
      return theme[key as keyof UpdateSystemThemeDto] === value;
    });
  }

  private async upgradeLegacyThemeIfNeeded(
    theme: SystemTheme,
  ): Promise<SystemTheme> {
    if (this.matchesTokens(theme, LEGACY_DEFAULT_THEME)) {
      Object.assign(theme, DEFAULT_THEME);
      return this.repo.save(theme);
    }

    if (this.matchesTokens(theme, LEGACY_DARK_THEME)) {
      Object.assign(theme, SYSTEM_THEME_PRESETS.dark.tokens);
      return this.repo.save(theme);
    }

    return theme;
  }

  private toThemeMessage(theme: SystemTheme): MessageEvent {
    return {
      type: 'theme',
      data: theme,
    };
  }

  getPresets() {
    return Object.values(SYSTEM_THEME_PRESETS);
  }

  async getTheme(): Promise<SystemTheme> {
    const now = Date.now();
    if (this.cachedTheme && this.cacheExpiresAt > now) {
      return this.cachedTheme;
    }

    const theme = await this.repo.findOne({ where: {} });

    if (theme) {
      const upgradedTheme = await this.upgradeLegacyThemeIfNeeded(theme);
      return this.updateCache(upgradedTheme, now);
    }

    const created = await this.repo.save(this.repo.create(DEFAULT_THEME));
    return this.updateCache(created, now);
  }

  async updateTheme(dto: UpdateSystemThemeDto): Promise<SystemTheme> {
    const theme = await this.getTheme();
    Object.assign(theme, dto);
    const saved = await this.repo.save(theme);
    this.updateCache(saved);
    this.emitThemeUpdate(saved);
    return saved;
  }

  async applyPreset(presetId: SystemThemePresetId): Promise<SystemTheme> {
    const preset = SYSTEM_THEME_PRESETS[presetId];

    if (!preset) {
      throw new BadRequestException(`Preset de tema invalido: ${presetId}`);
    }

    return this.updateTheme(preset.tokens);
  }

  async resetTheme(): Promise<SystemTheme> {
    const theme = await this.getTheme();
    Object.assign(theme, DEFAULT_THEME);
    const saved = await this.repo.save(theme);
    this.updateCache(saved);
    this.emitThemeUpdate(saved);
    return saved;
  }

  streamTheme(): Observable<MessageEvent> {
    const initialTheme$ = from(this.getTheme()).pipe(
      map((theme) => this.toThemeMessage(theme)),
    );
    const updates$ = this.themeUpdates$.pipe(
      map((theme) => this.toThemeMessage(theme)),
    );
    const heartbeat$ = interval(THEME_STREAM_HEARTBEAT_MS).pipe(
      map(
        () =>
          ({
            type: 'heartbeat',
            data: { timestamp: new Date().toISOString() },
          }) as MessageEvent,
      ),
    );

    return concat(initialTheme$, merge(updates$, heartbeat$));
  }
}
