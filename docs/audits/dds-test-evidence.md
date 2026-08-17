# DDS Test Evidence

Data: 2026-08-16. Fixtures sintéticas; nenhum commit/push foi realizado.

## Passing evidence

| Escopo | Resultado |
| --- | --- |
| Backend DDS/signatures/DTO focused | 3 suites, 84 testes PASS |
| Frontend DDS/PDF focused | baseline 4 suites/25 PASS; current 5-suite regression slice 17 PASS, inclui Golden DDS |
| Final focused regression | PASS: backend 5 suites/98 testes; frontend 5 suites/31 testes |
| Frontend Playwright mobile público | 18/18 PASS em 6 viewports; login, recuperação e redirect |
| Backend `npm run type-check` | PASS |
| Backend `npm run build` | PASS |
| Frontend `npx tsc --noEmit` | PASS |
| Frontend `npm run build` | PASS; Next gerou 91 páginas estáticas |
| Focused backend ESLint | 0 errors, 1 warning em mock de teste |
| Backend migration check | PASS; 299 migrations oficiais no worktree reconciliado |
| Migration clean rebuild | PASS: banco vazio com 299 migrations, 135 tabelas, 261 policies e 4 tabelas DDS com FORCE RLS |
| DR restore bundle 299 | PASS: alvo `sgs_loadtest_dr_20260816_299_final`, dump/restore do estado 299, 135 tabelas, 261 policies, 255 FKs, 927 índices e `sgs_app` sem bypass RLS |
| Authenticated API/browser DDS | PASS crítico: login API 201, `/auth/me` 200, logout/pós-logout 201/401; browser real criou, publicou e assinou DDS sintético |
| Authenticated approval workflow | PASS runtime: TST, Supervisor e Administrador aprovaram etapas 1/2/3 com HTTP 201; estado final `3/3` e `auditado` |
| Governed PDF browser | PASS runtime: ação oficial emitiu uma aba `blob:` reconhecida como `application/pdf`; pós-condições SQL de key/timestamp/hash confirmadas |
| Axe authenticated matrix | BLOCKED/NO-GO: Login 0; Dashboard/lista/edição reportaram violações serious/moderate (`color-contrast`, `definition-list`, `document-title`, `aria-hidden-focus`) |
| Gitleaks tracked scope | PASS limitado: source 0; arquivos tracked `.env*.example` 0; `gitleaks protect` no diff 0; worktree/history permanecem triados |
| OSV backend/frontend lockfiles | nenhum issue reportado |
| Trivy backend/frontend lockfiles | 0 vulnerabilidades reportadas |

## Remaining gates

| Prova obrigatória | Resultado | Motivo |
| --- | --- | --- |
| Integration/E2E local | BLOCKED | Docker não está disponível localmente; matriz HTTP dirigida foi executada na VPS |
| Frontend E2E/mobile/accessibility | PASS workflow / BLOCKED accessibility | browser real cobriu login, criação, publicação, assinatura e aprovação TST/Supervisor/Admin; mobile autenticado separado não provado; Axe encontrou violações serious/moderate |
| Postgres RLS adversarial | PASS | same-tenant/cross-tenant/missing-context em SELECT, INSERT, UPDATE e DELETE para DDS/participants/signatures; mutações em rollback; pós-contagens preservadas |
| Redis/rate-limit | PASS | `401 x5` seguido de `429 x2` em login sintético |
| Load/performance | PASS parcial | 100 GET autenticados/20 concorrentes: 80x `200`, 20x `429`, p95 290 ms |
| Migration status/rebuild | PASS rebuild/DR 299 | 0374/0375/0376 reconciliadas por hash; EPI forward-only 0377; dump/restore do estado 299 validado em alvo novo |
| DR restore | PASS sintético | dump do estado 299 e restore em `sgs_loadtest_dr_20260816_299_final`; role app sem bypass, dados/schema/RLS validados; storage externo não usado |
| Golden DDS estrutural | PASS | gerador real, 30 participantes, PDF 383 KB e header PDF válido |
| Golden DDS visual | PASS local; PASS browser governado | 5/30/100/300 participantes, 61 páginas renderizadas, 0 páginas vazias; emissão oficial browser abriu `blob:` `application/pdf` e banco confirmou key/timestamp/hash |
| HTTP cross-tenant/site | PASS dirigido | `200/403` cross-tenant; usuário site-only `404/404` cross-site |
| Storage/ACL | PASS aplicação/BLOCKED provider | grant autorizado `200`, download `%PDF-`, tamper/expiry/replay `403`, cross-tenant sem emissão; storage é local FS, não provider externo |
| Video upload stress | PASS sintético/PARTIAL memória | exato 75 MiB `201`, +1 `413`, 2x10 MiB concorrentes `201`, temp `0`; controller ainda materializa Buffer |
| Gitleaks | BLOCKED/NO-GO | source 0; tracked sensíveis/diff 0; worktree 191 e histórico 13 continuam com findings em env/log/cache/build sem abrir valores; rotação/revogação não foi comprovada |

