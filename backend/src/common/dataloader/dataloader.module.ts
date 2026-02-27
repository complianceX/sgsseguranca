import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../../profiles/entities/profile.entity';
import { User } from '../../users/entities/user.entity';
import { Company } from '../../companies/entities/company.entity';
import { ProfileDataLoader } from './profile.dataloader';
import { UserDataLoader } from './user.dataloader';
import { CompanyDataLoader } from './company.dataloader';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Profile, User, Company])],
  providers: [ProfileDataLoader, UserDataLoader, CompanyDataLoader],
  exports: [ProfileDataLoader, UserDataLoader, CompanyDataLoader],
})
export class DataLoaderModule {}
