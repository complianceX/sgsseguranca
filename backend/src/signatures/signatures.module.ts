import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignaturesService } from './signatures.service';
import { SignaturesController } from './signatures.controller';
import { Signature } from './entities/signature.entity';
import { CommonModule } from '../common/common.module';
import { PublicSignaturesController } from './public-signatures.controller';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Signature]),
    CommonModule,
    DocumentRegistryModule,
    UsersModule,
  ],
  controllers: [SignaturesController, PublicSignaturesController],
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
