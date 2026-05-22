# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apr-smoke.spec.js >> APR create flow smoke
- Location: output\playwright\apr-smoke.spec.js:71:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for getByText('Grade operacional da APR') to be visible

```

# Page snapshot

```yaml
- generic:
  - link:
    - /url: "#main-content"
    - text: Ir para o conteúdo principal
  - generic:
    - complementary:
      - generic:
        - generic:
          - img
        - generic:
          - paragraph: SGS
          - paragraph: Sistema de Gestão de Segurança
      - generic:
        - navigation:
          - generic:
            - button [expanded]:
              - generic: Estrutura
              - img
            - generic:
              - link:
                - /url: /dashboard
                - generic:
                  - img
                - generic: Painel
              - link:
                - /url: /dashboard/employees
                - generic:
                  - img
                - generic: Funcionários
          - generic:
            - button [expanded]:
              - generic: Campo e Operação
              - img
            - generic:
              - link:
                - /url: /dashboard/dds
                - generic:
                  - img
                - generic: DDS
              - link:
                - /url: /dashboard/pts
                - generic:
                  - img
                - generic: PTs
              - link:
                - /url: /dashboard/aprs
                - generic:
                  - img
                - generic: APRs
              - link:
                - /url: /dashboard/nonconformities
                - generic:
                  - img
                - generic: Não conformidades
              - link:
                - /url: /dashboard/audits
                - generic:
                  - img
                - generic: Auditorias
              - link:
                - /url: /dashboard/sst-agent
                - generic:
                  - img
                - generic: SOPHIE
          - generic:
            - button [expanded]:
              - generic: Relatórios
              - img
            - generic:
              - link:
                - /url: /dashboard/relatorios/fotografico
                - generic:
                  - img
                - generic: Relatório fotográfico
              - link:
                - /url: /dashboard/relatorios/rdos
                - generic:
                  - img
                - generic: RDO
          - generic:
            - button [expanded]:
              - generic: Checklists
              - img
            - generic:
              - link:
                - /url: /dashboard/checklist-models
                - generic:
                  - img
                - generic: Central de modelos
          - generic:
            - button:
              - generic: Leitura e Gestão
              - img
          - generic:
            - button:
              - generic: Sistema
              - img
      - generic:
        - generic:
          - generic:
            - generic: TS
            - generic:
              - paragraph: TST Smoke APR
              - paragraph: TST
          - button:
            - img
            - text: Sair
    - generic:
      - banner:
        - generic:
          - generic:
            - generic:
              - generic: Operação SST
            - button:
              - img
              - generic: Pesquisar no sistema
              - generic:
                - img
                - text: Ctrl K
          - generic:
            - generic:
              - button:
                - img
                - text: SOPHIE
              - generic:
                - button:
                  - img
              - button:
                - img
            - generic:
              - generic: TS
              - generic:
                - paragraph: TST Smoke APR
                - paragraph: TST
      - main:
        - generic:
          - generic:
            - generic:
              - generic:
                - generic:
                  - link:
                    - /url: /dashboard/aprs
                    - img
                  - generic: SGS
                  - img
                  - generic: Segurança
                  - img
                  - generic: APR
                  - img
                  - generic: Nova APR
              - generic:
                - button:
                  - img
                  - text: Exportar PDF
                - button:
                  - img
                  - text: Histórico
                - button:
                  - img
                  - text: Salvar APR
          - generic:
            - generic:
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - heading [level=1]: Nova APR
                        - generic: Pendente
                      - paragraph: Atividade ainda não definida
                      - paragraph: Descreva o escopo, a atividade e as condições relevantes para orientar a análise.
                    - generic:
                      - generic:
                        - paragraph: Riscos
                        - paragraph: "0"
                      - generic:
                        - paragraph: Assinaturas
                        - paragraph: 0/0
                      - generic:
                        - paragraph: Evidências
                        - paragraph: "0"
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - paragraph: Responsável técnico
                            - paragraph: TST Smoke APR
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - paragraph: Empresa / unidade
                            - paragraph: Empresa vinculada
                            - paragraph: Obra Smoke APR
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - paragraph: Local de trabalho
                            - paragraph: Obra Smoke APR
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - paragraph: Data de emissão
                            - paragraph: Não definida
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - paragraph: Validade / execução
                            - paragraph: 22/05/2026 até 29/05/2026
                      - generic:
                        - generic:
                          - generic:
                            - img
                          - generic:
                            - paragraph: Turno
                            - paragraph: Diurno
                            - paragraph: Manutencao eletrica
                  - generic:
                    - generic:
                      - generic:
                        - paragraph: Matriz de riscos
                        - heading [level=2]: Análise operacional simples, auditável e direta
                      - button:
                        - img
                        - text: Adicionar risco
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - paragraph: Elaborador
                            - paragraph: TST Smoke APR
                          - generic:
                            - img
                        - paragraph: Aguardando assinatura
                      - generic:
                        - generic:
                          - generic:
                            - paragraph: Responsável SST
                            - paragraph: Fluxo SST
                          - generic:
                            - img
                        - paragraph: Sem etapa pendente
                      - generic:
                        - generic:
                          - generic:
                            - paragraph: Supervisor de campo
                            - paragraph: 0 participante(s)
                          - generic:
                            - img
                        - paragraph: Defina participantes
                  - navigation:
                    - button:
                      - generic:
                        - generic:
                          - img
                        - generic:
                          - generic: Dados básicos
                          - generic: Identificação, contexto, responsável e escopo.
                    - button:
                      - generic:
                        - generic:
                          - img
                        - generic:
                          - generic: Riscos e controles
                          - generic: Participantes, assinaturas e planilha técnica.
                    - button:
                      - generic:
                        - generic:
                          - img
                        - generic:
                          - generic: Revisão final
                          - generic: Validação final e emissão governada.
                - complementary:
                  - generic:
                    - generic:
                      - paragraph: Resumo de riscos
                      - paragraph: Sem risco mapeado
                    - generic: 0 mapeado(s)
                  - generic:
                    - generic:
                      - generic:
                        - generic:
                          - generic: Insignificante
                        - generic: "0"
                    - generic:
                      - generic:
                        - generic:
                          - generic: Baixo
                        - generic: "0"
                    - generic:
                      - generic:
                        - generic:
                          - generic: Médio
                        - generic: "0"
                    - generic:
                      - generic:
                        - generic:
                          - generic: Alto
                        - generic: "0"
                    - generic:
                      - generic:
                        - generic:
                          - generic: Crítico
                        - generic: "0"
                  - generic:
                    - paragraph: EPI requeridos
                    - paragraph: Selecione EPIs ou preencha a coluna EPI na matriz para alimentar este resumo.
                  - generic:
                    - paragraph: Informações
                    - generic:
                      - generic:
                        - term: Versão
                        - definition: v1
                      - generic:
                        - term: Validade
                        - definition: 22/05/2026 até 29/05/2026
                      - generic:
                        - term: Normas
                        - definition: Não informadas
                    - button:
                      - img
                      - text: Consultar Sophie IA
                      - img
            - generic:
              - generic:
                - img
                - generic:
                  - paragraph: Revisão final obrigatória
                  - paragraph: Não finalize a APR sem revisar a matriz de risco, controles sugeridos e evidências associadas ao trabalho.
            - generic:
              - group:
                - generic:
                  - generic:
                    - heading [level=2]: Informações Básicas
                    - button:
                      - img
                      - generic: Analisar com SGS
                  - generic:
                    - generic:
                      - generic: Número da APR
                      - textbox:
                        - /placeholder: "Ex: 2024/001"
                    - generic:
                      - generic: Título da APR
                      - textbox:
                        - /placeholder: "Ex: Instalação de Painéis Solares"
                    - generic:
                      - generic: Descrição/Escopo
                      - textbox:
                        - /placeholder: Descreva o escopo do trabalho...
                    - generic:
                      - generic: Tipo de atividade
                      - combobox
                    - generic:
                      - generic: Turno
                      - combobox
                    - generic:
                      - generic: Frente de trabalho
                      - textbox:
                        - /placeholder: "Ex: Linha 02, setor de manutenção, área quente"
                    - generic:
                      - generic: Área / setor de risco
                      - textbox:
                        - /placeholder: "Ex: Subestação, cobertura, galpão A"
                    - generic:
                      - generic:
                        - generic:
                          - generic:
                            - paragraph: Template técnico
                            - paragraph: Manutencao eletrica
                            - paragraph: Servico em circuito desenergizado
                          - button: Aplicar template à grade
                    - generic:
                      - generic: Local detalhado de execução
                      - textbox:
                        - /placeholder: "Ex: Cobertura do bloco administrativo, face leste, acesso por plataforma elevatória"
                    - generic:
                      - generic: Responsável técnico
                      - textbox:
                        - /placeholder: Nome do responsável técnico
                        - text: TST Smoke APR
                    - generic:
                      - generic: Registro profissional
                      - textbox:
                        - /placeholder: "Ex: CREA 000000 / TST 00000"
                    - generic:
                      - generic:
                        - paragraph: Governança documental
                        - paragraph: O PDF final não faz parte do preenchimento básico desta etapa. Depois da aprovação, use o fluxo oficial da APR para emitir, abrir ou compartilhar o documento governado.
                    - generic:
                      - generic: Empresa
                      - combobox
                    - generic:
                      - generic: Site/Obra
                      - combobox
                    - generic:
                      - generic: Elaborador
                      - combobox
                    - generic:
                      - paragraph: Status
                      - generic:
                        - generic: Pendente
                        - generic: Controlado pelo fluxo formal
                    - generic:
                      - generic: Data Início
                      - textbox: 2026-05-22
                    - generic:
                      - generic: Data Fim
                      - textbox: 2026-05-29
                    - generic:
                      - generic:
                        - checkbox
                        - generic: Salvar como Modelo
              - generic:
                - generic:
                  - link:
                    - /url: /dashboard/aprs
                    - text: Cancelar
                - generic:
                  - button:
                    - generic: Próximo
                    - img
          - generic:
            - generic:
              - generic: Salvando…
      - generic:
        - button:
          - generic:
            - img
          - generic:
            - generic: Chat SST
            - generic: Chat da SOPHIE
  - region "Notifications alt+T"
  - alert
  - dialog "Primeiros passos" [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - img [ref=e6]
        - generic [ref=e9]:
          - heading "Primeiros passos" [level=2] [ref=e10]
          - heading "Primeiros passos" [level=2] [ref=e11]
          - paragraph [ref=e12]: Passo 2 de 4
          - paragraph [ref=e13]: Passo 2 de 4
      - button "Fechar modal" [ref=e14]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - heading "Documentos e Registros" [level=2] [ref=e23]
      - paragraph [ref=e24]: Crie APRs, PTAs, DDS, Checklists, Ordens de Serviço e Relatórios Diários de Obra. Todos com suporte a assinatura digital e exportação em PDF.
      - generic [ref=e25]:
        - generic [ref=e26]:
          - img [ref=e28]
          - text: Dica rápida
        - paragraph [ref=e31]: Acesse pelo menu lateral em "Documentos Operacionais"
    - generic [ref=e32]:
      - generic [ref=e33]:
        - button "Passo 1" [ref=e34]
        - button "Passo 2" [ref=e35]
        - button "Passo 3" [ref=e36]
        - button "Passo 4" [ref=e37]
      - generic [ref=e38]:
        - button "Anterior" [ref=e39]:
          - img [ref=e41]
          - text: Anterior
        - button "Próximo" [active] [ref=e43]:
          - text: Próximo
          - img [ref=e45]
```

# Test source

```ts
  174 |             nome: "Multimetro",
  175 |             company_id: companyId,
  176 |             createdAt: "2026-05-22T00:00:00.000Z",
  177 |             updatedAt: "2026-05-22T00:00:00.000Z",
  178 |           },
  179 |         ]),
  180 |       );
  181 |     }
  182 |     if (pathName === "/machines") {
  183 |       return json(
  184 |         paginated([
  185 |           {
  186 |             id: "99999999-9999-4999-8999-999999999999",
  187 |             nome: "Plataforma elevatoria",
  188 |             company_id: companyId,
  189 |             createdAt: "2026-05-22T00:00:00.000Z",
  190 |             updatedAt: "2026-05-22T00:00:00.000Z",
  191 |           },
  192 |         ]),
  193 |       );
  194 |     }
  195 |     if (pathName === "/sites") return json(paginated([site]));
  196 |     if (pathName === "/users") return json(paginated([user]));
  197 |     if (pathName === "/aprs/activity-templates") {
  198 |       return json([
  199 |         {
  200 |           tipo_atividade: "manutencao_eletrica",
  201 |           label: "Manutencao eletrica",
  202 |           descricao: "Servico em circuito desenergizado",
  203 |         },
  204 |       ]);
  205 |     }
  206 |     if (pathName === "/aprs/activity-templates/manutencao_eletrica") {
  207 |       return json({
  208 |         tipo_atividade: "manutencao_eletrica",
  209 |         label: "Manutencao eletrica",
  210 |         descricao: "Servico em circuito desenergizado",
  211 |         risk_items: [],
  212 |       });
  213 |     }
  214 |     if (pathName === "/aprs" && method === "GET") return json(paginated([]));
  215 |     if (pathName === "/aprs" && method === "POST") {
  216 |       capturedCreatePayload = request.postDataJSON();
  217 |       return json(
  218 |         {
  219 |           id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  220 |           numero: capturedCreatePayload.numero,
  221 |           titulo: capturedCreatePayload.titulo,
  222 |           descricao: capturedCreatePayload.descricao,
  223 |           data_inicio: capturedCreatePayload.data_inicio,
  224 |           data_fim: capturedCreatePayload.data_fim,
  225 |           status: "Pendente",
  226 |           company_id: companyId,
  227 |           site_id: capturedCreatePayload.site_id,
  228 |           elaborador_id: capturedCreatePayload.elaborador_id,
  229 |           activities: [],
  230 |           risks: [],
  231 |           epis: [],
  232 |           tools: [],
  233 |           machines: [],
  234 |           participants: [],
  235 |           risk_items: [],
  236 |           created_at: "2026-05-22T00:00:00.000Z",
  237 |           updated_at: "2026-05-22T00:00:00.000Z",
  238 |         },
  239 |         201,
  240 |       );
  241 |     }
  242 | 
  243 |     return route.fulfill({
  244 |       status: 404,
  245 |       contentType: "application/json",
  246 |       body: JSON.stringify({ message: `Unhandled smoke route ${method} ${pathName}` }),
  247 |     });
  248 |   });
  249 | 
  250 |   await page.goto(
  251 |     `/dashboard/aprs/new?company_id=${companyId}&site_id=${siteId}&user_id=${userId}`,
  252 |     { waitUntil: "domcontentloaded" },
  253 |   );
  254 | 
  255 |   await page.getByLabel("Número da APR").fill("APR-SMOKE-001");
  256 |   await page.getByLabel("Título da APR").fill("APR Smoke Completa");
  257 |   await page.getByLabel("Descrição/Escopo").fill(
  258 |     "Validação smoke do fluxo de criação da APR.",
  259 |   );
  260 |   await page.locator('select[name="tipo_atividade"]').selectOption("manutencao_eletrica");
  261 |   await page.locator('select[name="turno"]').selectOption("Diurno");
  262 |   await page.getByLabel("Frente de trabalho").fill("Frente elétrica 01");
  263 |   await page.getByLabel("Área / setor de risco").fill("Subestação");
  264 |   await page.getByLabel("Local detalhado de execução").fill(
  265 |     "Painel principal da subestação, setor leste.",
  266 |   );
  267 |   await page.getByLabel("Responsável técnico").fill("TST Smoke APR");
  268 |   await page.getByLabel("Registro profissional").fill("TST-0001");
  269 |   await page.getByLabel("Empresa").selectOption(companyId);
  270 |   await page.getByLabel("Site/Obra").selectOption(siteId);
  271 |   await page.getByLabel("Elaborador").selectOption(userId);
  272 | 
  273 |   await page.getByRole("button", { name: /Próximo/ }).click();
