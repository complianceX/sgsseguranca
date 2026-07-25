import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estende as partições mensais de `mail_logs` e `ai_interactions`.
 *
 * PROBLEMA
 *   As partições de `mail_logs` terminavam em agosto/2026 e as de
 *   `ai_interactions` em março/2027. Como ambas possuem partição DEFAULT, um
 *   INSERT fora das faixas não falha — ele cai silenciosamente na DEFAULT. O
 *   efeito não é erro, é degradação: a DEFAULT concentra todo o volume novo e o
 *   particionamento deixa de cumprir sua função (poda por período, manutenção e
 *   descarte por faixa).
 *
 *   Há um agravante de ordem prática: enquanto a DEFAULT contiver linhas de um
 *   mês, o PostgreSQL recusa criar a partição correspondente
 *   ("updated partition constraint for default partition would be violated").
 *   Recuperar exige DETACH da DEFAULT, mover as linhas e reanexar — operação
 *   bem mais cara do que simplesmente criar as faixas antes do tempo.
 *
 * DECISÃO
 *   Criar 12 meses de folga além do último intervalo existente em cada tabela.
 *   Nomes e limites seguem exatamente a convenção já usada pelas migrations
 *   anteriores (`<tabela>_YYYY_MM`, `FROM ('YYYY-MM-01') TO ('YYYY-MM-01')` do
 *   mês seguinte), para que a rotina de manutenção continue reconhecendo-as.
 *
 * OBSERVAÇÃO OPERACIONAL
 *   Isto adia o problema, não o resolve em definitivo: sem uma rotina que crie
 *   partições continuamente, a situação se repete quando a folga acabar. A
 *   recomendação registrada no relatório da auditoria é agendar a criação
 *   automática (job mensal) — mudança de escopo maior, que não cabe nesta
 *   migration.
 *
 * SEGURANÇA
 *   Idempotente: `IF NOT EXISTS` na criação e verificação prévia da existência
 *   da tabela particionada. Criar partição vazia não reescreve dados nem
 *   bloqueia leitura das demais; o lock é breve e restrito ao catálogo da
 *   tabela pai.
 */
export class ExtendFuturePartitions1709000000354 implements MigrationInterface {
  name = 'ExtendFuturePartitions1709000000354';

  /** `mail_logs` ia até 2026-09-01; cobre setembro/2026 a agosto/2027. */
  private readonly mailLogsMonths = [
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
    '2027-02',
    '2027-03',
    '2027-04',
    '2027-05',
    '2027-06',
    '2027-07',
    '2027-08',
  ];

  /** `ai_interactions` ia até 2027-04-01; cobre abril/2027 a março/2028. */
  private readonly aiInteractionsMonths = [
    '2027-04',
    '2027-05',
    '2027-06',
    '2027-07',
    '2027-08',
    '2027-09',
    '2027-10',
    '2027-11',
    '2027-12',
    '2028-01',
    '2028-02',
    '2028-03',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createMonthlyPartitions(
      queryRunner,
      'mail_logs',
      this.mailLogsMonths,
    );
    await this.createMonthlyPartitions(
      queryRunner,
      'ai_interactions',
      this.aiInteractionsMonths,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Partições não são removidas no rollback por dois motivos:
    // (1) DROP PARTITION apaga dados silenciosamente se a partição não estiver vazia;
    // (2) com FORCE RLS e sem policy por partição (estado antes da migration 355),
    //     count(*) retorna 0 mesmo com linhas — tornando a verificação não confiável.
    // Remoção manual das partições vazias documentada no runbook de migrations.
    return Promise.resolve();
  }

  private async createMonthlyPartitions(
    queryRunner: QueryRunner,
    parentTable: string,
    months: string[],
  ): Promise<void> {
    const isPartitioned = await this.isPartitionedTable(
      queryRunner,
      parentTable,
    );
    if (!isPartitioned) {
      return;
    }

    for (const month of months) {
      const partitionName = `${parentTable}_${month.replace('-', '_')}`;
      const from = `${month}-01`;
      const to = this.nextMonthFirstDay(month);

      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${partitionName}"
        PARTITION OF "${parentTable}"
        FOR VALUES FROM ('${from}') TO ('${to}')
      `);

      // Partição herda RLS do pai apenas quanto à estrutura; habilitar
      // explicitamente mantém o mesmo contrato das partições já existentes.
      await queryRunner.query(
        `ALTER TABLE "${partitionName}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${partitionName}" FORCE ROW LEVEL SECURITY`,
      );
    }
  }

  private async dropEmptyPartitions(
    queryRunner: QueryRunner,
    parentTable: string,
    months: string[],
  ): Promise<void> {
    for (const month of months) {
      const partitionName = `${parentTable}_${month.replace('-', '_')}`;
      if (!(await queryRunner.hasTable(partitionName))) {
        continue;
      }

      const rows = (await queryRunner.query(
        `SELECT count(*)::int AS total FROM "${partitionName}"`,
      )) as Array<{ total: number }>;

      if (Number(rows?.[0]?.total ?? 0) === 0) {
        await queryRunner.query(`DROP TABLE IF EXISTS "${partitionName}"`);
      }
    }
  }

  private async isPartitionedTable(
    queryRunner: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `SELECT c.relkind::text AS kind
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = $1
        LIMIT 1`,
      [table],
    )) as Array<{ kind: string }>;

    return rows?.[0]?.kind === 'p';
  }

  private nextMonthFirstDay(month: string): string {
    const [year, mon] = month.split('-').map((value) => parseInt(value, 10));
    const nextYear = mon === 12 ? year + 1 : year;
    const nextMonth = mon === 12 ? 1 : mon + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  }
}