## Live test VPS evidence — 2026-08-16

Ambiente isolado confirmado: API, Postgres e Redis healthy; `APP_ENV=loadtest`; `sgs_app` com `rolbypassrls=false`.

| Caso | Resultado |
| --- | --- |
| Forensic RLS/context/missing tenant/login event | PASS |
| DDS synthetic create | HTTP 201 |
| Own DDS GET | HTTP 200 |
| Cross-tenant DDS GET | HTTP 403 |
| Cross-tenant PDF | HTTP 403 |
| Generic audit mass assignment | HTTP 400 — PASS na imagem endurecida |
| Nonparticipant direct signature | HTTP 403 — PASS na imagem endurecida |
| Direct signature replay sequential/concurrent | `201/409` em ambos — PASS |
| Cross-site site-only GET/signature | `404/404` — PASS deny |
| Redis login throttle | `401 x5`, `429 x2` — PASS |
| DR synthetic restore | PASS atual; dump/restore do estado 299 em alvo final, 12 DDS, 10 participants, 130 signatures, 1229 forensic events |
| Browser real auth DDS | PASS workflow | login real, dashboard, create, publish, assinatura e aprovação TST/Supervisor/Admin; 3 etapas HTTP 201, estado `auditado`; mobile autenticado não provado |
| Browser PDF final | PASS governado | emissão oficial; aba `blob:` `application/pdf`; pós-condições SQL key/timestamp/hash |
| Synthetic cleanup | signature HTTP 200; DDS soft-delete HTTP 200 |

Os dois failures da primeira rodada foram reproduzidos como regressão do runtime antigo. Após o rebuild controlado, ambos passaram; a prova live atual não usa produção, dados reais, tokens reais ou storage real. O fixture temporário de roles/CPF foi restaurado ao estado original.

## Final release authorization — 2026-08-16

O veredito binário permanece **NO-GO** nos três gates finais. O scan Git/history redigido encontrou 13 findings históricos (6 `curl-auth-header`, 4 `generic-api-key`, 3 `jwt`); source atual, exemplos tracked e diff/protect permaneceram em 0. O inventário local amplo anterior de 191 artefatos continua separado e sem fechamento formal. A VPS usa `LOCAL_DOCUMENT_STORAGE_DIR`, sem provider externo ativo. O rerun Axe autenticado completo não foi certificado porque o fixture retornou `401`; as correções estruturais têm apenas evidência estática até novo login sintético funcional.

Classificação, owners e provas mínimas estão em [dds-final-release-authorization.md](dds-final-release-authorization.md).

Regressão frontend final desta rodada: `154` suítes executadas, `872` testes PASS, `2` testes skipped e `1` suíte skipped; nenhum failure. O security smoke delta e o Axe autenticado final não foram executados até o fim porque dependem dos blockers externos/fixture.

## Regra de regressão

Os testes verdes e a VPS fecham os casos executados. Permanecem bloqueados a ACL de provider externo, a correção das violações Axe e os findings Gitleaks em artifacts/env/histórico. O workflow autenticado de três perfis e o PDF final governado browser passaram; o DR 299 e a matriz RLS mutável foram executados no alvo isolado.

## Runtime closure addendum — provider e Axe

Evidência posterior executada na VPS isolada: provider MinIO S3-compatible privado passou `presigned 201 → PUT 200 → complete 201`, hash/magic bytes, download autorizado `200/%PDF-`, anônimo `403`, tamper `403`, cross-tenant `403` sem URL e expiração provider `200→403`. O bucket de teste foi limpo ao final (`0` objetos).

A suíte Axe autenticada foi criada em `frontend/e2e/dds-axe-authenticated.spec.ts` e passou em `3/3` viewports (`390x844`, `430x932`, `1440x900`) com `0` violações `serious/critical` em Dashboard, lista DDS e formulário. A suíte de teclado mobile passou `2/2`. O achado desktop de contraste no nome do usuário foi corrigido em `frontend/src/components/Sidebar.tsx`.

O veredito global continua `NO-GO` exclusivamente pelo gate Gitleaks/secrets: source e `ops/dev` estão sem findings na varredura redigida desta rodada, mas os `191` artifacts locais e `13` históricos anteriores ainda exigem classificação, rotação/revogação formal e scan final.
