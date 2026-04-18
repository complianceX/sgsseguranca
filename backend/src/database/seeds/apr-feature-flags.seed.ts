import { DataSource } from 'typeorm';
import { AprFeatureFlag } from '../../aprs/entities/apr-feature-flag.entity';

const FLAGS: Array<{ key: string; description: string }> = [
  {
    key: 'APR_WORKFLOW_CONFIGURAVEL',
    description: 'Workflow de aprovação configurável por tenant',
  },
  {
    key: 'APR_RULES_ENGINE',
    description: 'Motor de regras para validações avançadas de APR',
  },
  {
    key: 'APR_TEMPLATES_ENTERPRISE',
    description: 'Templates enterprise reutilizáveis de APR',
  },
  {
    key: 'APR_PDF_PREMIUM',
    description: 'Geração de PDF premium com layout avançado',
  },
  {
    key: 'APR_ANALYTICS',
    description: 'Dashboard de analytics do módulo APR',
  },
  {
    key: 'APR_IA_SUGGESTIONS',
    description: 'Sugestões de controle de risco via IA',
  },
];

export async function seedAprFeatureFlags(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(AprFeatureFlag);

  for (const flag of FLAGS) {
    const exists = await repo.findOne({
      where: { key: flag.key, tenantId: null as unknown as string },
    });
    if (!exists) {
      await repo.save(
        repo.create({
          key: flag.key,
          enabled: false,
          tenantId: null,
          description: flag.description,
        }),
      );
    }
  }
}
