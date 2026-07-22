import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige partições criadas sem policy de isolamento.
 *
 * DEFEITO INTRODUZIDO PELA MIGRATION 354
 *   Ao estender as partições mensais de `mail_logs` e `ai_interactions`, a 354
 *   habilitou `ENABLE`/`FORCE ROW LEVEL SECURITY` em cada partição nova mas não
 *   criou nenhuma policy. Em PostgreSQL, tabela com RLS ativo e nenhuma policy
 *   nega tudo: sem policy não existe linha visível nem gravável para quem não
 *   tem BYPASSRLS.
 *
 *   O efeito ficaria latente até o roteamento alcançar essas faixas — a partir
 *   de setembro/2026 para `mail_logs` —, quando o registro de e-mails passaria a
 *   falhar silenciosamente para o papel de runtime. A verificação pós-aplicação
 *   apontou 24 tabelas com RLS incompleto onde antes havia zero, o que expôs o
 *   problema antes de qualquer impacto real.
 *
 *   Partições NÃO herdam policies da tabela pai: cada uma precisa da sua. As
 *   partições anteriores já seguiam esse padrão, o que torna a omissão da 354
 *   uma inconsistência clara em relação ao restante do schema.
 *
 * CORREÇÃO
 *   Recria em cada partição a mesma policy das partições já existentes,
 *   descoberta dinamicamente a partir de uma partição de referência do mesmo
 *   pai — evitando divergir do predicado vigente caso ele mude no futuro.
 *   O predicado atual compara em texto (`company_id::text = current_company()::text`)
 *   porque `ai_interactions.company_id` é varchar.
 *
 * IDEMPOTÊNCIA
 *   Só cria policy em partição que ainda não tem nenhuma; nada é alterado nas
 *   partições que já estavam corretas.
 */
export class FixNewPartitionsMissingRlsPolicies1709000000355
  implements MigrationInterface
{
  name = 'FixNewPartitionsMissingRlsPolicies1709000000355';

  private readonly parents = ['mail_logs', 'ai_interactions'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const parent of this.parents) {
      await queryRunner.query(`
        DO $do$
        DECLARE
          part record;
          ref_qual text;
          ref_check text;
          ref_name text;
        BEGIN
          IF to_regclass('public.${parent}') IS NULL THEN
            RETURN;
          END IF;

          -- Policy de referência: qualquer partição do mesmo pai que já tenha
          -- uma. Assim o predicado aplicado é exatamente o que vigora hoje.
          SELECT p.policyname, p.qual, p.with_check
            INTO ref_name, ref_qual, ref_check
          FROM pg_policies p
          JOIN pg_class c   ON c.relname = p.tablename
          JOIN pg_inherits i ON i.inhrelid = c.oid
          WHERE p.schemaname = 'public'
            AND i.inhparent = 'public.${parent}'::regclass
          LIMIT 1;

          -- Sem referência entre as partições, usa a policy do próprio pai.
          IF ref_qual IS NULL THEN
            SELECT p.policyname, p.qual, p.with_check
              INTO ref_name, ref_qual, ref_check
            FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = '${parent}'
            LIMIT 1;
          END IF;

          IF ref_qual IS NULL THEN
            RAISE NOTICE 'Sem policy de referência para %; partições não alteradas.', '${parent}';
            RETURN;
          END IF;

          FOR part IN
            SELECT c.relname
            FROM pg_class c
            JOIN pg_inherits i ON i.inhrelid = c.oid
            WHERE i.inhparent = 'public.${parent}'::regclass
              AND NOT EXISTS (
                SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname
              )
          LOOP
            EXECUTE format(
              'CREATE POLICY %I ON public.%I FOR ALL USING (%s) WITH CHECK (%s)',
              coalesce(ref_name, 'tenant_isolation_policy'),
              part.relname,
              ref_qual,
              coalesce(ref_check, ref_qual)
            );
          END LOOP;
        END
        $do$;
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Remover as policies recriadas devolveria as partições ao estado em que
    // negam todo acesso — o defeito que esta migration corrige. Reverter aqui
    // seria reintroduzir a falha, então o down é intencionalmente inerte.
    return Promise.resolve();
  }
}
