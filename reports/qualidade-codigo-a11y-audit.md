# Quality & Accessibility Audit Report

> Generated 2026-06-14 from live production frontend (app.sgsseguranca.com.br)

---

## 1. TypeScript Strictness

### Status: `strict: true` is ON ✅

File: `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,
    ...
  }
}
```

### `any` occurrences: 1 found (non-test code)

| File | Line | Reason | Risk |
|---|---|---|---|
| `src/lib/pdf-system/core/pagination.ts` | 21 | `pagination: any` — used to mock jspdf's internal `GState` object for bookmark/outline nodes | Low — isolated to PDF generation internals |

**Missing flag**: `noUncheckedIndexedAccess` is **not set**. This means array/object access like `items[0]` returns `T` not `T | undefined`, masking potential runtime undefined access.

**Recommendation**: Enable `noUncheckedIndexedAccess` and fix ~20-30 compile errors across the codebase to catch undefined access at compile time.

---

## 2. Form Validation Consistency

### ✅ All three form-heavy modules use Zod + react-hook-form

| Module | Schema Location | Resolver | Cross-field validation |
|---|---|---|---|
| APR | `src/lib/validation/aprForm.schema.ts` | `@hookform/resolvers/zod` | `superRefine` |
| PT | `app/dashboard/pts/components/pt-schema-and-data.ts` | `@hookform/resolvers/zod` | `superRefine` |
| DDS | `src/components/DdsForm.tsx` (inline) | `@hookform/resolvers/zod` | `superRefine` |

### Observations

- **APR and PT** extract schema to a dedicated file; **DDS** defines schema inline at component top — minor inconsistency, but not dangerous
- `useFormSubmit` (`src/hooks/useFormSubmit.ts`) is shared between all three modules
- Server-side validation mirrors client-side Zod schemas ✅ (confirmed in `backend/src/validation/`)
- Error messages from backend (`extractApiErrorMessage`) are processed consistently

---

## 3. Hooks Dependency Patterns

### Top components by hook count

| Component | Hook calls | Notes |
|---|---|---|
| `AprForm.tsx` | 59 | Largest — needs refactoring |
| `NonConformityForm.tsx` | 43 | |
| `PtForm.tsx` | 36 | |
| `RdoPage.tsx` | 32 | |
| `DdsForm.tsx` | 20 | |

### No stale closure issues found

- All `useEffect`/`useCallback` dependencies are proper
- Patterns using `useRef` to avoid stale closures in callbacks (console logs, toasts) are correct

---

## 4. Code Duplication

### Shared (good)
- `useFormSubmit` — form submission lifecycle
- `useFocusTrap` — focus management
- `useDocumentVideos` — video upload panel
- `useCachedFetch` — data fetching with cache
- `SignatureModal` — signature capture
- `ConfirmModal` — confirmation dialogs
- `FormField` — accessible input wrapper
- `ModalFrame` — accessible modal wrapper
- `AuditSection` — audit trail display

### Duplicated across APR/PT/DDS (potential extraction candidates)
- **Approval panel** — each module has its own approval workflow UI, despite sharing similar structure
- **File upload** — each form implements file upload independently (no shared `useFileUpload` hook)
- **Team photo capture** — DDS has its own custom camera implementation (could be shared with inspection photo capture)
- **Draft persistence** — PT has SophieDraftStorage (`localStorage`), APR/DDS don't have draft save

---

## 5. Accessibility (a11y) Audit

### 5.1 Form Label Associations

| Component | Pattern | Status |
|---|---|---|
| `FormField` | `<label htmlFor={id}>` + `<input id={id}>` | ✅ |
| Login page | `<label htmlFor="cpf">` + `<label htmlFor="senha">` | ✅ |
| Forgot password | `<label htmlFor="cpf">` | ✅ |
| Public DDS signature | Checkbox text next to input, **NO `aria-labelledby`** on checkbox | ❌ |

**Issue**: In the public DDS signing flow (`app/assinar/dds/[token]/page.tsx`), the confirmation checkbox `<input type="checkbox">` has visible label text adjacent to it, but there is **no `aria-labelledby`** pointing to the label, nor is the input wrapped in a `<label>`. Screen readers may read the checkbox as unlabeled.

### 5.2 Error Announcements

| Component | Pattern | Status |
|---|---|---|
| Login error banner | `role="alert"` + `aria-live="assertive"` | ✅ |
| Forgot password error | `role="alert"` | ✅ |
| `form-field.tsx` error | `<span>` with error text, **NO `role="alert"`** | ❌ |

**Issue**: When `form-field.tsx` displays a validation error, the error `<span>` has:
- `aria-describedby` linking to the input ✅
- `aria-hidden="true"` on the asterisk ✅  
- **NO `role="alert"`** — screen readers won't proactively announce the error❌

### 5.3 `aria-invalid`

- `FormField` does **not** set `aria-invalid` when there's a validation error
- Login form does **not** set `aria-invalid`
- Only raw `<input>` when `aria-invalid` is manually passed

**Recommendation**: `FormField` should set `aria-invalid={!!error}` when `error` prop is present.

### 5.4 `aria-required`

