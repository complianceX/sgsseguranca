# Implementation Analysis: Fixed 401/403 Authentication Errors

**Date:** 2025-01-XX  
**Status:** Ready for Implementation  
**Issue:** Frontend requests fail with 401/403 because `x-company-id` header is not sent

---

## Root Cause (Final Determination)

### The Real Problem
After thorough code analysis, the root cause is **clear**:

1. **Backend auth.service.ts:login()** returns user with `company_id` field (line 393):
   ```typescript
   return {
     accessToken,
     refreshToken,
     user: {
       id: user.id,
       nome: user.nome,
       cpf: user.cpf,
       funcao: user.funcao,
       company_id: user.company_id,  // ✅ Present here
       profile: user.profile,
     },
   };
   ```

2. **Frontend persistAuthenticatedSession()** (line 41) sets sessionStore.companyId:
   ```typescript
   sessionStore.set({
     userId: user.id,
     companyId: user.company_id,  // ✅ Should be set
     profileName: user.profile?.nome ?? null,
   });
   ```

3. **Frontend api.ts interceptor** (line 142-151) injects x-company-id IF it exists:
   ```typescript
   const session = sessionStore.get();
   const companyId = session?.companyId || null;
   if (userProfileName === 'Administrador Geral') {
     // ... select tenant logic
   } else if (companyId) {
     config.headers['x-company-id'] = companyId;  // ✅ Would work IF companyId set
   }
   ```

### So Why Does It Fail?

**The sequence is:**

1. User logs in → `login()` endpoint called
2. AuthContext receives `data.user` with `company_id` 
3. AuthContext **waits for `/auth/me`** (getCurrentSession) before persisting
4. If `/auth/me` is called **without x-company-id header** → **403 Tenant context error**
5. This error happens **before** sessionStore.companyId is ever set
6. User gets stuck in a loop where:
   - Can't call endpoints (no x-company-id)
   - Can't set x-company-id (haven't called /auth/me yet)

### The Insight

The issue is a **race condition / logical flow problem**:
- `getCurrentSession()` result should be trusted directly after login
- But the code calls it expecting it to work without company context
- The backend's TenantRequiredGuard blocks it

---

## Solution: Three Changes Required

### Change 1: Modify AuthContext login() flow

**File:** `frontend/context/AuthContext.tsx`

**What to do:**
1. After successful login, use the `user` object returned from login() directly
2. Don't wait for `/auth/me` to complete before setting sessionStore
3. Only merge /auth/me data if it succeeds; ignore if it fails

**Current flow (lines 82-109):**
```typescript
const login = async (cpf: string, password: string, turnstileToken?: string) => {
  try {
    const data = await authService.login(cpf, password, turnstileToken);
    // ... 
    let meData: AuthMeResponse | null = null;
    try {
      meData = await authService.getCurrentSession();  // ← BLOCKS here without x-company-id
    } catch {
      meData = null;
    }
    // ... uses authenticatedUser (MeData || login response)
```

**New flow:**
```typescript
const login = async (cpf: string, password: string, turnstileToken?: string) => {
  try {
    const data = await authService.login(cpf, password, turnstileToken);
    const authenticatedUser = data.user;  // ← Use login response directly
    
    // Try to get additional data, but don't block if it fails
    let meData: AuthMeResponse | null = null;
    try {
      meData = await authService.getCurrentSession();
    } catch {
      // Ignore /auth/me failures — we have user from login already
      meData = null;
    }
    
    // Immediately persist with login response (has company_id)
    persistAuthenticatedSession({
      user: authenticatedUser,
      roles: meData?.roles || data.roles || [],
      accessToken: data.accessToken,  // ← This enables x-company-id header now
    });
    
    setUser(authenticatedUser);
    router.push('/dashboard');
```

**Why this works:**
- sessionStore.companyId is set immediately with user.company_id from login
- api.ts interceptor can now inject x-company-id on subsequent requests
- /auth/me can now succeed because x-company-id header is present

---

### Change 2: Add guard to prevent accessing apps without company_id

**File:** `frontend/app/layout.tsx` or create new middleware

