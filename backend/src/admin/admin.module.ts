import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { CacheRefreshService } from './services/cache-refresh.service';
import { GDPRDeletionService } from './services/gdpr-deletion.service';
import { RLSValidationService } from './services/rls-validation.service';
import { DatabaseHealthService } from './services/database-health.service';

/**
 * Admin Module
 * Operações administrativas, compliance, e monitoring
 *
 * Exporta:
 * - Cache refresh management
 * - GDPR data deletion
 * - RLS validation & testing
 * - Database health monitoring
 *
 * Endpoints:
 * - POST /admin/cache/* - Cache management
 * - POST /admin/gdpr/* - Data deletion
 * - GET  /admin/security/* - Security checks
 * - GET  /admin/health/* - Health monitoring
 * - GET  /admin/summary/* - Compliance overview
 */

@Module({
  imports: [
    // TypeORM (for database access)
    // Module will use DataSource from main database
  ],
  controllers: [AdminController],
  providers: [
    CacheRefreshService,
    GDPRDeletionService,
    RLSValidationService,
    DatabaseHealthService,
  ],
  exports: [
    // Export services for use in other modules
    CacheRefreshService,
    GDPRDeletionService,
    RLSValidationService,
    DatabaseHealthService,
  ],
})
export class AdminModule {}
