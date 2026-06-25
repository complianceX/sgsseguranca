import { MigrationInterface, QueryRunner } from 'typeorm';
import { encryptSensitiveValue } from '../../../shared/security/field-encryption.util';

export class EncryptMedicalExamResultadoBackfill1709000000324
  implements MigrationInterface
{
  name = 'EncryptMedicalExamResultadoBackfill1709000000324';

  public async up(queryRunner: QueryRunner): Promise<void> {
    type ExamRow = { id: string; resultado: string };
    const exams = (await queryRunner.query(
      `SELECT id, resultado FROM medical_exams WHERE resultado IS NOT NULL AND resultado NOT LIKE 'enc:v1:%'`,
    )) as ExamRow[];

    for (const exam of exams) {
      const encrypted = encryptSensitiveValue(exam.resultado);
      if (encrypted && encrypted !== exam.resultado) {
        await queryRunner.query(
          `UPDATE medical_exams SET resultado = $1 WHERE id = $2`,
          [encrypted, exam.id],
        );
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Descriptografia em massa via migration reversa não é segura sem a chave.
    // Para reverter: exportar dados descriptografados antes de migrar.
  }
}
