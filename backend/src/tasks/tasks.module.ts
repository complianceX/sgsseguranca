import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { BullModule } from '@nestjs/bullmq'; // TESTE: desabilitado
import { CleanupTask } from './cleanup.task';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    // BullModule.registerQueue({ name: 'sla-escalation' }), // TESTE
    CompaniesModule,
  ],
  providers: [/* CleanupTask */], // TESTE: desabilitado (depende de @InjectQueue)
})
export class TasksModule {}
