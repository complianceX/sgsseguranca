import { CreateDateColumn, DeleteDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Mixin de auditoria para entidades TypeORM.
 *
 * Fornece as três colunas de ciclo de vida padrão reutilizadas na maioria
 * das entidades de negócio:
 * - `created_at` — preenchida automaticamente na inserção
 * - `updated_at` — atualizada automaticamente em cada save()
 * - `deleted_at` — usada por soft-delete (@DeleteDateColumn)
 *
 * Para usar, basta extender esta classe:
 * ```typescript
 * @Entity('minhas_entidades')
 * export class MinhaEntidade extends BaseAuditEntity {
 *   // ...
 * }
 * ```
 * Nenhuma migração é necessária — as colunas existentes permanecem inalteradas.
 */
export abstract class BaseAuditEntity {
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn({ nullable: true })
  deleted_at?: Date | null;
}
