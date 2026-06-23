import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '../../infra/database/migrations');

describe('Migration 1709000000312 — pts CHECK temporal + LGPD erasure', () => {
  let content: string;

  beforeAll(() => {
    const file = path.join(
      MIGRATIONS_DIR,
      '1709000000312-pts-gdpr-erasure-and-temporal-check.ts',
    );
    content = fs.readFileSync(file, 'utf8');
  });

  it('contém CHECK NOT VALID para janela temporal (não bloqueia linhas existentes)', () => {
    expect(content).toContain('CHK_pts_data_hora_validas');
    expect(content).toContain('NOT VALID');
    expect(content).toContain('"data_hora_fim" > "data_hora_inicio"');
  });

  it('inclui pts na função gdpr_delete_user_data com label correto', () => {
    expect(content).toContain("'pts_text_fields'::text");
  });

  it('anonimiza aprovado_motivo quando o usuário foi aprovador', () => {
    expect(content).toContain('aprovado_motivo');
    expect(content).toContain('anonimizado-LGPD');
    expect(content).toContain('aprovado_por_id = p_user_id');
  });

  it('anonimiza reprovado_motivo quando o usuário foi reprovador', () => {
    expect(content).toContain('reprovado_motivo');
    expect(content).toContain('reprovado_por_id = p_user_id');
  });

  it('guarda campos de outros aprovadores intactos (CASE WHEN)', () => {
    expect(content).toContain('CASE');
    expect(content).toContain('WHEN aprovado_por_id = p_user_id');
    expect(content).toContain('ELSE aprovado_motivo');
  });

  it('protege somente PTs ativas (deleted_at IS NULL)', () => {
    expect(content).toContain('deleted_at IS NULL');
  });

  it('método down() reverte a constraint (mas não a função GDPR)', () => {
    expect(content).toContain('async down');
    expect(content).toContain('DROP CONSTRAINT IF EXISTS');
    expect(content).toContain('CHK_pts_data_hora_validas');
  });

  it('é idempotente via guard NOT EXISTS antes de ADD CONSTRAINT', () => {
    expect(content).toContain("conname = 'CHK_pts_data_hora_validas'");
    expect(content).toContain('IF NOT EXISTS');
  });
});

describe('Migration 1709000000313 — pts índice único (company_id, numero)', () => {
  let content: string;

  beforeAll(() => {
    const file = path.join(
      MIGRATIONS_DIR,
      '1709000000313-pts-unique-numero-per-company.ts',
    );
    content = fs.readFileSync(file, 'utf8');
  });

  it('cria índice UNIQUE com CONCURRENTLY (sem lock full-table)', () => {
    expect(content).toContain('CREATE UNIQUE INDEX CONCURRENTLY');
  });

  it('declara transaction = false obrigatório para CONCURRENTLY', () => {
    expect(content).toMatch(/transaction\s*=\s*false/);
  });

  it('escopa o índice a registros não removidos (deleted_at IS NULL)', () => {
    expect(content).toMatch(/WHERE.+"deleted_at" IS NULL/s);
  });

  it('inclui ambas as colunas do índice composto', () => {
    expect(content).toContain('"company_id", "numero"');
  });

  it('rollback usa DROP INDEX CONCURRENTLY', () => {
    expect(content).toContain('DROP INDEX CONCURRENTLY IF EXISTS');
    expect(content).toContain('UQ_pts_company_numero');
  });

  it('nome do índice é consistente entre up() e down()', () => {
    const indexName = 'UQ_pts_company_numero';
    const occurrences = (content.match(new RegExp(indexName, 'g')) ?? [])
      .length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
