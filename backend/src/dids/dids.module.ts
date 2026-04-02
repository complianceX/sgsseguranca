import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { DidsController } from './dids.controller';
import { DidsService } from './dids.service';
import { Did } from './entities/did.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Did]),
    CommonModule,
    forwardRef(() => AuthModule),
    DocumentRegistryModule,
  ],
  controllers: [DidsController],
  providers: [DidsService],
  exports: [DidsService],
})
export class DidsModule {}
