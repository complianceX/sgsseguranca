import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  // SECURITY: worker não expõe porta HTTP — apenas processa filas
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  // sem app.listen() — não é um servidor HTTP
}

bootstrap();
