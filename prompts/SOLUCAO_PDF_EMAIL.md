# 🚨 Solução: Envio de PDFs por Email

## Problema
Railway tem limite de ~1MB no proxy/nginx, bloqueando PDFs grandes ANTES do código.

## ✅ Solução Implementada (Arquitetura Enterprise)

### Backend Pronto
- ✅ `/mail/send-document` - PDFs pequenos (< 1MB)
- ✅ `/mail/send-document-link` - PDFs grandes (via link S3)
- ✅ StorageService com presigned URLs
- ✅ Email SMTP configurado (Brevo)

### Frontend - Implementar

#### Para PDFs Pequenos (< 1MB)
Usar endpoint atual: `/mail/send-document`

#### Para PDFs Grandes (> 1MB) - RECOMENDADO
```typescript
// 1. Pedir presigned URL
const { uploadUrl, fileKey } = await api.post('/storage/presigned-url', {
  filename: 'relatorio.pdf',
  contentType: 'application/pdf'
});

// 2. Upload direto para S3 (não passa pelo backend)
await fetch(uploadUrl, {
  method: 'PUT',
  body: pdfBlob,
  headers: { 'Content-Type': 'application/pdf' }
});

// 3. Enviar email com link
await api.post('/mail/send-document-link', {
  to: 'destinatario@email.com',
  subject: 'Seu Relatório',
  message: 'Segue o relatório solicitado.',
  fileKey: fileKey
});
```

## 🎯 Próximos Passos

### 1. Criar endpoint de presigned URL (5 min)
```typescript
// backend/src/storage/storage.controller.ts
@Post('presigned-url')
async getPresignedUrl(@Body() body: { filename: string; contentType: string }) {
  const fileKey = `uploads/${Date.now()}-${body.filename}`;
  const uploadUrl = await this.storageService.getPresignedUploadUrl(fileKey, body.contentType);
  return { uploadUrl, fileKey };
}
```

### 2. Adicionar método no StorageService (5 min)
```typescript
async getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: this.bucketName,
    Key: key,
    ContentType: contentType,
  });
  return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
}
```

### 3. Atualizar frontend (10 min)
Implementar o fluxo acima no componente de envio de email.

## 📊 Benefícios

✅ Zero PayloadTooLarge  
✅ Zero risco de OOM  
✅ Menos RAM no backend  
✅ Escala melhor  
✅ Arquitetura enterprise  
✅ PDFs ilimitados (até limite do S3)  

## 🔧 Configuração S3 Necessária

Adicione ao `.env`:
```bash
AWS_ACCESS_KEY_ID=REDACTED
AWS_SECRET_ACCESS_KEY=REDACTED
AWS_BUCKET_NAME=seu-bucket
AWS_REGION=us-east-1
```

Ou use MinIO local:
```bash
AWS_ENDPOINT=http://localhost:9000
```

## 📝 Status Atual

- ✅ Email SMTP configurado
- ✅ Endpoint de link pronto
- ✅ StorageService pronto
- ⏳ Presigned URL endpoint (falta criar)
- ⏳ Frontend upload direto (falta implementar)

## 🚀 Solução Temporária

Para PDFs < 1MB, use o endpoint atual. Para PDFs maiores, implemente a arquitetura acima.
