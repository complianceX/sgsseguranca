import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentImportModule } from './document-import/document-import.module';
import { AuditModule } from './audit/audit.module';
import { MathModule } from './math/math.module';import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentImportModule } from './document-import/document-import.module';
import { AuditModule } from './audit/audit.module';
import { MathModule } from './math/math.module';import type { Cache } from 'cache-manager';# 🔐 CREDENCIAIS DE LOGIN

## ✅ USUÁRIO ADMINISTRADOR PADRÃO

Quando o backend iniciar pela primeira vez, ele cria automaticamente um usuário administrador:

### Credenciais:
- **CPF:** `00000000000` (11 zeros)
- **Senha:** `admin`
- **Perfil:** Administrador Geral
- **Empresa:** Empresa Master SST (criada automaticamente)

## 📋 COMO FUNCIONA

O sistema possui um **SeedService** que roda automaticamente quando o backend inicia (`OnApplicationBootstrap`).

Ele cria:

1. **6 Perfis de usuário:Administrador Geral
   - Administrador da Empresa
   - Técnico de Segurança do Trabalho (TST)
   - Supervisor / Encarregado
   - Operador / Colaborador
   - Leitura (cliente/auditoria)

2. **Empresa Master** (se não existir nenhuma):
   - Razão Social: Empresa Master SST
   - CNPJ: 00000000000000

3. **Usuário Admin** (se não existir):
   - Nome: Administrador Geral
   - CPF: 00000000000
   - Função: Admin
   - Senha: admin (será hasheada automaticamente)

## 🚀 PRIMEIRO ACESSO

1. Acesse: `http://localhost:3000/login`
2. Digite:
   - CPF: `00000000000`
   - Senha: `admin`
3. Clique em "Entrar"

## ⚠️ IMPORTANTE - SEGURANÇA

**APÓS O PRIMEIRO LOGIN:**
1. Altere a senha padrão imediatamente
2. Crie outros usuários com permissões específicas
3. Nunca use essas credenciais em produção

## 🔧 PARA CRIAR NOVOS USUÁRIOS

Após fazer login como admin, você pode:
1. Acessar o menu "Usuários"
2. Criar novos usuários com diferentes perfis
3. Atribuir permissões específicas

## 📝 OBSERVAÇÕES

- O seed roda automaticamente na inicialização do backend
- Se o usuário admin já existir, ele não será recriado
- A senha é hasheada usando bcrypt antes de ser salva no banco
- O sistema usa JWT para autenticação
