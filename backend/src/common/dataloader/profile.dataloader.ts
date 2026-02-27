import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import DataLoader from 'dataloader';
import { Profile } from '../../profiles/entities/profile.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProfileDataLoader {
  constructor(
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
  ) {}

  public readonly loader = new DataLoader<string, Profile>(
    async (ids: string[]) => {
      const profiles = await this.profileRepository.findBy({
        id: In(ids),
      });
      const profileMap = new Map(
        profiles.map((profile) => [profile.id, profile]),
      );
      return ids.map((id) => profileMap.get(id) as Profile);
    },
  );
}
