import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import type { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Profile } from './entities/profile.entity';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(Profile)
    private profilesRepository: Repository<Profile>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async create(createProfileDto: DeepPartial<Profile>): Promise<Profile> {
    const profile = this.profilesRepository.create(createProfileDto);
    const saved = await this.profilesRepository.save(profile);
    await this.cacheManager.del('profiles:all');
    return saved;
  }

  async findAll(): Promise<Profile[]> {
    const cached = await this.cacheManager.get<Profile[]>('profiles:all');
    if (cached) {
      return cached;
    }

    const profiles = await this.profilesRepository.find();

    // Cache por 24 horas (perfis mudam muito raramente)
    await this.cacheManager.set('profiles:all', profiles, 24 * 60 * 60 * 1000);

    return profiles;
  }

  async findOne(id: string): Promise<Profile> {
    const cached = await this.cacheManager.get<Profile>(`profile:${id}`);
    if (cached) {
      return cached;
    }

    const profile = await this.profilesRepository.findOne({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Perfil com ID ${id} não encontrado`);
    }

    // Cache por 24 horas
    await this.cacheManager.set(`profile:${id}`, profile, 24 * 60 * 60 * 1000);

    return profile;
  }

  async findByName(nome: string): Promise<Profile | null> {
    // Cache por nome também
    const cached = await this.cacheManager.get<Profile>(`profile:name:${nome}`);
    if (cached) {
      return cached;
    }

    const profile = await this.profilesRepository.findOne({ where: { nome } });

    if (profile) {
      await this.cacheManager.set(
        `profile:name:${nome}`,
        profile,
        24 * 60 * 60 * 1000,
      );
    }

    return profile;
  }

  async update(
    id: string,
    updateProfileDto: DeepPartial<Profile>,
  ): Promise<Profile> {
    const profile = await this.findOne(id);
    Object.assign(profile, updateProfileDto);
    const saved = await this.profilesRepository.save(profile);

    // Invalidar caches
    await this.cacheManager.del('profiles:all');
    await this.cacheManager.del(`profile:${id}`);
    await this.cacheManager.del(`profile:name:${profile.nome}`);

    return saved;
  }

  async remove(id: string): Promise<void> {
    const profile = await this.findOne(id);
    await this.profilesRepository.remove(profile);

    // Invalidar caches
    await this.cacheManager.del('profiles:all');
    await this.cacheManager.del(`profile:${id}`);
    await this.cacheManager.del(`profile:name:${profile.nome}`);
  }
}
