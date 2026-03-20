import React, { useState } from 'react';
import { Mail, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  DocumentMailDispatchResponse,
  mailService,
} from '@/services/mailService';
import {
  ModalBody,
  ModalFooter,
  ModalFrame,
  ModalHeader,
} from './ui/modal-frame';

interface SendMailModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  filename: string;
  base64?: string;
  storedDocument?: {
    documentId: string;
    documentType: string;
  };
}

function getMailErrorMessage(error: unknown) {
  const message = (
    error as
      | { response?: { data?: { message?: string | string[] } } }
      | undefined
  )?.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(' ');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  return 'Erro ao enviar e-mail. Tente novamente.';
}

export function SendMailModal({
  isOpen,
  onClose,
  documentName,
  filename,
  base64,
  storedDocument,
}: SendMailModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const isStoredDocumentFlow = Boolean(storedDocument);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Por favor, insira um e-mail válido.');
      return;
    }

    try {
      setSending(true);
      let result: DocumentMailDispatchResponse;

      if (storedDocument) {
        result = await mailService.sendStoredDocument(
          storedDocument.documentId,
          storedDocument.documentType,
          email,
        );
      } else if (base64) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        result = await mailService.sendUploadedDocument(
          blob,
          filename,
          email,
          documentName,
        );
      } else {
        throw new Error('Nenhum documento disponível para envio.');
      }

      toast.success(result.message);
      onClose();
      setEmail('');
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      toast.error(getMailErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalFrame isOpen={isOpen} onClose={onClose} shellClassName="max-w-md">
      <form onSubmit={handleSend}>
        <ModalHeader
          title="Enviar documento"
          description={
            isStoredDocumentFlow
              ? 'O envio usará o PDF final governado sempre que ele já estiver emitido.'
              : 'Este envio usará um PDF local/degradado de forma explícita e auditável.'
          }
          icon={<Mail className="h-5 w-5" />}
          onClose={onClose}
        />
        <ModalBody className="space-y-5">
          <div>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              O documento{' '}
              <span className="font-semibold text-[var(--ds-color-text-primary)]">
                {documentName}
              </span>{' '}
              será enviado para o(s) destinatário(s) abaixo como anexo PDF.
            </p>
            <div
              className={`mt-4 rounded-[var(--ds-radius-md)] border px-3 py-2 text-xs ${
                isStoredDocumentFlow
                  ? 'border-[color:var(--ds-color-success)]/30 bg-[color:var(--ds-color-success)]/10 text-[var(--ds-color-success)]'
                  : 'border-[color:var(--ds-color-warning)]/30 bg-[color:var(--ds-color-warning)]/10 text-[var(--ds-color-warning)]'
              }`}
            >
              {isStoredDocumentFlow
                ? 'Envio oficial: o backend anexará o documento final governado.'
                : 'Envio local/degradado: o PDF anexado foi gerado localmente e não substitui a emissão final governada.'}
            </div>
            <label htmlFor="send-mail-email" className="mb-2 mt-4 block">
              E-mail(s) de Destino
            </label>
            <Input
              id="send-mail-email"
              type="email"
              multiple
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.com, outro@email.com"
              autoFocus
              required
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="flex w-full gap-3 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:flex-none"
              disabled={sending}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 gap-2 sm:flex-none" disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </ModalFooter>
      </form>
    </ModalFrame>
  );
}