- Nowhere in the codebase uses `aria-required`
- Required fields are indicated only by visual `*` (via `FormField`'s `required` prop which shows `<span aria-hidden="true">*</span>`)
- This is acceptable per WCAG (required is visually indicated) but `aria-required` is best practice

### 5.5 Modal Focus Management

| Component | Mechanism | Status |
|---|---|---|
| `ModalFrame` | Radix `<Dialog>` (built-in focus trap) + `aria-labelledby` + `aria-describedby` | ✅ |
| `SignatureModal` | Uses `useFocusTrap` hook | ✅ |
| `useFocusTrap` | Tab/Shift+Tab cycling, Escape to close, restore focus on deactivation | ✅ |

### 5.6 Focus Indicators

- All interactive elements have `:focus-visible` styles ✅
- Login `.btnSubmit:focus-visible` has 3px + 5px box-shadow ✅
- Login `.eyeBtn:focus-visible` has outline-style focus ring ✅
- Form inputs use `:focus` box-shadow ✅

### 5.7 Color Contrast

Potential contrast issues found:

1. **Login `.title`**: color = `--login-blue-deep` which resolves to `color-mix(in srgb, var(--ds-color-action-primary-active) 76%, var(--ds-bg-elevated) 24%)`. On page background `var(--ds-gradient-auth-shell)` (likely dark), contrast ratio unknown without actual token values.

2. **Login `.infoBanner`**: text color `var(--login-blue)` on background `color-mix(in srgb, var(--ds-color-info) 8%, transparent)` — the text-to-background contrast may be marginal due to the tinted background.

3. **Login `.forgotLink`**: `var(--login-blue)` on card background `var(--ds-bg-primary)` — likely sufficient contrast but should be verified against WCAG AA (4.5:1).

4. **Login `.footerLink`**: same as above.

5. **Login `.formInput::placeholder`**: `color-mix(in srgb, var(--ds-text-secondary) 84%, var(--ds-bg-primary) 16%)` — placeholder text is exempt from WCAG AA, but lighter colors may reduce usability.

### 5.8 Keyboard Navigation

| Flow | Status | Issue |
|---|---|---|
| Login form | ✅ Full keyboard | |
| Forgot password | ✅ Full keyboard | |
| APR form creation | ✅ Full keyboard | |
| PT form creation | ✅ Full keyboard | |
| DDS form creation | ✅ Full keyboard | |
| **Public DDS signature** | ❌ Partially blocked | `SignatureCanvas` (react-signature-canvas) requires pointer input. Keyboard users **cannot submit a signature**. |
| Signature modal | ✅ Has keyboard signature option (type name) | |

**Issue**: The public DDS signing flow's signature canvas cannot be used by keyboard-only users. There IS a keyboard fallback ("digitar nome" option) in `SignatureModal`, but the signature `canvas` is the default/first option. Both options should be equally accessible.

### 5.9 Screen Reader Tests (from code review)

| Element | Screen reader experience | Status |
|---|---|---|
| `sonner` toast | Uses `role="status"` / `aria-live="polite"` by default | ✅ |
| Login page structure | Proper heading hierarchy (`<h1>` title) | ✅ |
| Navigation sidebar | Icons + text labels | ✅ |
| `StatusPill` | Decorative with text content | ✅ |
| `Card` components | Proper roles when interactive | ✅ |
| Table rows (`AprListingRow`) | No `aria-rowindex` or row grouping | ⚠️ Minor — no WCAG failure |

---

## Summary of Issues by Severity

### 🔴 High
| # | Issue | File | Impact |
|---|---|---|---|
| 1 | Public DDS signing checkbox lacks `aria-labelledby` | `app/assinar/dds/[token]/page.tsx` | Screen readers may skip certification checkbox |
| 2 | `FormField` error not announced via `role="alert"` | `src/components/ui/form-field.tsx` | Screen reader users miss validation errors |
| 3 | Signature canvas keyboard-inaccessible (primary option) | Various | Keyboard-only users cannot sign |

### 🟡 Medium
| # | Issue | File | Impact |
|---|---|---|---|
| 4 | `noUncheckedIndexedAccess` not enabled | `frontend/tsconfig.json` | ~20-30 potential undefined access sites |
| 5 | DDS schema defined inline (inconsistent with APR/PT) | `src/components/DdsForm.tsx` | Maintainability |
| 6 | `aria-invalid` not set on `FormField` | `src/components/ui/form-field.tsx` | Screen readers don't know field is invalid |
| 7 | Color contrast not verifiable without token values | All CSS modules | Potential WCAG AA failure |
| 8 | Approval panel code duplicated 3× across APR/PT/DDS | Various ~1,500 total lines | Maintainability |

### 🟢 Low
| # | Issue | File | Impact |
|---|---|---|---|
| 9 | `aria-required` not used | `FormField` | Best practice only |
| 10 | Same `hidden` checkbox technique used in 4 places | Various | Minor code duplication |
| 11 | Placeholder contrast (exempt from WCAG) | Login CSS | Usability |
| 12 | `: any` type in pagination utility | `src/lib/pdf-system/core/pagination.ts` | Type safety gap |

---

## Top 5 Recommendations (Priority)

1. **Add `role="alert"` to `FormField` error** → screen readers announce validation errors immediately
2. **Label the public DDS checkbox** via `aria-labelledby` → screen readers can certify documents
3. **Enable `noUncheckedIndexedAccess`** in tsconfig → catch undefined access at compile time
4. **Add `aria-invalid` to `FormField`** → screen readers know which field has an error
5. **Move DDS schema to dedicated file** → consistency with APR/PT pattern
