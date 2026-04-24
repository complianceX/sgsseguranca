import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const isRedisDisabled = /^true$/i.test(process.env.REDIS_DISABLED ?? '');

@Module({
  imports: [
    TerminusModule,
    HttpModule,
    TypeOrmModule,
    // Registro das filas consumidas nos health checks. O AppModule já registra
    // essas mesmas filas — o Bull deduplica pelo nome, então não há conflito.
    // Quando REDIS_DISABLED=true o registro é omitido e o HealthController
    // trata a ausência como `skipped` via @Optional().
    ...(isRedisDisabled
      ? []
      : [
          BullModule.registerQueue(
            { name: 'mail' },
            { name: 'pdf-generation' },
          ),
        ]),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
