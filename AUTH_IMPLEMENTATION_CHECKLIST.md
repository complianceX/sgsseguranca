# CORRIGIR ERROS 401/403 - PASSO A PASSO

**Problema:** Todos os requests retornam 401 ou 403 porque falta o header `x-company-id`

**Solução:** Implementar fluxo de login com seleção de empresa

---

## 📋 IMPLEMENTAÇÃO CHECKLIST

### PASO 1: Setup do Axios Interceptor ✅
- [ ] Copiar conteúdo de `FRONTEND_API_CLIENT_SOLUTION.ts`
- [ ] Salvar como `frontend/lib/api-client.ts` (ou `frontend/services/api.ts`)
- [ ] Verificar imports (axios, localStorage)
- [ ] Testar: `npm run dev` sem erros

### PASO 2: Criar Auth Service ✅
- [ ] Copiar conteúdo de `FRONTEND_AUTH_SERVICE_SOLUTION.ts`
- [ ] Salvar como `frontend/lib/auth-service.ts`
- [ ] Importar `apiClient` do arquivo anterior
- [ ] Testar métodos:
  ```typescript
  authService.login('user@example.com', 'pass')
  authService.selectCompany('company-id')
  authService.isAuthenticated()
  ```

### PASO 3: Criar Componentes ✅
- [ ] Copiar conteúdo de `FRONTEND_LOGIN_COMPONENTS_SOLUTION.tsx`
- [ ] Salvar como `frontend/components/LoginFlow.tsx`
- [ ] Verificar imports (React, next/navigation)
- [ ] Adaptar rotas para seu app (próxima etapa)

### PASO 4: Integração em Pages/Routes ✅
- [ ] Criar ou atualizar `app/login/page.tsx`:
  ```typescript
  import { LoginPage } from '@/components/LoginFlow';
  export default LoginPage;
  ```

- [ ] Criar `app/company-select/page.tsx`:
  ```typescript
  import { CompanySelectPage } from '@/components/LoginFlow';
  export default CompanySelectPage;
  ```

- [ ] Atualizar `app/dashboard/page.tsx`:
  ```typescript
  import { ProtectedRoute } from '@/components/LoginFlow';
  
  function DashboardContent() {
    // seu dashboard atual
  }
  
  export default function Dashboard() {
    return (
      <ProtectedRoute>
        <DashboardContent />
      </ProtectedRoute>
    );
  }
  ```

### PASO 5: Backend - Validar Endpoints ✅

Verificar que o backend tem esses endpoints:

```typescript
// backend/src/auth/auth.controller.ts

@Post('login')
login(@Body() dto: LoginDto) {
  // ✅ Retornar: { access_token, refresh_token, user, companies }
}

@Post('select-company')
selectCompany(@Body() dto: SelectCompanyDto, @Req() req) {
  // ✅ Valida JWT token
  // ✅ Valida company_id
  // ✅ Retorna: { company_id, company_name, permissions }
  // ❌ NÃO exigir x-company-id aqui (é o endpoint que o declara)
}

@Post('refresh')
refresh(@Req() req, @Headers('x-company-id') companyId: string) {
  // ✅ Exigir x-company-id neste endpoint
}

@Get('me')
getCurrentUser(@Req() req) {
  // ✅ Exigir Authorization e x-company-id
}
```

---

## 🔍 FLUXO COMPLETO DE REQUISIÇÕES

### ANTES (❌ Erros):
```
1. GET /auth/me
   Headers: (nenhum)
   Response: ❌ 401 Unauthorized

2. GET /companies
   Headers: (nenhum)
   Response: ❌ 403 Forbidden

3. GET /checklists
   Headers: (nenhum)
   Response: ❌ 403 Forbidden
```