> 274 |   await page.getByText("Grade operacional da APR").waitFor({ timeout: 20000 });
      |                                                    ^ TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
  275 |   if ((await page.locator('[name="itens_risco.0.atividade_processo"]').count()) === 0) {
  276 |     await page.getByRole("button", { name: /Adicionar linha/ }).click();
  277 |   }
  278 |   await page.locator('[name="itens_risco.0.atividade_processo"]').fill("Bloqueio e teste elétrico");
  279 |   await page.locator('[name="itens_risco.0.etapa"]').fill("Preparação");
  280 |   await page.locator('[name="itens_risco.0.agente_ambiental"]').fill("Energia elétrica");
  281 |   await page.locator('[name="itens_risco.0.condicao_perigosa"]').fill("Contato com partes energizadas");
  282 |   await page.locator('[name="itens_risco.0.fontes_circunstancias"]').fill("Painel de distribuição");
  283 |   await page.locator('[name="itens_risco.0.possiveis_lesoes"]').fill("Choque elétrico e queimadura");
  284 |   await page.locator('[name="itens_risco.0.probabilidade"]').selectOption("2");
  285 |   await page.locator('[name="itens_risco.0.severidade"]').selectOption("3");
  286 |   await page.locator('[name="itens_risco.0.medidas_prevencao"]').fill(
  287 |     "Bloquear energia, testar ausência de tensão e sinalizar a área.",
  288 |   );
  289 |   await page.locator('[name="itens_risco.0.epc"]').fill("Barreira e sinalização");
  290 |   await page.locator('[name="itens_risco.0.epi"]').fill("Luva isolante e protetor facial");
  291 |   await page.locator('[name="itens_risco.0.responsavel"]').fill("TST Smoke APR");
  292 |   await page.locator('[name="itens_risco.0.prazo"]').fill("2026-05-23");
  293 |   await page.locator('[name="itens_risco.0.status_acao"]').selectOption("Aberta");
  294 | 
  295 |   await page.getByRole("button", { name: /Próximo/ }).click();
  296 |   await page.getByText("Revisão final obrigatória").first().waitFor({ timeout: 20000 });
  297 |   await page.getByRole("button", { name: /^Salvar APR$/ }).last().click();
  298 |   await page.waitForURL("**/dashboard/aprs", { timeout: 30000 });
  299 | 
  300 |   expect(capturedCreatePayload).toBeTruthy();
  301 |   expect(capturedCreatePayload.company_id).toBeUndefined();
  302 |   expect(capturedCreatePayload.site_id).toBe(siteId);
  303 |   expect(capturedCreatePayload.elaborador_id).toBe(userId);
  304 |   expect(capturedCreatePayload.risk_items).toHaveLength(1);
  305 |   expect(pageErrors).toEqual([]);
  306 |   expect(consoleErrors).toEqual([]);
  307 | 
  308 |   fs.mkdirSync(outputDir, { recursive: true });
  309 |   await page.screenshot({
  310 |     path: path.join(outputDir, "apr-create-smoke.png"),
  311 |     fullPage: true,
  312 |   });
  313 |   fs.writeFileSync(
  314 |     path.join(outputDir, "apr-create-smoke-payload.json"),
  315 |     JSON.stringify(capturedCreatePayload, null, 2),
  316 |   );
  317 | });
  318 | 
  319 | 
  320 | 
```