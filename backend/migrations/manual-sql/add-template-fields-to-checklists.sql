-- Migration: Adicionar campos de template aos checklists
-- Data: 24/02/2026

-- Adicionar campo template_id
ALTER TABLE checklists 
ADD COLUMN IF NOT EXISTS template_id UUID;

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_checklists_template_id ON checklists(template_id);
CREATE INDEX IF NOT EXISTS idx_checklists_is_modelo ON checklists(is_modelo);

-- Comentários
COMMENT ON COLUMN checklists.template_id IS 'ID do template usado para criar este checklist';
COMMENT ON COLUMN checklists.is_modelo IS 'Indica se este checklist é um template (modelo)';
COMMENT ON COLUMN checklists.pdf_file_key IS 'Chave do arquivo PDF no R2';
COMMENT ON COLUMN checklists.pdf_folder_path IS 'Caminho da pasta no R2';
COMMENT ON COLUMN checklists.pdf_original_name IS 'Nome original do arquivo PDF';
