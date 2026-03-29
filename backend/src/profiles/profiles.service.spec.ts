import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cache } from 'cache-manager';
import { ProfilesService } from './profiles.service';
import { Profile } from './entities/profile.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { TestHelper } from '../../test/helpers/test.helper';
import { RbacService } from '../rbac/rbac.service';

describe('ProfilesService', () => {
  let service: ProfilesService;
  let repo: jest.Mocked<Repository<Profile>>;
  let cacheManager: jest.Mocked<Cache>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: getRepositoryToken(Profile),
          useValue: TestHelper.mockRepository(),
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: RbacService,
          useValue: {
            invalidateUsersByProfileId: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    repo = module.get(getRepositoryToken(Profile));
    cacheManager = module.get(CACHE_MANAGER);
  });

  describe('findAll', () => {
    it('should return cached profiles', async () => {
      (cacheManager.get as jest.Mock).mockResolvedValue([{ id: 1 }]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect((repo.find as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('should cache results after fetching', async () => {
      (cacheManager.get as jest.Mock).mockResolvedValue(null);
      (repo.find as jest.Mock).mockResolvedValue([{ id: 1 }]);
      await service.findAll();
      expect((cacheManager.set as jest.Mock).mock.calls).toHaveLength(1);
    });
  });
});
