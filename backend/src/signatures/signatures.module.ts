import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignaturesService } from './signatures.service';
import { SignaturesController } from './signatures.controller';
import { Signature } from './entities/signature.entity';
import { CommonModule } from '../common/common.module';
import { PublicSignaturesController } from './public-signatures.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Signature]), CommonModule],
  controllers: [SignaturesController, PublicSignaturesController],
  providers: [SignaturesService],
  exports: [SignaturesService],
})
export class SignaturesModule {}