**What to do:**
Add a check: If user is logged in but sessionStore.companyId is null, redirect to company-select page

**Why:**
- Some scenarios: User has no assigned company (should not exist, but safety check)
- AdminGeral users might intentionally clear company selection

**Code pattern:**
```typescript
// In a useEffect in layout or middleware:
if (tokenStore.get() && !sessionStore.get()?.companyId && !isAdminGeral) {
  router.push('/company-select');
}
```

---

### Change 3: Add company-select page for AdminGeral users (optional but recommended)

**File:** `frontend/app/company-select/page.tsx`

**What to do:**
1. Show list of companies user can select
2. Call new endpoint: `POST /auth/select-company` with chosen companyId
3. Update selectedTenantStore
4. Redirect to dashboard

**Why:**
- AdminGeral users can work with multiple companies
- This gives them explicit control over which company they're accessing
- Improves security (audit trail of company selections)

---

## Current Code Already Has 90% of the Logic!

The system already has:
- ✅ Axios interceptor that injects x-company-id
- ✅ sessionStore to track companyId
- ✅ persistAuthenticatedSession() that stores company_id
- ✅ User object includes company_id field
- ✅ selectedTenantStore for AdminGeral tenants

**All we need to do:**
1. Fix the login flow to trust the login response immediately
2. Add safety checks for edge cases
3. (Optional) Add company-select page for UX

---

## Implementation Steps

### Step 1: Update AuthContext.tsx login() method ⭐ CRITICAL
- Change lines 82-109
- Use data.user directly instead of waiting for /auth/me
- Call persistAuthenticatedSession BEFORE router.push
- See code below

### Step 2: Add sessionStore.get() checks in middleware ✅ OPTIONAL
- Ensure user can't access apps without sessionStore.companyId
- Redirect to company-select if missing

### Step 3: Create company-select page ✅ OPTIONAL BUT RECOMMENDED
- AdminGeral users can select which company to work with
- Better UX than silent company selection

---

## Code Changes Required

### Primary Fix (MUST DO): AuthContext.tsx

**Location:** `frontend/context/AuthContext.tsx` lines 82-109

**Replace:**
```typescript
  const login = async (
    cpf: string,
    password: string,
    turnstileToken?: string,
  ) => {
    try {
      const data = await authService.login(cpf, password, turnstileToken);

      if (!data.accessToken) {
        throw new Error('Access token ausente na resposta de login.');
      }

      let meData: AuthMeResponse | null = null;
      try {
        meData = await authService.getCurrentSession();
      } catch {
        meData = null;
      }

      const authenticatedUser = meData?.user || data.user;
      if (!authenticatedUser) {
        throw new Error('Resposta de login invalida do servidor.');
      }
      const resolvedRoles = meData?.roles || data.roles || [];
      persistAuthenticatedSession({
        user: authenticatedUser,
        roles: resolvedRoles,
        accessToken: data.accessToken,
      });

      setUser(authenticatedUser);
      setRoles(resolvedRoles);
      setPermissions(meData?.permissions || data.permissions || []);
      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };
```

**With:**
```typescript
  const login = async (
    cpf: string,
    password: string,
    turnstileToken?: string,
  ) => {
    try {
      const data = await authService.login(cpf, password, turnstileToken);

      if (!data.accessToken) {
        throw new Error('Access token ausente na resposta de login.');
      }

      // Use user from login response directly — it has company_id
      const authenticatedUser = data.user;
      if (!authenticatedUser) {
        throw new Error('Resposta de login invalida do servidor.');
      }

      // Persist session IMMEDIATELY with login response
      // This sets sessionStore.companyId, enabling x-company-id header
      persistAuthenticatedSession({
        user: authenticatedUser,
        roles: data.roles || [],
        accessToken: data.accessToken,
      });

      setUser(authenticatedUser);
      setRoles(data.roles || []);
      // Try to get additional permissions, but don't block if it fails
      try {
        const meData = await authService.getCurrentSession();
        setPermissions(meData?.permissions || []);
      } catch {
        // If /auth/me fails, that's OK — we have user from login already
        setPermissions(data.permissions || []);
      }

      router.push('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };
```

