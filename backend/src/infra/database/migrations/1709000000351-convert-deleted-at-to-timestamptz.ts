import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * FASE 5 (M3) — `deleted_at` passa a ser TIMESTAMPTZ nas tabelas que ainda o
 * armazenavam como `timestamp without time zone`.
 *
 * ACHADO
 *   Auditoria de banco encontrou 247 colunas `timestamp without time zone`
 *   contra 79 `timestamp with time zone`. Entre elas, `deleted_at` — a coluna
 *   que dirige o cálculo de retenção/erasure da LGPD — permanecia naive em 27
 *   tabelas (34 contando as partições de `mail_logs`), enquanto
 *   `companies.deleted_at` já havia sido corrigido pela migration 317.
 *
 * QUAL É O FUSO REAL DOS DADOS (investigado no código, não assumido)
 *   `deleted_at` é preenchido exclusivamente por `@DeleteDateColumn()` via
 *   `BaseAuditEntity` (backend/src/shared/entities/base-audit.entity.ts) —
 *   nunca por input do usuário. O valor chega ao banco por dois caminhos,
 *   ambos verificados:
 *
 *   1. DEFAULT/CURRENT_TIMESTAMP do próprio Postgres (softDelete()/save() do
 *      TypeORM), cuja conversão para o tipo naive usa o `TimeZone` da SESSÃO;
 *   2. `new Date()` explícito em código de aplicação (ex.:
 *      `aprs-workflow.service.ts:211` `apr.aprovado_em = now`,
 *      `cats.service.ts:344/366` `cat.investigated_at = new Date()`), que o
 *      driver `pg` serializa via `dateToString()` usando o fuso LOCAL do
 *      processo Node (node_modules/pg/lib/utils.js:95) — não UTC por padrão
 *      (`defaults.parseInputDatesAsUTC` é `false` e o projeto não liga
 *      `useUTC` no DataSource, então o "PGTZ=UTC" que o TypeORM tentaria
 *      setar em PostgresDriver.js:230 nunca é aplicado).
 *
 *   Os dois caminhos só produzem o mesmo resultado (dígitos naive == relógio
 *   UTC) porque, neste projeto, NADA sobrescreve o fuso em nenhum dos dois
 *   lados:
 *     - `Dockerfile`/`Dockerfile.worker` (node:20-bullseye-slim) não setam
 *       `ENV TZ`, então o processo Node roda no fuso padrão UTC da imagem;
 *     - `app.module.ts` (TypeOrmModule.forRootAsync) não define `extra.options`
 *       com `-c timezone=...` nem qualquer `SET TIME ZONE`; a sessão herda o
 *       padrão do banco, que no Neon é UTC (comportamento documentado dos
 *       computes Neon e padrão de facto em Postgres gerenciado — RDS, Aurora,
 *       Cloud SQL — todos defaults para UTC).
 *
 *   PROVA EMPÍRICA DO RISCO (não é só teoria): o Postgres local de teste
 *   deste ambiente (Windows, instalação padrão) reporta `SHOW TimeZone` =
 *   'America/Cuiaba' — herdado do locale do SO, nada a ver com produção.
 *   Rodar `ALTER COLUMN ... TYPE TIMESTAMPTZ` SEM `USING` explícito neste
 *   ambiente teria deslocado todo naive-UTC em -4h, exatamente o bug que essa
 *   migration existe para não cometer. É por isso que a cláusula abaixo NUNCA
 *   depende do TimeZone de sessão de quem executa a migration.
 *
 * CLÁUSULA USING CORRETA
 *   `USING "deleted_at" AT TIME ZONE 'UTC'` — interpreta o valor naive como
 *   já sendo relógio de parede UTC (o que o código comprova que ele é) e
 *   produz o instante `timestamptz` correto, INDEPENDENTE do TimeZone da
 *   sessão que roda a migration. Um `ALTER ... TYPE TIMESTAMPTZ` sem USING
 *   (como a 317 fez) usa implicitamente o TimeZone de sessão no momento do
 *   ALTER — funcionou lá porque a sessão era UTC, mas é frágil: não repetir
 *   esse padrão aqui.
 *
 * ESCOPO — o que ENTRA e o que FICA DE FORA (com justificativa)
 *   ENTRA: apenas `deleted_at`, nas 27 tabelas abaixo (34 com as partições de
 *   `mail_logs`, que o Postgres propaga automaticamente a partir do ALTER no
 *   pai — confirmado empiricamente). É o maior valor para o menor raio de
 *   impacto: dirige retenção/erasure LGPD, tem proveniência 100% de sistema
 *   (nunca vem de formulário) e já tem precedente idêntico (companies/317).
 *
 *   FICA DE FORA (e por quê):
 *     - `created_at`/`updated_at`: mesma proveniência seria segura, mas
 *       `ai_interactions.created_at` e `mail_logs.created_at` SÃO A CHAVE DE
 *       PARTICIONAMENTO (RANGE). Testado neste ambiente:
 *       `ALTER TABLE mail_logs ALTER COLUMN created_at TYPE timestamptz...`
 *       falha com "não é possível alterar a coluna... porque faz parte da
 *       chave de partição". Convertê-las exige detach/reattach de partição —
 *       cirurgia maior, fora do raio desta migration. Para as tabelas NÃO
 *       particionadas, created_at/updated_at ficam para uma fase M4 dedicada
 *       (mesmo raciocínio de segurança, escopo menor por vez).
 *     - Campos de negócio digitados pelo usuário (`data_hora_inicio`,
 *       `data_hora_fim` de `pts`; `data_auditoria` de aprs/checklists/dds/
 *       pts/trainings/medical_exams; `data_conclusao`/`data_vencimento` de
 *       `trainings`): DTOs os validam com `@IsDateString()` e os mantêm como
 *       `string` (ex.: `create-pt.dto.ts:137-143`), sem `@Type(() => Date)`.
 *       O frontend usa `<input type="datetime-local">` para os campos de
 *       hora (`BasicInfoSection.tsx:174/190`, sem qualquer conversão antes do
 *       POST — `ptsService.ts` envia o valor cru). Uma string
 *       "2026-07-21T08:00" sem offset, para uma coluna `timestamp` (sem tz),
 *       é armazenada literalmente pelo Postgres — ou seja, o valor naive
 *       representa a hora de parede LOCAL do usuário (Brasil), não UTC.
 *       Aplicar `AT TIME ZONE 'UTC'` nesses campos deslocaria o horário
 *       incorretamente (ex.: 08:00 local viraria 08:00 UTC = 05:00 local).
 *       `trainings.data_vencimento` é a prova adicional de por que não
 *       converter apressadamente: é o único campo de negócio referenciado
 *       pela view materializada `company_dashboard_metrics` — confirma que
 *       tem semântica de "data calendário", não de instante, e merece uma
 *       decisão de produto (qual fuso assumir por empresa) antes de qualquer
 *       ALTER, não uma conversão silenciosa nesta migration.
 *     - `apr_risk_evidences.exif_datetime`: metadado EXIF da câmera do
 *       usuário, fora do controle da aplicação — não há garantia alguma de
 *       que o relógio do dispositivo esteja em UTC ou correto. Não converter.
 *
 * BLOQUEIOS TÉCNICOS TRATADOS (padrão das migrations 307/317)
 *   `pg_depend` mostrou que `aprs.deleted_at`, `nonconformities.deleted_at` e
 *   `pts.deleted_at` são referenciados pelas materialized views
 *   `apr_risk_rankings` e/ou `company_dashboard_metrics` — o ALTER falharia
 *   sem removê-las antes. `pg_policies` não encontrou nenhuma RLS policy
 *   referenciando `deleted_at` nas 27 tabelas do escopo (a única encontrada,
 *   em `notifications`, já está em tabela com `deleted_at` timestamptz), mas
 *   a função abaixo trata as duas dependências de forma DINÂMICA (via
 *   `pg_depend`/`pg_policies`, sem hardcode de nomes) para não quebrar se uma
 *   policy nova passar a referenciar a coluna no futuro — mesmo espírito da
 *   317: "qualquer view/policy que passe a depender da coluna é tratada
 *   automaticamente".
 *
 * CUSTO OPERACIONAL (medido, não estimado)
 *   `ALTER COLUMN ... TYPE timestamptz USING ...` SEMPRE reescreve a tabela
 *   inteira, mesmo `timestamp`/`timestamptz` tendo a mesma representação
 *   binária — testado com 200k linhas sintéticas neste ambiente: o
 *   `relfilenode` mudou após o ALTER (378ms para 200k linhas). Isso significa
 *   trava ACCESS EXCLUSIVE (bloqueia leitura E escrita) pela duração inteira
 *   da reescrita — o Postgres reconstrói automaticamente os 105 índices que
 *   hoje referenciam `deleted_at` nestas 27 tabelas (a maioria índices
 *   parciais `WHERE deleted_at IS NULL` da migration 348), o que domina o
 *   tempo de trava em tabelas com mais índices (aprs, checklists, pts, users,
 *   nonconformities, dds). Não há como usar CONCURRENTLY aqui — a cláusula
 *   não existe para ALTER COLUMN TYPE. Recomenda-se rodar em janela de baixo
 *   tráfego em produção; nenhuma tabela deste escopo tem volume no nível de
 *   `mail_logs`/`audit_logs`/`ai_interactions`, então o impacto esperado é de
 *   segundos, não minutos — mas deve ser validado com `EXPLAIN`/tamanho real
 *   de produção antes de rodar, não apenas com o schema vazio deste teste.
 *
 * REVERSÃO
 *   `down()` converte de volta para TIMESTAMP com o mesmo `AT TIME ZONE
 *   'UTC'` (agora na direção timestamptz → naive), reproduzindo os mesmos
 *   dígitos originais de forma determinística, independente do TimeZone de
 *   sessão de quem reverte.
 *
 * IDEMPOTÊNCIA
 *   Cada tabela só é alterada se existir e se `deleted_at` ainda estiver no
 *   tipo de origem — seguro para re-executar e seguro em ambientes onde o
 *   schema não bate 100% com o esperado.
 */
