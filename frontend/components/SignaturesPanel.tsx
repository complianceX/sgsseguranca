'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, ShieldCheck, PenTool, Upload, Camera, Smartphone } from 'lucide-react';
import { signaturesService, Signature } from '@/services/signaturesService';
import { toast } from 'sonner';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4 bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Assinaturas do Documento</h3>
            <p className="text-xs text-gray-500">
              {documentType} — {signatures.length} assinatura(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : signatures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
              <PenTool className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma assinatura registrada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {signatures.map((sig) => (
                <div key={sig.id} className="flex items-start gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  {/* Miniature for image-based signatures */}
                  {isImageType(sig.type) && sig.signature_data && (
                    <div className="relative h-16 w-24 flex-shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden">
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
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        {TYPE_ICON[sig.type] ?? <PenTool className="h-3.5 w-3.5" />}
                        {TYPE_LABEL[sig.type] ?? sig.type}
                      </span>
                      {sig.signature_hash && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Verificado
                        </span>
                      )}
                    </div>

                    {sig.type === 'cpf_pin' && (() => {
                      try {
                        const parsed = JSON.parse(sig.signature_data);
                        return (
                          <p className="mt-1 text-xs text-gray-500">
                            CPF: {parsed.cpf} — {new Date(parsed.confirmed_at).toLocaleString('pt-BR')}
                          </p>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                    <p className="mt-1 text-xs text-gray-400">
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

        <div className="border-t px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
