import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rdo } from './entities/rdo.entity';
import { RdosController } from './rdos.controller';
import { RdosService } from './rdos.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rdo]), forwardRef(() => MailModule)],
  controllers: [RdosController],
  providers: [RdosService],
  exports: [RdosService],
})
export class RdosModule {}
