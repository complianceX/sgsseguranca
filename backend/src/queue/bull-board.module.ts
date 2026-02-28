import { Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

/**
 * Dashboard visual para monitorar filas BullMQ em produção.
 *
 * Acesso: GET /admin/queues
 * Protegido por Basic Auth via env vars:
 *   BULL_BOARD_USER (padrão: "admin")
 *   BULL_BOARD_PASS (obrigatório em produção)
 *
 * Exibe:
 *  - Fila "mail"          — envios de e-mail agendados
 *  - Fila "pdf-generation" — geração de relatórios PDF
 *
 * Permite: ver jobs pendentes, ativos, com falha; retry manual; limpar filas.
 */
@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'mail',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'mail-dlq',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'pdf-generation',
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: 'pdf-generation-dlq',
      adapter: BullMQAdapter,
    }),
  ],
})
export class BullBoardAppModule {}
