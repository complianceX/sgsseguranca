const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const companyId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const outputDir = path.resolve(__dirname);

const permissions = [
  "can_view_apr",
  "can_create_apr",
  "can_update_apr",
  "can_approve_apr",
  "can_generate_apr_pdf",
  "can_view_signatures",
  "can_manage_signatures",
];

const user = {
  id: userId,
  nome: "TST Smoke APR",
  email: "tst-smoke@sgs.local",
  cpf: "00000000000",
  funcao: "Tecnico de Seguranca",
  role: "TST",
  company_id: companyId,
  site_id: siteId,
  profile_id: "44444444-4444-4444-8444-444444444444",
  profile: {
    id: "44444444-4444-4444-8444-444444444444",
    nome: "TST",
    permissoes: permissions,
  },
  permissions,
  roles: ["TST"],
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
};

const company = {
  id: companyId,
  razao_social: "SGS Smoke Tenant",
  cnpj: "00000000000100",
  endereco: "Obra teste",
  responsavel: "Responsavel SGS",
  status: true,
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
};

const site = {
  id: siteId,
  nome: "Obra Smoke APR",
  endereco: "Frente 01",
  cidade: "Araguaina",
  estado: "TO",
  company_id: companyId,
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
};

const paginated = (data) => ({
  data,
  total: data.length,
  page: 1,
  limit: 100,
  lastPage: 1,
});

