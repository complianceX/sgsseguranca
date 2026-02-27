import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import DataLoader from 'dataloader';
import { User } from '../../users/entities/user.entity';

@Injectable({ scope: Scope.REQUEST })
export class UserDataLoader {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  public readonly loader = new DataLoader<string, User>(
    async (ids: string[]) => {
      const users = await this.userRepository.findBy({
        id: In(ids),
      });
      const userMap = new Map(users.map((user) => [user.id, user]));
      return ids.map((id) => userMap.get(id) as User);
    },
  );
}
