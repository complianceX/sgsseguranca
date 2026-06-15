# Component Library — SGS Frontend

> 55+ componentes React organizados por categoria.
> Stack: Next.js 16 + React 19 + Tailwind CSS + TypeScript.

---

## UI Primitives (`frontend/src/components/ui/`)

### `badge.tsx`
Badge de status com cores variantes.
```tsx
<Badge variant="success" />
<Badge variant="warning" />
<Badge variant="danger" />
<Badge variant="info" />
<Badge variant="neutral" />
```

### `button.tsx`
Botão com variantes, tamanhos, loading state.
```tsx
<Button variant="primary" size="md" loading disabled />
```
**Variants:** `primary`, `secondary`, `danger`, `ghost`, `link`
**Sizes:** `sm`, `md`, `lg`

### `card.tsx`
Card container com header, body, footer.
```tsx
<Card>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

### `confirm-modal.tsx`
Modal de confirmação para ações destrutivas.
```tsx
<ConfirmModal
  open
  onConfirm
  onCancel
  title="Confirmar exclusão"
  description="Esta ação não pode ser desfeita"
  confirmLabel="Excluir"
  variant="danger"
/>
```

### `form-field.tsx`
Wrapper de campo de formulário com label, erro, helper.
```tsx
<FormField label="Nome" error="Campo obrigatório" helper="Nome completo">
  <input />
</FormField>
```

### `inline-callout.tsx`
Callout inline para avisos, erros, sucessos.
```tsx
<InlineCallout variant="warning" message="Ação necessária" />
```
**Variants:** `info`, `success`, `warning`, `danger`

### `input.tsx`
Input padronizado com prefixo, sufixo, máscara.
```tsx
<Input
  label="CPF"
  mask="cpf"
  error={errors.cpf}
  placeholder="000.000.000-00"
/>
```

### `modal-frame.tsx`
Modal reutilizável com overlay, header, body, footer.
```tsx
<ModalFrame open onClose size="lg">
  <ModalFrame.Header>Title</ModalFrame.Header>
  <ModalFrame.Body>Content</ModalFrame.Body>
  <ModalFrame.Footer>Actions</ModalFrame.Footer>
</ModalFrame>
```

### `select.tsx`
Select nativo estilizado.
```tsx
<Select
  label="Status"
  options={[{ value: 'ativo', label: 'Ativo' }]}
  value={status}
  onChange={setStatus}
/>
```

### `skeleton.tsx`
Placeholder de loading.
```tsx
<Skeleton className="h-4 w-full" />
<Skeleton variant="text" />
<Skeleton variant="circular" />
<Skeleton variant="rectangular" />
```

### `state.tsx`
Estados de tela (empty, error, loading).
```tsx
<State.Empty icon={Search} title="Nada encontrado" />
<State.Error message="Erro ao carregar" onRetry={refetch} />
<State.Loading />
```

### `status-pill.tsx`
Pílula colorida de status.
```tsx
<StatusPill status="ativo" />
<StatusPill status="pendente" />
<StatusPill status="concluido" />
```
Mapeia automaticamente `status` → cor via `statusConfig` global.

### `summary-metric-card.tsx`
Card de métrica com valor, label, tendência.
```tsx
<SummaryMetricCard
  label="APRs abertas"
  value={42}
  trend={{ direction: 'up', value: 12 }}
/>
```

### `table.tsx`
Tabela genérica com sort, paginação, seleção.
```tsx
<Table
  columns={columns}
  data={data}
  sortable
  selectable
  onRowClick={handleClick}
/>
```

### `textarea.tsx`
Textarea padronizado.
```tsx
<Textarea label="Descrição" rows={4} maxLength={500} />
```

---

## Layout (`frontend/src/components/layout/`)

### `ListPageLayout`
Layout padrão para páginas de listagem.
```tsx
<ListPageLayout
  title="APRs"
  description="Lista de Análises Preliminares de Risco"
  action={<Button href="/aprs/new">Nova APR</Button>}
  filters={<AprFilters />}
  loading={isLoading}
  empty={data.length === 0}
>
  <AprTable data={data} />
  <PaginationControls page={page} total={total} />
</ListPageLayout>
```

### `FormPageLayout`
Layout padrão para páginas de formulário.
```tsx
<FormPageLayout
  title="Nova APR"
  breadcrumb={[{ label: 'APRs', href: '/aprs' }, { label: 'Nova' }]}
  loading={isSubmitting}
>
  <AprForm onSubmit={handleSubmit} />
</FormPageLayout>
```

### `PageHeader`
Cabeçalho de página com breadcrumb e ações.
```tsx
<PageHeader
  title="Detalhes da APR"
  breadcrumb={[{ label: 'APRs', href: '/aprs' }, { label: id }]}
  actions={[<Button key="edit">Editar</Button>]}
