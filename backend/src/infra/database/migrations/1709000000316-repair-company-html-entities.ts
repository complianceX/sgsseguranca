import { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairCompanyHtmlEntities1709000000316 implements MigrationInterface {
  name = 'RepairCompanyHtmlEntities1709000000316';

  async up(queryRunner: QueryRunner): Promise<void> {
    const unescape = `
      replace(replace(replace(replace(replace(
        %s,
        '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', '''')
    `;

    await queryRunner.query(`
      UPDATE companies
      SET razao_social = ${unescape.replace('%s', 'razao_social')}
      WHERE razao_social ~ '&(amp|lt|gt|quot|#39);'
    `);

    await queryRunner.query(`
      UPDATE companies
      SET endereco = ${unescape.replace('%s', 'endereco')}
      WHERE endereco ~ '&(amp|lt|gt|quot|#39);'
    `);

    await queryRunner.query(`
      UPDATE companies
      SET responsavel = ${unescape.replace('%s', 'responsavel')}
      WHERE responsavel ~ '&(amp|lt|gt|quot|#39);'
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Dados originais corrompidos não são recuperáveis — down é no-op intencional.
  }
}
