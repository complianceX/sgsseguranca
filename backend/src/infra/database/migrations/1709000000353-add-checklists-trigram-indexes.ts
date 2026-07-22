import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices trigram para o filtro por segmento de checklist.
 *
 * PROBLEMA
 *   `ChecklistsService` classifica checklists em segmentos (normativos,
 *   equipamentos, veículos, EPIs, operacionais) comparando palavras-chave
 *   contra quatro colunas de texto — `titulo`, `descricao`, `equipamento` e
 *   `maquina`. Cada palavra-chave vira um `ILIKE '%termo%'` por coluna, e o
 *   segmento "operacionais" chega a 34 termos × 4 colunas = 136 predicados,
 *   dentro de um `NOT (...)`. Como a listagem usa `getManyAndCount()`, os
 *   mesmos predicados são avaliados duas vezes: uma para a página e outra para
 *   o total, e o COUNT não é cortado pelo LIMIT.
 *
 *   Com curinga à esquerda (`%termo%`) nenhum índice B-tree pode ser usado, e
 *   a avaliação é linha a linha sobre todos os checklists do tenant.
 *
 * DIMENSÃO REAL DO IMPACTO
 *   No ambiente atual a tabela tem dezenas de linhas, então hoje isso não
 *   degrada nada de forma perceptível — é dívida de escalabilidade, não
 *   incidente em curso. O custo cresce linearmente com o volume por tenant e
 *   se manifesta primeiro no COUNT, que percorre o conjunto inteiro.
 *
 * CORREÇÃO
 *   Índices GIN com `gin_trgm_ops` nas quatro colunas. A extensão `pg_trgm` já
 *   está instalada no banco, e é ela que permite ao planejador usar índice para
 *   `ILIKE '%termo%'` — inclusive com curinga à esquerda. Isso ataca o custo
 *   sem alterar a regra de negócio da categorização, que continua no serviço.
 *
 *   Os índices são parciais (`WHERE deleted_at IS NULL`): a listagem sempre
 *   filtra registros ativos, então indexar os excluídos só aumentaria o índice.
 *
 * LIMITE DESTA CORREÇÃO (honesto)
 *   Índice trigram acelera os predicados positivos. O segmento "operacionais" é
 *   expresso como negação (`NOT (...)`), e negação de conjunto raramente é
 *   resolvida por índice — esse caso continuará varrendo. A solução definitiva
 *   para ele é materializar o segmento numa coluna (ou tabela de classificação)
 *   e indexá-la, o que altera modelo e regra de negócio e por isso não é feito
 *   aqui. Este índice reduz o custo dos demais segmentos e do `search` textual
 *   livre, que compartilham as mesmas colunas.
 *
 * SEGURANÇA
 *   `CONCURRENTLY` para não bloquear escrita; `IF NOT EXISTS` para permitir
 *   reexecução. Índices GIN encarecem escrita — aceitável aqui, já que
 *   checklists têm volume de escrita baixo comparado à frequência de listagem.
 */
export class AddChecklistsTrigramIndexes1709000000353 implements MigrationInterface {
  name = 'AddChecklistsTrigramIndexes1709000000353';
  transaction = false;

  private readonly columns = ['titulo', 'descricao', 'equipamento', 'maquina'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('checklists'))) {
      return;
    }

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    for (const column of this.columns) {
      if (!(await queryRunner.hasColumn('checklists', column))) {
        continue;
      }

      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_checklists_${column}_trgm"
        ON "checklists" USING gin ("${column}" gin_trgm_ops)
        WHERE "deleted_at" IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of this.columns) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "IDX_checklists_${column}_trgm"`,
      );
    }
  }
}