**Key Changes:**
1. Line 101: Use `data.user` directly (not waiting for meData)
2. Line 108: Move persistAuthenticatedSession before router.push
3. Line 112-119: Call /auth/me after session is already persistent
4. Line 120: Catch any /auth/me errors without blocking

**Why This Works:**
- sessionStore.companyId is set **immediately** with user.company_id
- api.ts interceptor can now inject x-company-id on **next request**
- If next request is /auth/me, it succeeds with x-company-id header

---

## Testing the Fix

### Before Deploying:

1. **Local Test:**
   ```bash
   npm run dev
   ```
   - Open browser to http://localhost:3000/login
   - Log in with valid CPF
   - Open DevTools → Network tab
   - Check request headers on ANY request after login
   - Should see `x-company-id: <uuid>` header

2. **Check Console:**
   - No 401/403 errors
   - No "Contexto de empresa não identificado" errors

3. **Endpoints Check:**
   - Navigate to /dashboard
   - Load checklists, companies, users
   - All should work without 403 errors

### After Deploying:

1. Go to production URL
2. Run same tests
3. Check Sentry for any remaining 401/403 errors
4. Monitor error logs for TenantRequiredGuard rejections

---

## Why Previous Approach (Solution Files) Won't Work

The three solution files we created earlier (API, Auth Service, Components) suggested:
- ❌ Using localStorage for company_id
- ❌ Creating unnecessary selectCompany() method
- ❌ Adding extra page/flow

**Problem:** These don't match the existing architecture:
- sessionStore already tracks companyId
- api.ts already injects x-company-id
- Backend already returns company_id in login response
- Could cause duplicate state (localStorage + sessionStore conflict)

**Better:** Just fix the login flow to use what's already there!

---

## Edge Cases Handled

| Case | Current Code | How It's Handled |
|------|--------------|-----------------|
| User has no company assigned | Would return null company_id | Guard redirects to company-select or error page |
| AdminGeral user | Code detects profile='Administrador Geral' | Uses selectedTenantStore instead (already in api.ts) |
| User logs out | clearAuthenticatedSession() clears all stores | Redirect to /login works correctly |
| Refresh token expires | 401 handler attempts refresh | sessionStore still has companyId on retry |
| Multiple companies per user | Not currently supported* | Can add company-select later |

*Note: Backend stores single company_id per user. AdminGeral users can switch via selectedTenantStore

---

## Deployment Checklist

- [ ] Make one code change to AuthContext.tsx
- [ ] Test locally (login → check headers)
- [ ] Push to GitHub
- [ ] Deploy to staging
- [ ] Test on staging (login → access protected routes)
- [ ] Deploy to production
- [ ] Monitor Sentry for auth errors
- [ ] Verify 401/403 errors are gone

---

## Estimated Time

- Code change: 5 minutes
- Local testing: 5 minutes
- Deployment: 2-5 minutes
- Total: **15-20 minutes**

---

## Questions & Clarifications

**Q: Why not use the /auth/me response?**
A: Because /auth/me requires x-company-id header, which we can't set until sessionStore.companyId exists. We're breaking a circular dependency by using login response directly.

**Q: Is this secure?**
A: Yes. The user object is signed in JWT and validated by backend. Using it immediately is safe.

**Q: What about AdminGeral users?**
A: Code already handles them. When profile='Administrador Geral', api.ts uses selectedTenantStore instead of sessionStore.companyId.

**Q: Do we need the solution files (API, Auth Service, Components)?**
A: No. They were created as alternatives, but the existing code is better. Delete them to avoid confusion.

---

## Summary

**The Fix:** Change AuthContext login flow to persist session immediately with login response  
**Lines Changed:** frontend/context/AuthContext.tsx lines 82-119  
**Impact:** x-company-id header will be present on all requests after login  
**Result:** 401/403 errors resolved, system responsive again

---

## Next Action

Proceed to implementation of Step 1 (AuthContext fix) — this is the only change needed to resolve the issue.
