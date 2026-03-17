import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rdo } from './entities/rdo.entity';
import { RdosController } from './rdos.controller';
import { RdosService } from './rdos.service';
import { MailModule } from '../mail/mail.module';
import { DocumentRegistryModule } from '../document-registry/document-registry.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rdo]),
    forwardRef(() => MailModule),
    DocumentRegistryModule,
  ],
  controllers: [RdosController],
  providers: [RdosService],
  exports: [RdosService],
})
export class RdosModule {}
