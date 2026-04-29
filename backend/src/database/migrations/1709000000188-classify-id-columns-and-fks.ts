import { MigrationInterface, QueryRunner } from 'typeorm';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

type ForeignKeySpec = {
  tableName: string;
  columnName: string;
  constraintName: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL';
};

type ColumnCommentSpec = {
  tableName: string;
  columnName: string;
  comment: string;
};

type IndexSpec = {
  tableName: string;
  indexName: string;
  columns: string[];
  where?: string;
};

const DOCUMENT_VIDEO_RLS_CONDITION = `(
  (company_id)::text = (current_company())::text
  OR is_super_admin() = true
)`;

const COLUMN_COMMENTS: ColumnCommentSpec[] = [
  {
    tableName: 'ai_interactions',
    columnName: 'tenant_id',
    comment:
      '[H07:legacy_mirror] Legacy varchar tenant id kept for dual-write compatibility; tenant_uuid is the canonical relational company reference.',
  },
  {
    tableName: 'ai_interactions',
    columnName: 'user_id',
    comment:
      '[H07:legacy_actor_ref] Legacy actor id may contain system markers; user_uuid/user_ref_status carry the canonical classified reference.',
  },
  {
    tableName: 'apr_logs',
    columnName: 'usuario_id',
    comment: '[H07:real_fk] Optional APR log actor; references users(id).',
  },
  {
    tableName: 'apr_risk_evidences',
    columnName: 'device_id',
    comment:
      '[H07:external_ref] Client device identifier supplied by capture/upload flow; not a database entity.',
  },
  {
    tableName: 'audit_logs',
    columnName: 'entity_id',
    comment:
      '[H07:polymorphic_ref] Audit target identifier paired with entity_type; may contain UUIDs or domain labels.',
  },
  {
    tableName: 'audit_logs',
    columnName: 'user_id',
    comment:
      '[H07:actor_ref] Actor identifier may contain users(id) values or system actors such as scheduled/security jobs.',
  },
  {
    tableName: 'corrective_actions',
    columnName: 'source_id',
    comment:
      '[H07:polymorphic_ref] Optional source identifier paired with source_type; manual actions have no parent row.',
  },
  {
    tableName: 'dashboard_document_availability_snapshots',
    columnName: 'attachment_id',
    comment:
      '[H07:external_ref] Attachment identifier from JSON/storage payloads; not a standalone relational table.',
  },
  {
    tableName: 'dashboard_document_availability_snapshots',
    columnName: 'document_id',
    comment:
      '[H07:polymorphic_ref] Source document/entity id selected by snapshot_kind/module; can point to registry, CAT, or nonconformity sources.',
  },
  {
    tableName: 'dashboard_document_availability_snapshots',
    columnName: 'site_id',
    comment:
      '[H07:real_fk] Optional site scope for dashboard document availability snapshots; references sites(id).',
  },
  {
    tableName: 'disaster_recovery_executions',
    columnName: 'requested_by_user_id',
    comment:
      '[H07:operator_ref] Nullable operational actor field; kept as varchar because DR jobs may be system-triggered outside user lifecycle.',
  },
  {
    tableName: 'document_download_grants',
    columnName: 'company_id',
    comment:
      '[H07:real_fk] Download grant tenant boundary; references companies(id).',
  },
  {
    tableName: 'document_download_grants',
    columnName: 'issued_for_user_id',
    comment:
      '[H07:real_fk] Optional user for whom the governed download token was issued; references users(id).',
  },
  {
    tableName: 'document_imports',
    columnName: 'processing_job_id',
    comment:
      '[H07:external_ref] BullMQ/document-processing job id; not a database table reference.',
  },
  {
    tableName: 'document_registry',
    columnName: 'entity_id',
    comment:
      '[H07:polymorphic_ref] Governed document source id paired with module/document_type.',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'company_id',
    comment:
      '[H07:real_fk] Video attachment tenant boundary; references companies(id).',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'document_id',
    comment:
      '[H07:polymorphic_ref] Source document id paired with module/document_type; not a single parent table.',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'removed_by_id',
    comment:
      '[H07:real_fk] Optional user that removed the video attachment; references users(id).',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'uploaded_by_id',
    comment:
      '[H07:real_fk] Optional user that uploaded the video attachment; references users(id).',
  },
  {
    tableName: 'forensic_trail_events',
    columnName: 'company_id',
    comment:
      '[H07:real_fk] Nullable tenant reference for forensic events; null is reserved for global security events.',
  },
  {
    tableName: 'forensic_trail_events',
    columnName: 'entity_id',
    comment:
      '[H07:polymorphic_ref] Forensic event subject paired with module/event_type; can carry entity ids or security context values.',
  },
  {
    tableName: 'forensic_trail_events',
    columnName: 'request_id',
    comment:
      '[H07:correlation_id] Per-request correlation UUID for traceability; not a parent table.',
  },
  {
    tableName: 'forensic_trail_events',
    columnName: 'user_id',
    comment:
      '[H07:real_fk] Nullable user reference for authenticated forensic events; references users(id).',
  },
  {
    tableName: 'gdpr_deletion_requests',
    columnName: 'user_id',
    comment:
      '[H07:real_fk] Data subject for the LGPD deletion workflow; references users(id).',
  },
  {
    tableName: 'mail_logs',
    columnName: 'message_id',
    comment:
      '[H07:external_ref] Provider SMTP/message id used for delivery tracking; not a database entity.',
  },
  {
    tableName: 'public_validation_grants',
    columnName: 'company_id',
    comment:
      '[H07:real_fk] Public validation grant tenant boundary; references companies(id).',
  },
  {
    tableName: 'public_validation_grants',
    columnName: 'document_id',
    comment:
      '[H07:polymorphic_ref] Optional source document id from APR/DDS/RDO/registry and other governed modules.',
  },
  {
    tableName: 'signatures',
    columnName: 'document_id',
    comment:
      '[H07:polymorphic_ref] Signed document id paired with document_type across APR, DDS, checklist, RDO and other modules.',
  },
  {
    tableName: 'user_consents',
    columnName: 'company_id',
    comment: '[H07:real_fk] Consent tenant boundary; references companies(id).',
  },
  {
    tableName: 'user_consents',
    columnName: 'user_id',
    comment:
      '[H07:real_fk] Data subject that granted/revoked consent; references users(id).',
  },
  {
    tableName: 'user_mfa_credentials',
    columnName: 'company_id',
    comment:
      '[H07:real_fk] MFA credential tenant boundary; references companies(id).',
  },
  {
    tableName: 'user_mfa_recovery_codes',
    columnName: 'company_id',
    comment:
      '[H07:real_fk] MFA recovery-code tenant boundary; references companies(id).',
  },
  {
    tableName: 'users',
    columnName: 'auth_user_id',
    comment:
      '[H07:external_ref] External authentication provider id; intentionally not linked to an auth schema in Neon runtime.',
  },
];