export class ConvertDeletedAtToTimestamptz1709000000351 implements MigrationInterface {
  name = 'ConvertDeletedAtToTimestamptz1709000000351';

  /**
   * Tabelas com `deleted_at` ainda `timestamp without time zone`.
   * `mail_logs` é particionada por `created_at` (RANGE) — alterar o pai
   * propaga automaticamente para as 8 partições (mail_logs_2026_04..10 e
   * mail_logs_default), confirmado empiricamente neste ambiente. Partições
   * não entram na lista porque não são alteradas individualmente.
   */
  private readonly tables = [
    'activities',
    'apr_risk_items',
    'aprs',
    'arrs',
    'audits',
    'checklists',
    'contracts',
    'dds',
    'dids',
    'epis',
    'expense_advances',
    'expense_items',
    'expense_reports',
    'machines',
    'mail_logs',
    'nonconformities',
    'photographic_report_days',
    'photographic_report_exports',
    'photographic_report_images',
    'photographic_reports',
    'pts',
    'rdos',
    'risks',
    'service_orders',
    'sites',
    'tools',
    'users',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createHelper(queryRunner);
    for (const table of this.tables) {
      await queryRunner.query(
        `SELECT public.__mig351_convert_deleted_at($1, 'TIMESTAMPTZ')`,
        [table],
      );
    }
    await this.dropHelper(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.createHelper(queryRunner);
    for (const table of this.tables) {
      await queryRunner.query(
        `SELECT public.__mig351_convert_deleted_at($1, 'TIMESTAMP')`,
        [table],
      );
    }
    await this.dropHelper(queryRunner);
  }

  /**
   * Helper temporário (removido ao final da migration) que converte
   * `<p_table>.deleted_at` para `p_target_type` preservando dinamicamente
   * as duas dependências que o Postgres recusa alterar sem remover antes:
   * materialized views (via `pg_depend`) e RLS policies (via `pg_policies`).
   *
   * Idempotente: no-op se a tabela não existir ou se `deleted_at` já
   * estiver no tipo alvo.
   */
  private async createHelper(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION public.__mig351_convert_deleted_at(
        p_table text,
        p_target_type text
      ) RETURNS void
      LANGUAGE plpgsql
      SET search_path = public, pg_temp
      AS $fn$
      DECLARE
        current_type text;
        mv record;
        mv_defs text[] := ARRAY[]::text[];
        pol record;
        pol_defs text[] := ARRAY[]::text[];
        stmt text;
      BEGIN
        IF to_regclass('public.' || quote_ident(p_table)) IS NULL THEN
          RETURN;
        END IF;

        SELECT data_type INTO current_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = p_table
          AND column_name = 'deleted_at';

        IF current_type IS NULL THEN
          RETURN; -- tabela sem deleted_at
        END IF;

        IF (p_target_type = 'TIMESTAMPTZ' AND current_type = 'timestamp with time zone')
           OR (p_target_type = 'TIMESTAMP' AND current_type = 'timestamp without time zone') THEN
          RETURN; -- já está no tipo alvo
        END IF;

        -- 1) Salva e remove materialized views dependentes de deleted_at
        FOR mv IN
          SELECT DISTINCT cl.oid AS oid, cl.relname AS relname
          FROM pg_depend d
          JOIN pg_rewrite r   ON r.oid = d.objid
          JOIN pg_class cl    ON cl.oid = r.ev_class
          JOIN pg_class src   ON src.oid = d.refobjid
          JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = d.refobjsubid
          JOIN pg_namespace n ON n.oid = src.relnamespace
          WHERE n.nspname   = 'public'
            AND src.relname = p_table
            AND a.attname   = 'deleted_at'
            AND cl.relkind  = 'm'
        LOOP
          mv_defs := mv_defs || format(
            'CREATE MATERIALIZED VIEW public.%I AS %s',
            mv.relname,
            pg_get_viewdef(mv.oid)
          );
          mv_defs := mv_defs || (
            SELECT coalesce(array_agg(i.indexdef), ARRAY[]::text[])
            FROM pg_indexes i
            WHERE i.schemaname = 'public' AND i.tablename = mv.relname
          );
          mv_defs := mv_defs || (
            SELECT coalesce(
              array_agg(DISTINCT format(
                'GRANT %s ON public.%I TO %I',
                g.privilege_type, mv.relname, g.grantee
              )),
              ARRAY[]::text[]
            )
            FROM information_schema.role_table_grants g
            WHERE g.table_schema = 'public'
              AND g.table_name   = mv.relname
              AND g.grantee <> current_user
          );
          EXECUTE format('DROP MATERIALIZED VIEW public.%I', mv.relname);
        END LOOP;

        -- 2) Salva e remove RLS policies da tabela (defesa dinâmica; hoje
        --    nenhuma policy nestas 27 tabelas referencia deleted_at, mas a
        --    checagem não depende de hardcode de nomes)
        FOR pol IN
          SELECT policyname, permissive, roles, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = p_table
        LOOP
          pol_defs := pol_defs || format(
            'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',
            pol.policyname,
            p_table,
            CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            pol.cmd,
            array_to_string(pol.roles, ', '),
            CASE WHEN pol.qual       IS NOT NULL THEN ' USING (' || pol.qual || ')' ELSE '' END,
            CASE WHEN pol.with_check IS NOT NULL THEN ' WITH CHECK (' || pol.with_check || ')' ELSE '' END
          );
          EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, p_table);
        END LOOP;

        -- 3) Conversão. AT TIME ZONE 'UTC' funciona nas duas direções:
        --    naive -> tz interpreta o valor como relógio UTC;
        --    tz -> naive projeta o instante de volta para relógio UTC.
        --    Nunca depende do TimeZone de sessão de quem executa.
        EXECUTE format(
          'ALTER TABLE public.%I ALTER COLUMN "deleted_at" TYPE %s USING "deleted_at" AT TIME ZONE ''UTC''',
          p_table,
          p_target_type
        );

        -- 4) Restaura policies e matviews na ordem inversa
        FOREACH stmt IN ARRAY pol_defs LOOP
          EXECUTE stmt;
        END LOOP;
        FOREACH stmt IN ARRAY mv_defs LOOP
          EXECUTE stmt;
        END LOOP;
      END;
      $fn$;
    `);
  }

  private async dropHelper(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS public.__mig351_convert_deleted_at(text, text);`,
    );
  }
}