test("APR create flow smoke", async ({ page, context }) => {
  await context.addCookies([
    {
      name: "refresh_csrf",
      value: "smoke-refresh",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.addInitScript(() => {
    window.localStorage.setItem("auth_refresh_hint", "1");
  });

  const consoleErrors = [];
  const pageErrors = [];
  let capturedCreatePayload = null;

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathName = url.pathname;
    const method = request.method();
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (
      url.origin === "http://localhost:3000" &&
      !pathName.startsWith("/api") &&
      pathName !== "/monitoring-tunnel"
    ) {
      return route.continue();
    }

    if (pathName === "/monitoring-tunnel" || pathName === "/api/keepalive") {
      return json({ ok: true });
    }
    if (pathName === "/auth/csrf") return json({ ok: true });
    if (pathName === "/auth/refresh") {
      return json({ accessToken: "smoke-access-token" });
    }
    if (pathName === "/auth/me") {
      return json({ user, roles: ["TST"], permissions, isAdminGeral: false });
    }
    if (pathName === "/notifications") {
      return json({ items: [], total: 0, page: 1, limit: 20 });
    }
    if (pathName === "/notifications/unread-count") return json({ count: 0 });
    if (pathName === `/companies/${companyId}`) return json(company);
    if (pathName === "/companies") return json(paginated([company]));
    if (pathName === "/activities") {
      return json(
        paginated([
          {
            id: "55555555-5555-4555-8555-555555555555",
            nome: "Manutencao eletrica",
            company_id: companyId,
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        ]),
      );
    }
    if (pathName === "/risks") {
      return json(
        paginated([
          {
            id: "66666666-6666-4666-8666-666666666666",
            nome: "Choque eletrico",
            descricao: "Contato com circuito energizado",
            company_id: companyId,
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        ]),
      );
    }
    if (pathName === "/epis") {
      return json(
        paginated([
          {
            id: "77777777-7777-4777-8777-777777777777",
            nome: "Luva isolante",
            company_id: companyId,
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        ]),
      );
    }
    if (pathName === "/tools") {
      return json(
        paginated([
          {
            id: "88888888-8888-4888-8888-888888888888",
            nome: "Multimetro",
            company_id: companyId,
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        ]),
      );
    }
    if (pathName === "/machines") {
      return json(
        paginated([
          {
            id: "99999999-9999-4999-8999-999999999999",
            nome: "Plataforma elevatoria",
            company_id: companyId,
            createdAt: "2026-05-22T00:00:00.000Z",
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        ]),
      );
    }
    if (pathName === "/sites") return json(paginated([site]));
    if (pathName === "/users") return json(paginated([user]));
    if (pathName === "/aprs/activity-templates") {
      return json([
        {
          tipo_atividade: "manutencao_eletrica",
          label: "Manutencao eletrica",
          descricao: "Servico em circuito desenergizado",
        },
      ]);
    }
    if (pathName === "/aprs/activity-templates/manutencao_eletrica") {
      return json({
        tipo_atividade: "manutencao_eletrica",
        label: "Manutencao eletrica",
        descricao: "Servico em circuito desenergizado",
        risk_items: [],
      });
    }
    if (pathName === "/aprs" && method === "GET") return json(paginated([]));
    if (pathName === "/aprs" && method === "POST") {
      capturedCreatePayload = request.postDataJSON();
      return json(
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          numero: capturedCreatePayload.numero,
          titulo: capturedCreatePayload.titulo,
          descricao: capturedCreatePayload.descricao,
          data_inicio: capturedCreatePayload.data_inicio,
          data_fim: capturedCreatePayload.data_fim,
          status: "Pendente",
          company_id: companyId,
          site_id: capturedCreatePayload.site_id,
          elaborador_id: capturedCreatePayload.elaborador_id,
          activities: [],
          risks: [],
          epis: [],
          tools: [],
          machines: [],
          participants: [],
          risk_items: [],
          created_at: "2026-05-22T00:00:00.000Z",
          updated_at: "2026-05-22T00:00:00.000Z",
        },
        201,
      );
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: `Unhandled smoke route ${method} ${pathName}` }),
    });
  });

  await page.goto(
    `/dashboard/aprs/new?company_id=${companyId}&site_id=${siteId}&user_id=${userId}`,
    { waitUntil: "domcontentloaded" },
  );

  await page.getByLabel("Número da APR").fill("APR-SMOKE-001");
  await page.getByLabel("Título da APR").fill("APR Smoke Completa");
  await page.getByLabel("Descrição/Escopo").fill(
    "Validação smoke do fluxo de criação da APR.",
  );
  await page.locator('select[name="tipo_atividade"]').selectOption("manutencao_eletrica");
  await page.locator('select[name="turno"]').selectOption("Diurno");
  await page.getByLabel("Frente de trabalho").fill("Frente elétrica 01");
  await page.getByLabel("Área / setor de risco").fill("Subestação");
  await page.getByLabel("Local detalhado de execução").fill(
    "Painel principal da subestação, setor leste.",
  );
  await page.getByLabel("Responsável técnico").fill("TST Smoke APR");
  await page.getByLabel("Registro profissional").fill("TST-0001");
  await page.getByLabel("Empresa").selectOption(companyId);
  await page.getByLabel("Site/Obra").selectOption(siteId);
  await page.getByLabel("Elaborador").selectOption(userId);

  await page.getByRole("button", { name: /Próximo/ }).click();
  await page.getByText("Grade operacional da APR").waitFor({ timeout: 20000 });
  if ((await page.locator('[name="itens_risco.0.atividade_processo"]').count()) === 0) {
    await page.getByRole("button", { name: /Adicionar linha/ }).click();
  }
  await page.locator('[name="itens_risco.0.atividade_processo"]').fill("Bloqueio e teste elétrico");
  await page.locator('[name="itens_risco.0.etapa"]').fill("Preparação");
  await page.locator('[name="itens_risco.0.agente_ambiental"]').fill("Energia elétrica");
  await page.locator('[name="itens_risco.0.condicao_perigosa"]').fill("Contato com partes energizadas");
  await page.locator('[name="itens_risco.0.fontes_circunstancias"]').fill("Painel de distribuição");
  await page.locator('[name="itens_risco.0.possiveis_lesoes"]').fill("Choque elétrico e queimadura");
  await page.locator('[name="itens_risco.0.probabilidade"]').selectOption("2");
  await page.locator('[name="itens_risco.0.severidade"]').selectOption("3");
  await page.locator('[name="itens_risco.0.medidas_prevencao"]').fill(
    "Bloquear energia, testar ausência de tensão e sinalizar a área.",
  );
  await page.locator('[name="itens_risco.0.epc"]').fill("Barreira e sinalização");
  await page.locator('[name="itens_risco.0.epi"]').fill("Luva isolante e protetor facial");
  await page.locator('[name="itens_risco.0.responsavel"]').fill("TST Smoke APR");
  await page.locator('[name="itens_risco.0.prazo"]').fill("2026-05-23");
  await page.locator('[name="itens_risco.0.status_acao"]').selectOption("Aberta");

  await page.getByRole("button", { name: /Próximo/ }).click();
  await page.getByText("Revisão final obrigatória").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: /^Salvar APR$/ }).last().click();
  await page.waitForURL("**/dashboard/aprs", { timeout: 30000 });

  expect(capturedCreatePayload).toBeTruthy();
  expect(capturedCreatePayload.company_id).toBeUndefined();
  expect(capturedCreatePayload.site_id).toBe(siteId);
  expect(capturedCreatePayload.elaborador_id).toBe(userId);
  expect(capturedCreatePayload.risk_items).toHaveLength(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);

  fs.mkdirSync(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, "apr-create-smoke.png"),
    fullPage: true,
  });
  fs.writeFileSync(
    path.join(outputDir, "apr-create-smoke-payload.json"),
    JSON.stringify(capturedCreatePayload, null, 2),
  );
});