const FOREIGN_KEYS: ForeignKeySpec[] = [
  {
    tableName: 'apr_logs',
    columnName: 'usuario_id',
    constraintName: 'FK_h07_apr_logs_usuario_id_users',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    tableName: 'dashboard_document_availability_snapshots',
    columnName: 'site_id',
    constraintName: 'FK_h07_dashboard_snapshots_site_id_sites',
    referencedTable: 'sites',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    tableName: 'document_download_grants',
    columnName: 'company_id',
    constraintName: 'FK_h07_document_download_grants_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    tableName: 'document_download_grants',
    columnName: 'issued_for_user_id',
    constraintName: 'FK_h07_document_download_grants_user',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    tableName: 'public_validation_grants',
    columnName: 'company_id',
    constraintName: 'FK_h07_public_validation_grants_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    tableName: 'user_consents',
    columnName: 'company_id',
    constraintName: 'FK_h07_user_consents_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    tableName: 'user_consents',
    columnName: 'user_id',
    constraintName: 'FK_h07_user_consents_user',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    tableName: 'user_mfa_credentials',
    columnName: 'company_id',
    constraintName: 'FK_h07_user_mfa_credentials_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    tableName: 'user_mfa_recovery_codes',
    columnName: 'company_id',
    constraintName: 'FK_h07_user_mfa_recovery_codes_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    tableName: 'gdpr_deletion_requests',
    columnName: 'user_id',
    constraintName: 'FK_h07_gdpr_deletion_requests_user',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'RESTRICT',
  },
  {
    tableName: 'forensic_trail_events',
    columnName: 'company_id',
    constraintName: 'FK_h07_forensic_trail_events_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    tableName: 'forensic_trail_events',
    columnName: 'user_id',
    constraintName: 'FK_h07_forensic_trail_events_user',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'company_id',
    constraintName: 'FK_h07_document_video_attachments_company',
    referencedTable: 'companies',
    referencedColumn: 'id',
    onDelete: 'CASCADE',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'uploaded_by_id',
    constraintName: 'FK_h07_document_video_attachments_uploaded_by',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
  {
    tableName: 'document_video_attachments',
    columnName: 'removed_by_id',
    constraintName: 'FK_h07_document_video_attachments_removed_by',
    referencedTable: 'users',
    referencedColumn: 'id',
    onDelete: 'SET NULL',
  },
];

const SUPPORTING_INDEXES: IndexSpec[] = [
  {
    tableName: 'dashboard_document_availability_snapshots',
    indexName: 'IDX_h07_dashboard_snapshots_site_id',
    columns: ['site_id'],
    where: 'site_id IS NOT NULL',
  },
  {
    tableName: 'document_download_grants',
    indexName: 'IDX_h07_document_download_grants_issued_for_user',
    columns: ['issued_for_user_id'],
    where: 'issued_for_user_id IS NOT NULL',
  },
  {
    tableName: 'user_mfa_credentials',
    indexName: 'IDX_h07_user_mfa_credentials_company_id',
    columns: ['company_id'],
  },
  {
    tableName: 'user_mfa_recovery_codes',
    indexName: 'IDX_h07_user_mfa_recovery_codes_company_id',
    columns: ['company_id'],
  },
  {
    tableName: 'forensic_trail_events',
    indexName: 'IDX_h07_forensic_trail_events_user_id',
    columns: ['user_id'],
    where: 'user_id IS NOT NULL',
  },
  {
    tableName: 'document_video_attachments',
    indexName: 'IDX_h07_document_video_attachments_uploaded_by',
    columns: ['uploaded_by_id'],
    where: 'uploaded_by_id IS NOT NULL',
  },
  {
    tableName: 'document_video_attachments',
    indexName: 'IDX_h07_document_video_attachments_removed_by',
    columns: ['removed_by_id'],
    where: 'removed_by_id IS NOT NULL',
  },
];

export class ClassifyIdColumnsAndFks1709000000188 implements MigrationInterface {
  name = 'ClassifyIdColumnsAndFks1709000000188';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.normalizeDocumentVideoAttachmentActorColumns(queryRunner);

    for (const index of SUPPORTING_INDEXES) {
      await this.createSupportingIndex(queryRunner, index);
    }

    for (const foreignKey of FOREIGN_KEYS) {
      await this.addForeignKey(queryRunner, foreignKey);
    }

    for (const column of COLUMN_COMMENTS) {
      await this.commentOnColumn(queryRunner, column);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const foreignKey of [...FOREIGN_KEYS].reverse()) {
      await this.dropForeignKey(queryRunner, foreignKey);
    }

    for (const index of [...SUPPORTING_INDEXES].reverse()) {
      await this.dropSupportingIndex(queryRunner, index);
    }

    await this.revertDocumentVideoAttachmentActorColumns(queryRunner);

    for (const column of COLUMN_COMMENTS) {
      await this.clearColumnComment(queryRunner, column);
    }
  }

  private async normalizeDocumentVideoAttachmentActorColumns(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (!(await queryRunner.hasTable('document_video_attachments'))) {
      return;
    }

    if (
      await this.columnIsType(
        queryRunner,
        'document_video_attachments',
        'company_id',
        'uuid',
      )
    ) {
      return;
    }

    if (!(await this.canManageTablePolicies(queryRunner))) {
      throw new Error(
        'Migration 1709000000188 requires ownership of document_video_attachments to update RLS-dependent column types.',
      );
    }

    await this.assertUuidCastable(queryRunner, {
      tableName: 'document_video_attachments',
      columnName: 'company_id',
    });
    await this.assertUuidCastable(queryRunner, {
      tableName: 'document_video_attachments',
      columnName: 'uploaded_by_id',
    });
    await this.assertUuidCastable(queryRunner, {
      tableName: 'document_video_attachments',
      columnName: 'removed_by_id',
    });

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_video_attachments"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_video_attachments"
        ALTER COLUMN "company_id" TYPE uuid USING NULLIF("company_id", '')::uuid,
        ALTER COLUMN "uploaded_by_id" TYPE uuid USING NULLIF("uploaded_by_id", '')::uuid,
        ALTER COLUMN "removed_by_id" TYPE uuid USING NULLIF("removed_by_id", '')::uuid
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "document_video_attachments"
      AS PERMISSIVE
      FOR ALL
      USING ${DOCUMENT_VIDEO_RLS_CONDITION}
      WITH CHECK ${DOCUMENT_VIDEO_RLS_CONDITION}
    `);
  }

  private async revertDocumentVideoAttachmentActorColumns(
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (!(await queryRunner.hasTable('document_video_attachments'))) {
      return;
    }

    if (
      await this.columnIsType(
        queryRunner,
        'document_video_attachments',
        'company_id',
        'character varying',
      )
    ) {
      return;
    }

    if (!(await this.canManageTablePolicies(queryRunner))) {
      throw new Error(
        'Migration 1709000000188 down requires ownership of document_video_attachments to update RLS-dependent column types.',
      );
    }

    await queryRunner.query(`
      DROP POLICY IF EXISTS "tenant_isolation_policy" ON "document_video_attachments"
    `);

    await queryRunner.query(`
      ALTER TABLE "document_video_attachments"
        ALTER COLUMN "company_id" TYPE varchar(120) USING "company_id"::text,
        ALTER COLUMN "uploaded_by_id" TYPE varchar(120) USING "uploaded_by_id"::text,
        ALTER COLUMN "removed_by_id" TYPE varchar(120) USING "removed_by_id"::text
    `);

    await queryRunner.query(`
      CREATE POLICY "tenant_isolation_policy"
      ON "document_video_attachments"
      AS PERMISSIVE
      FOR ALL
      USING ${DOCUMENT_VIDEO_RLS_CONDITION}
      WITH CHECK ${DOCUMENT_VIDEO_RLS_CONDITION}
    `);
  }

  private async createSupportingIndex(
    queryRunner: QueryRunner,
    spec: IndexSpec,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(spec.tableName))) {
      return;
    }

    for (const columnName of spec.columns) {
      if (!(await queryRunner.hasColumn(spec.tableName, columnName))) {
        return;
      }
    }

    if (await this.indexExists(queryRunner, spec.indexName)) {
      return;
    }

    const columns = spec.columns.map(quoteIdent).join(', ');
    const where = spec.where ? ` WHERE ${spec.where}` : '';
    await queryRunner.query(`
      CREATE INDEX ${quoteIdent(spec.indexName)}
      ON ${quoteIdent(spec.tableName)} (${columns})${where}
    `);
  }

  private async dropSupportingIndex(
    queryRunner: QueryRunner,
    spec: IndexSpec,
  ): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS ${quoteIdent(spec.indexName)}
    `);
  }

  private async addForeignKey(
    queryRunner: QueryRunner,
    spec: ForeignKeySpec,
  ): Promise<void> {
    if (
      !(await queryRunner.hasTable(spec.tableName)) ||
      !(await queryRunner.hasTable(spec.referencedTable)) ||
      !(await queryRunner.hasColumn(spec.tableName, spec.columnName)) ||
      !(await queryRunner.hasColumn(
        spec.referencedTable,
        spec.referencedColumn,
      ))
    ) {
      return;
    }

    if (await this.constraintExists(queryRunner, spec.constraintName)) {
      return;
    }

    await this.assertNoOrphans(queryRunner, spec);

    await queryRunner.query(`
      ALTER TABLE ${quoteIdent(spec.tableName)}
      ADD CONSTRAINT ${quoteIdent(spec.constraintName)}
      FOREIGN KEY (${quoteIdent(spec.columnName)})
      REFERENCES ${quoteIdent(spec.referencedTable)}(${quoteIdent(spec.referencedColumn)})
      ON DELETE ${spec.onDelete}
      NOT VALID
    `);

    await queryRunner.query(`
      ALTER TABLE ${quoteIdent(spec.tableName)}
      VALIDATE CONSTRAINT ${quoteIdent(spec.constraintName)}
    `);
  }

  private async dropForeignKey(
    queryRunner: QueryRunner,
    spec: ForeignKeySpec,
  ): Promise<void> {
    if (!(await queryRunner.hasTable(spec.tableName))) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE ${quoteIdent(spec.tableName)}
      DROP CONSTRAINT IF EXISTS ${quoteIdent(spec.constraintName)}
    `);
  }

  private async commentOnColumn(
    queryRunner: QueryRunner,
    spec: ColumnCommentSpec,
  ): Promise<void> {
    if (
      !(await queryRunner.hasTable(spec.tableName)) ||
      !(await queryRunner.hasColumn(spec.tableName, spec.columnName))
    ) {
      return;
    }

    await queryRunner.query(`
      COMMENT ON COLUMN ${quoteIdent(spec.tableName)}.${quoteIdent(spec.columnName)}
      IS ${quoteLiteral(spec.comment)}
    `);
  }

  private async clearColumnComment(
    queryRunner: QueryRunner,
    spec: ColumnCommentSpec,
  ): Promise<void> {
    if (
      !(await queryRunner.hasTable(spec.tableName)) ||
      !(await queryRunner.hasColumn(spec.tableName, spec.columnName))
    ) {
      return;
    }

    await queryRunner.query(`
      COMMENT ON COLUMN ${quoteIdent(spec.tableName)}.${quoteIdent(spec.columnName)}
      IS NULL
    `);
  }

  private async assertNoOrphans(
    queryRunner: QueryRunner,
    spec: ForeignKeySpec,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS orphan_count
      FROM ${quoteIdent(spec.tableName)} child
      LEFT JOIN ${quoteIdent(spec.referencedTable)} parent
        ON parent.${quoteIdent(spec.referencedColumn)} = child.${quoteIdent(spec.columnName)}
      WHERE child.${quoteIdent(spec.columnName)} IS NOT NULL
        AND parent.${quoteIdent(spec.referencedColumn)} IS NULL
    `)) as Array<{ orphan_count: number }>;

    const orphanCount = Number(rows[0]?.orphan_count || 0);
    if (orphanCount > 0) {
      throw new Error(
        `Cannot add ${spec.constraintName}: ${orphanCount} orphan rows found in ${spec.tableName}.${spec.columnName}.`,
      );
    }
  }

  private async assertUuidCastable(
    queryRunner: QueryRunner,
    input: { tableName: string; columnName: string },
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS invalid_count
      FROM ${quoteIdent(input.tableName)}
      WHERE ${quoteIdent(input.columnName)} IS NOT NULL
        AND NULLIF(${quoteIdent(input.columnName)}, '') IS NOT NULL
        AND NULLIF(${quoteIdent(input.columnName)}, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `)) as Array<{ invalid_count: number }>;

    const invalidCount = Number(rows[0]?.invalid_count || 0);
    if (invalidCount > 0) {
      throw new Error(
        `Cannot convert ${input.tableName}.${input.columnName} to uuid: ${invalidCount} invalid values found.`,
      );
    }
  }

  private async constraintExists(
    queryRunner: QueryRunner,
    constraintName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint
        WHERE conname = $1
        LIMIT 1
      `,
      [constraintName],
    )) as Array<unknown>;

    return rows.length > 0;
  }

  private async indexExists(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'i'
          AND n.nspname = current_schema()
          AND c.relname = $1
        LIMIT 1
      `,
      [indexName],
    )) as Array<unknown>;

    return rows.length > 0;
  }

  private async columnIsType(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    typeName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
          AND data_type = $3
        LIMIT 1
      `,
      [tableName, columnName, typeName],
    )) as Array<unknown>;

    return rows.length > 0;
  }

  private async canManageTablePolicies(
    queryRunner: QueryRunner,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT pg_has_role(current_user, c.relowner, 'MEMBER') AS can_manage
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname = 'document_video_attachments'
        LIMIT 1
      `,
    )) as Array<{ can_manage: boolean }>;

    return rows[0]?.can_manage === true;
  }
}
