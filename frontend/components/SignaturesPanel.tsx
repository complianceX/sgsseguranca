'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, ShieldCheck, PenTool, Upload, Camera, Smartphone } from 'lucide-react';
import { signaturesService, Signature } from '@/services/signaturesService';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

const TYPE_LABEL: Record<string, string> = {
  digital: 'Digital (Desenho)',
  upload: 'Imagem Enviada',
  facial: 'Facial',
  cpf_pin: 'CPF + PIN',
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  digital: <PenTool className="h-3.5 w-3.5" />,
  upload: <Upload className="h-3.5 w-3.5" />,
  facial: <Camera className="h-3.5 w-3.5" />,
  cpf_pin: <Smartphone className="h-3.5 w-3.5" />,
};

interface SignaturesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentType: string;
}

export function SignaturesPanel({ isOpen, onClose, documentId, documentType }: SignaturesPanelProps) {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    signaturesService
      .findByDocument(documentId, documentType)
      .then(setSignatures)
      .catch(() => toast.error('Erro ao carregar assinaturas'))
      .finally(() => setLoading(false));
  }, [isOpen, documentId, documentType]);

  if (!isOpen) return null;

  const isImageType = (type: string) => ['digital', 'upload', 'facial'].includes(type);

  return (
    <div className="ds-modal-overlay z-[60]">
      <div className="ds-modal-shell max-w-lg">
        <div className="ds-modal-header">
          <div>
            <h3 className="text-lg font-bold text-[var(--ds-color-text-primary)]">Assinaturas do Documento</h3>
            <p className="text-xs text-[var(--ds-color-text-muted)]">
              {documentType} — {signatures.length} assinatura(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ds-modal-close"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="ds-modal-body max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
            </div>
          ) : signatures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-[var(--ds-color-text-muted)]">
              <PenTool className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma assinatura registrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {signatures.map((sig) => (
                <div key={sig.id} className="flex items-start gap-4 rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-4">
                  {/* Miniature for image-based signatures */}
                  {isImageType(sig.type) && sig.signature_data && (
                    <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--ds-color-border-subtle)] bg-white">
                      <Image
                        src={sig.signature_data}
                        alt="Assinatura"
                        fill
                        className="object-contain p-1"
                      />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="primary">
                        {TYPE_ICON[sig.type] ?? <PenTool className="h-3.5 w-3.5" />}
                        {TYPE_LABEL[sig.type] ?? sig.type}
                      </Badge>
                      {sig.signature_hash && (
                        <Badge variant="success">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Verificado
                        </Badge>
                      )}
                    </div>

                    {sig.type === 'cpf_pin' && (() => {
                      try {
                        const parsed = JSON.parse(sig.signature_data);
                        return (
                          <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                            CPF: {parsed.cpf} — {new Date(parsed.confirmed_at).toLocaleString('pt-BR')}
                          </p>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                    <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                      {sig.signed_at
                        ? new Date(sig.signed_at).toLocaleString('pt-BR')
                        : sig.created_at
                          ? new Date(sig.created_at).toLocaleString('pt-BR')
                          : 'Data não disponível'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ds-modal-footer">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
          >
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
