import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { ArrsController } from './arrs.controller';
import { ArrsService } from './arrs.service';
import { Arr } from './entities/arr.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Arr]),
    CommonModule,
    forwardRef(() => AuthModule),
    DocumentRegistryModule,
  ],
  controllers: [ArrsController],
  providers: [ArrsService],
  exports: [ArrsService],
})
export class ArrsModule {}
