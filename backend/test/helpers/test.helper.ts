import { Repository, ObjectLiteral } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import { Company } from '../../src/companies/entities/company.entity';
import { Site } from '../../src/sites/entities/site.entity';
import { Profile } from '../../src/profiles/entities/profile.entity';

export class TestHelper {
  static mockRepository<T extends ObjectLiteral = any>() {
    return {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      create: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      remove: jest.fn(),
    } as unknown as Repository<T>;
  }

  static mockUser(): User {
    return {
      id: 'uuid-123',
      nome: 'Test User',
      cpf: '12345678900',
      email: 'test@example.com',
      funcao: 'User',
      company_id: 'company-123',
      profile_id: 'profile-123',
      site_id: 'site-123',
      status: true,
      company: {} as Company,
      site: {} as Site,
      profile: {} as Profile,
      created_at: new Date(),
      updated_at: new Date(),
    } as User;
  }
}