/>
```

---

## Dashboard (`frontend/src/components/dashboard/`)

| Componente | Descrição |
|---|---|
| `DashboardHero` | Hero do dashboard com saudação e resumo |
| `DashboardKPIs` | Grid de KPIs (APRs, DDS, PTs, NCs) |
| `DashboardPrimaryActions` | Ações rápidas (nova APR, novo DDS) |
| `DashboardWorkArea` | Área de trabalho principal do dashboard |
| `DashboardSectionBoundary` | Boundary loading/error para seções |
| `ActivityFeed` | Feed de atividades recentes |
| `PendingQueue` | Filas de pendências do usuário |
| `SSTScoreRings` | Anéis de score SST da empresa |
| `SiteCompliance` | Compliance por obra/site |
| `DailyReportButton` | Botão de relatório diário |
| `LastUpdatedLabel` | Label "última atualização" |
| `LazyChart` | Chart carregado sob demanda |

---

## Domain Components

### DDS (`frontend/src/components/dds/`)
| Componente | Descrição |
|---|---|
| `DdsForm` | Formulário de DDS com tema, conteúdo, participantes |
| `DdsThemeLibraryModal` | Biblioteca de temas de DDS |

### RDO (`frontend/src/components/rdos/`)
| Componente | Descrição |
|---|---|
| `RDO components` | Componentes específicos de RDO |

### Document Videos (`frontend/src/components/document-videos/`)
Componentes para upload e exibição de vídeos em documentos.

---

## Shared Components

| Componente | Descrição |
|---|---|
| `ActionMenu` | Menu de ações com dropdown |
| `ActivityForm` | Formulário de atividade |
| `AIButton` | Botão de ação com IA Sophie |
| `AIChatPanel` | Painel de chat com Sophie |
| `AiConsentModal` | Modal de consentimento LGPD para IA |
| `ApiStatusBanner` | Banner de status da API |
| `AppErrorBoundary` | Error boundary global |
| `ArrForm` | Formulário de ARR |
| `AuditForm` | Formulário de auditoria |
| `AuditSection` | Seção de auditoria em formulários |
| `CommandPalette` | Paleta de comandos (Ctrl+K) |
| `CompanyForm` | Formulário de empresa |
| `CompanyInviteModal` | Modal de convite de empresa |
| `CompanySelectorModal` | Seletor de empresa (multi-tenant) |
| `DevCacheReset` | Botão de reset de cache (dev) |
| `DdsThemeLibraryModal` | Biblioteca de temas DDS |
| `DidForm` | Formulário de DID |
| `DocumentEmailModal` | Modal de envio de documento por email |
| `EpiForm` | Formulário de EPI |
| `FirstAccessConsentModal` | Modal de consentimento primeiro acesso |
| `Header` | Header da aplicação com menu |
| `LazyChart` | Chart carregado lazy |
| `MachineForm` | Formulário de máquina |
| `MobileFieldNav` | Navegação de campos mobile |
| `NonConformityForm` | Formulário de não conformidade |
| `OnboardingModal` | Modal de onboarding |
| `PaginationControls` | Controles de paginação |
| `PwaBootstrap` | Bootstrap PWA |
| `ResponsiveToaster` | Toaster responsivo |
| `SendMailModal` | Modal de envio de email |
| `SentryUserContext` | Contexto do usuário no Sentry |
| `SgsInsights` | Insights SGS |
| `Sidebar` | Sidebar de navegação |
| `SignatureModal` | Modal de assinatura |
| `SignaturesPanel` | Painel de assinaturas |
| `SiteForm` | Formulário de obra |
| `SophieStatusCard` | Card de status da Sophie |
| `StaleCacheBanner` | Banner de cache desatualizado |
| `StoredFilesPanel` | Painel de arquivos armazenados |
| `ToolForm` | Formulário de ferramenta |
| `TrainingForm` | Formulário de treinamento |
| `UserModuleAccessManager` | Gerenciador de acesso a módulos |

---

## API Client (`frontend/src/lib/api.ts`)

Wrapper centralizado para chamadas HTTP:
```tsx
import { api } from '@/lib/api';

// GET
const aprs = await api.get('/aprs', { params: { page: 1, limit: 20 } });

// POST
const nova = await api.post('/aprs', { titulo, descricao });

// PATCH
await api.patch(`/aprs/${id}`, { status: 'Aprovada' });

// DELETE
await api.delete(`/aprs/${id}`);
```
Gerencia headers de auth, `x-company-id`, CSRF, tratamento de erros.

---

## Services (`frontend/src/services/`)

Cada módulo tem um service tipado:
```tsx
// frontend/src/services/aprService.ts
export const aprService = {
  list: (params) => api.get('/aprs', { params }),
  getById: (id) => api.get(`/aprs/${id}`),
  create: (data) => api.post('/aprs', data),
  update: (id, data) => api.patch(`/aprs/${id}`, data),
  remove: (id) => api.delete(`/aprs/${id}`),
  approve: (id, data) => api.patch(`/aprs/${id}/approve`, data),
  reject: (id, data) => api.patch(`/aprs/${id}/reject`, data),
  finalize: (id) => api.patch(`/aprs/${id}/finalize`, data),
  generatePdf: (id) => api.post(`/aprs/${id}/generate-final-pdf`),
};
```

---

## Hooks

| Hook | Descrição |
|---|---|
| `useAuth()` | Autenticação e permissões do usuário |
| `useDebounce` | Debounce para campos de busca |
| `useIsMobile` | Detecção de mobile |

---

## Permissions (`frontend/src/lib/permissions.ts`)

```tsx
export const Permission = {
  CAN_CREATE_APR: 'can_create_apr',
  CAN_APPROVE_APR: 'can_approve_apr',
  CAN_REJECT_APR: 'can_reject_apr',
  CAN_FINALIZE_APR: 'can_finalize_apr',
  CAN_MANAGE_USERS: 'can_manage_users',
  CAN_USE_AI: 'can_use_ai',
  // ... todas as permissões do sistema
} as const;
```

---

## Route Config (`frontend/src/lib/route-config.ts`)

```tsx
export const ADMIN_ROUTES = ['/admin', '/companies', '/users'];
export const PERMISSION_ROUTE_EXCEPTIONS = {
  '/aprs/new': ['can_create_apr'],
  '/aprs/:id/approve': ['can_approve_apr'],
};
```
