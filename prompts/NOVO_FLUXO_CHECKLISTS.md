# ✅ Novo Fluxo de Checklists Implementado

## 🎯 Objetivo
Separar o fluxo de checklists em 2 etapas:
1. **Criar Template** (modelo vazio)
2. **Preencher Checklist** (baseado no template)

## 📦 Backend Implementado

### Mudanças no Banco de Dados:
- ✅ Campo `template_id` adicionado (vincula checklist ao template)
- ✅ Campo `is_modelo` já existia (identifica templates)
- ✅ Campos `pdf_file_key`, `pdf_folder_path`, `pdf_original_name` já existiam

### Novos Endpoints:

#### 1. Preencher baseado em template
```
POST /checklists/fill-from-template/:templateId
Body: UpdateChecklistDto (dados do checklist preenchido)
Response: ChecklistResponseDto
```

#### 2. Salvar PDF automaticamente no R2
```
POST /checklists/:id/save-pdf
Response: { fileKey, folderPath, fileUrl }
```

### Estrutura de Pastas no R2:
```
documents/
  └── {company_id}/
      └── checklists/
          └── 2026/
              └── 02/  (fevereiro)
                  └── semana-08/
                      └── checklist-{uuid}.pdf
```

### Endpoints Existentes (já funcionam):
```
GET /checklists?onlyTemplates=true  → Lista apenas templates
GET /checklists?excludeTemplates=true  → Lista apenas checklists preenchidos
POST /checklists  → Criar novo template (com is_modelo=true)
```

## 🎨 Frontend - O que precisa ser feito

### 1. Página de Templates (`/dashboard/checklists/templates`)
- Lista de templates da empresa
- Botão "Novo Template"
- Botão "Preencher" em cada template
- Botão "Editar" template
- Botão "Excluir" template

### 2. Página de Checklists Preenchidos (`/dashboard/checklists`)
- Lista de checklists preenchidos (excludeTemplates=true)
- Mostrar template de origem
- Botão "Ver PDF" (se já foi salvo)
- Botão "Enviar por Email"
- Botão "Imprimir"

### 3. Fluxo de Preenchimento
```
1. Usuário clica em "Preencher" no template
2. Abre formulário com estrutura do template
3. Usuário preenche os dados
4. Usuário assina
5. Ao salvar:
   - Chama POST /checklists/fill-from-template/:templateId
   - Chama POST /checklists/:id/save-pdf (salva automaticamente no R2)
   - Mostra opções: "Enviar por Email" ou "Imprimir"
```

### 4. Componentes a Criar/Atualizar

#### Criar:
- `frontend/app/dashboard/checklists/templates/page.tsx` - Lista de templates
- `frontend/app/dashboard/checklists/templates/new/page.tsx` - Criar template
- `frontend/app/dashboard/checklists/fill/[templateId]/page.tsx` - Preencher checklist

#### Atualizar:
- `frontend/app/dashboard/checklists/page.tsx` - Adicionar filtro excludeTemplates=true
- `frontend/services/checklistsService.ts` - Adicionar novos métodos

### 5. Novos Métodos no Service

```typescript
// frontend/services/checklistsService.ts

export const checklistsService = {
  // Existentes...
  
  // Novos:
  getTemplates: async (): Promise<Checklist[]> => {
    const response = await api.get('/checklists?onlyTemplates=true');
    return response.data;
  },
  
  getFilled: async (): Promise<Checklist[]> => {
    const response = await api.get('/checklists?excludeTemplates=true');
    return response.data;
  },
  
  fillFromTemplate: async (templateId: string, data: any): Promise<Checklist> => {
    const response = await api.post(`/checklists/fill-from-template/${templateId}`, data);
    return response.data;
  },
  
  savePdf: async (id: string): Promise<{ fileKey: string; fileUrl: string }> => {
    const response = await api.post(`/checklists/${id}/save-pdf`);
    return response.data;
  },
};
```

## 🚀 Próximos Passos

1. ✅ Backend implementado e commitado (bfcb732)
2. ⏳ Rodar migration no banco de dados
3. ⏳ Implementar frontend (templates + preenchimento)
4. ⏳ Testar fluxo completo

## 📝 Notas

- O PDF é salvo automaticamente no R2 após preencher
- A estrutura de pastas organiza por ano/mês/semana
- Templates são compartilhados por empresa (company_id)
- Checklists preenchidos ficam vinculados ao template (template_id)

---

**Commit**: bfcb732
**Data**: 24/02/2026
**Status**: Backend completo, Frontend pendente
