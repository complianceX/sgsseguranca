-- Migration: Adicionar coluna pdf_file_key na tabela pts
-- Objetivo: Armazenar a referência do arquivo PDF no S3/R2 para downloads seguros

ALTER TABLE pts ADD COLUMN IF NOT EXISTS pdf_file_key TEXT;

COMMENT ON COLUMN pts.pdf_file_key IS 'Chave do arquivo PDF no Storage (S3/R2) para geração de Presigned URLs';