### DEPOIS (✅ Funcionando):
```
1. POST /auth/login
   Headers: { Content-Type: application/json }
   Body: { email, password }
   Response: ✅ 200 { access_token, companies: [...] }
   
   → localStorage.setItem('auth_token', token)
   → Redireciona para /company-select

2. POST /auth/select-company
   Headers: { Authorization: Bearer <token> }
   Body: { company_id }
   Response: ✅ 200 { company_id, company_name }
   
   → localStorage.setItem('selected_company_id', company_id)
   → Redireciona para /dashboard

3. GET /auth/me
   Headers: {
     Authorization: Bearer <token>,
     x-company-id: <company-id>  // ✅ ADICIONADO PELO INTERCEPTOR
   }
   Response: ✅ 200 { user data }

4. GET /companies
   Headers: {
     Authorization: Bearer <token>,
     x-company-id: <company-id>  // ✅ ADICIONADO PELO INTERCEPTOR
   }
   Response: ✅ 200 { companies list }

5. GET /checklists
   Headers: {
     Authorization: Bearer <token>,
     x-company-id: <company-id>  // ✅ ADICIONADO PELO INTERCEPTOR
   }
   Response: ✅ 200 { checklists list }
```

---

## 🧪 TESTES MANUAIS

### Teste 1: Verificar Interceptor
```javascript
// Console do navegador (DevTools)
localStorage.setItem('auth_token', 'test-token');
localStorage.setItem('selected_company_id', 'company-uuid');

// Qualquer requisição agora deve ter headers:
// Authorization: Bearer REDACTED
// x-company-id: company-uuid
```

### Teste 2: Mock de Login
```javascript
// Simular login sem backend
localStorage.setItem('auth_token', 'fake-jwt-token');
localStorage.setItem('selected_company_id', 'afdf7dd1-38b0-445f-9745-b5f6341143a9');

// Agora tentar: fetch('/api/checklists')
// Deve ter headers corretos
```

### Teste 3: Verificar Erro 403
```javascript
// Remover company_id
localStorage.removeItem('selected_company_id');

// Agora tentar: fetch('/api/checklists')
// Deve receber 403 e redirecionar para /company-select
```

---

## 🐛 DEBUGGING

### Se continuar recebendo 401:
1. Verificar se token está sendo salvo
2. Verificar se Authorization header está sendo enviado
   ```javascript
   // DevTools > Network > Request Headers
   // Procurar por: Authorization: Bearer ...
   ```
3. Verificar se token é válido (não expirado)
4. Verificar `/auth/login` retorna `access_token` (não `token`)

### Se continuar recebendo 403:
1. Verificar se `selected_company_id` está em localStorage
   ```javascript
   console.log(localStorage.getItem('selected_company_id'));
   ```
2. Verificar se header `x-company-id` está sendo enviado
   ```javascript
   // DevTools > Network > Request Headers
   // Procurar por: x-company-id: ...
   ```
3. Verificar se company_id passado é válido (UUID válido)
4. Fazer login e selecionar company através da UI

---

## 📚 ARQUIVOS CRIADOS PARA COPIAR

1. **FRONTEND_API_CLIENT_SOLUTION.ts** → `frontend/lib/api-client.ts`
2. **FRONTEND_AUTH_SERVICE_SOLUTION.ts** → `frontend/lib/auth-service.ts`
3. **FRONTEND_LOGIN_COMPONENTS_SOLUTION.tsx** → `frontend/components/LoginFlow.tsx`

---

## ✅ VALIDAÇÃO FINAL

Quando implementado corretamente, você verá:

- [ ] ✅ Acesso a `/login` sem erros
- [ ] ✅ Login bem-sucedido com email/password
- [ ] ✅ Redirecionamento para `/company-select`
- [ ] ✅ Seleção de empresa funciona
- [ ] ✅ Redirecionamento para `/dashboard`
- [ ] ✅ API calls retornam dados (não 401/403)
- [ ] ✅ Interceptor adiciona headers em cada request
- [ ] ✅ Logout funciona corretamente

---

**Status:** 🟢 Pronto para implementar
**Tempo Estimado:** 30-45 minutos
**Dificuldade:** Média
**Suporte:** Verificar SYSTEM_RESPONSIVENESS_DIAGNOSTIC.md para mais contexto
