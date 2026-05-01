import { createConnection, type Connection } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Dds, DdsStatus } from '../src/dds/entities/dds.entity';
import { DDS_THEME_LIBRARY } from './dds-themes.library';

dotenv.config({ path: path.join(__dirname, '../.env') });

const THEMES = DDS_THEME_LIBRARY;

async function run() {
  let connection: Connection | null = null;
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL não configurada.');
    }

    const dbTypeRaw = process.env.DATABASE_TYPE || 'postgres';
    if (dbTypeRaw !== 'postgres') {
      throw new Error(
        `DATABASE_TYPE inválida para este script (${dbTypeRaw}). Use "postgres".`,
      );
    }
    const dbType = 'postgres' as const;

    console.log(`Conectando ao banco de dados (${dbType})...`);

    connection = await createConnection({
      type: dbType,
      url: databaseUrl,
      entities: [path.join(__dirname, '../src/**/*.entity{.ts,.js}')],
      synchronize: false,
    });

    const companies = await connection.query<Array<{ id: string }>>(
      'SELECT id FROM company',
    );
    if (companies.length === 0) {
      console.log('Nenhuma empresa encontrada para associar os temas.');
      return;
    }

    const sites = await connection.query<Array<{ id: string; company_id: string }>>(
      'SELECT id, company_id FROM site',
    );
    const users = await connection.query<Array<{ id: string; company_id: string }>>(
      'SELECT id, company_id FROM "user"',
    );

    const ddsRepo = connection.getRepository(Dds);

    let totalInserted = 0;

    for (const company of companies) {
      const companyId = company.id;

      const companySite = sites.find((site) => site.company_id === companyId);
      const companyUser = users.find((user) => user.company_id === companyId);

      if (!companySite || !companyUser) {
        console.log(
          `Pulando empresa ${companyId}: site ou facilitador não encontrado.`,
        );
        continue;
      }

      console.log(
        `Populando ${THEMES.length} temas para a empresa ${companyId}...`,
      );

      const entities = THEMES.map((theme) => ({
        id: uuidv4(),
        tema: theme.tema,
        conteudo: theme.conteudo,
        data: new Date(),
        is_modelo: true,
        company_id: companyId,
        site_id: companySite.id,
        facilitador_id: companyUser.id,
        status: DdsStatus.RASCUNHO,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      const batchSize = 50;
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        await ddsRepo.insert(batch);
      }

      totalInserted += entities.length;
    }

    console.log(`SUCESSO: ${totalInserted} temas inseridos no total.`);
  } catch (error) {
    console.error('ERRO AO POPULAR TEMAS:', error);
  } finally {
    if (connection) await connection.close();
  }
}

run();

