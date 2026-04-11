import * as fs from 'fs';
import * as path from 'path';

type TenantCredential = {
  tenantIndex: number;
  companyId: string;
  siteId: string;
  userId: string;
  cpf: string;
  password: string;
  accessToken?: string;
};

const BASE_URL = String(
  process.env.BASE_URL || 'http://localhost:3011',
).replace(/\/+$/, '');
const INPUT_FILE = path.resolve(
  process.cwd(),
  process.env.PREAUTH_TENANTS_INPUT || 'test/load/tenants.json',
);
const OUTPUT_FILE = path.resolve(
  process.cwd(),
  process.env.PREAUTH_TENANTS_OUTPUT || 'test/load/tenants.auth.json',
);
const DELAY_MS = clampPositiveInt(process.env.PREAUTH_LOGIN_DELAY_MS, 2200);

async function main(): Promise<void> {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Arquivo de entrada não encontrado: ${INPUT_FILE}`);
  }

  const tenants = JSON.parse(
    fs.readFileSync(INPUT_FILE, 'utf8'),
  ) as TenantCredential[];

  if (!Array.isArray(tenants) || tenants.length === 0) {
    throw new Error(`Arquivo de tenants vazio ou inválido: ${INPUT_FILE}`);
  }

  console.log(`Pré-autenticando ${tenants.length} tenants em ${BASE_URL}...`);
  console.log(`Delay entre logins: ${DELAY_MS}ms`);

  const prepared: TenantCredential[] = [];

  for (let index = 0; index < tenants.length; index += 1) {
    const tenant = tenants[index];
    const fingerprint = `preauth-${tenant.tenantIndex}-${index}`;
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'tenant-preauth/1.0',
        'x-client-fingerprint': fingerprint,
      },
      body: JSON.stringify({ cpf: tenant.cpf, password: tenant.password }),
    });

    const payloadText = await res.text();
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    if (res.status !== 200 && res.status !== 201) {
      throw new Error(
        [
          `Falha ao autenticar tenant ${index + 1}/${tenants.length}`,
          `CPF: ${tenant.cpf}`,
          `Status: ${res.status}`,
          `Body: ${payloadText.slice(0, 300)}`,
        ].join(' | '),
      );
    }

    const accessToken =
      payload && typeof payload.accessToken === 'string'
        ? payload.accessToken
        : null;
    if (!accessToken) {
      throw new Error(
        `Tenant ${tenant.cpf} autenticou sem accessToken válido no payload.`,
      );
    }

    prepared.push({
      ...tenant,
      accessToken,
    });

    if ((index + 1) % 10 === 0 || index === tenants.length - 1) {
      console.log(`  ${index + 1}/${tenants.length} tenants prontos`);
    }

    if (index < tenants.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(prepared, null, 2), 'utf8');

  console.log(`Arquivo de saída: ${OUTPUT_FILE}`);
}

function clampPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n✗ ${message}`);
  process.exit(1);
});
