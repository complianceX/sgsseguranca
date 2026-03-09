import React, { useState } from 'react';
import { Mail, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import api from '@/lib/api';
import { Input } from './ui/input';

interface SendMailModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  filename: string;
  base64: string;
}

export function SendMailModal({
  isOpen,
  onClose,
  documentName,
  filename,
  base64,
}: SendMailModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Por favor, insira um e-mail válido.');
      return;
    }

    try {
      setSending(true);

      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('email', email);
      formData.append('docName', documentName);

      await api.post('/mail/send-uploaded-document', formData);

      toast.success('E-mail enviado com sucesso!');
      onClose();
      setEmail('');
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      toast.error('Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ds-modal-overlay z-[100] animate-in fade-in duration-200">
      <div
        className="ds-modal-shell max-w-md animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ds-modal-header">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--ds-color-primary-subtle)] p-2">
              <Mail className="h-5 w-5 text-[var(--ds-color-action-primary)]" />
            </div>
            <h3 className="text-lg font-bold text-[var(--ds-color-text-primary)]">Enviar Documento</h3>
          </div>
          <button
            onClick={onClose}
            className="ds-modal-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSend} className="ds-modal-body">
          <div className="mb-6">
            <p className="mb-4 text-sm text-[var(--ds-color-text-secondary)]">
              O documento{' '}
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{documentName}</span>{' '}
              será enviado para o e-mail abaixo como anexo PDF.
            </p>
            <label
              htmlFor="send-mail-email"
              className="mb-2 block text-sm font-semibold text-[var(--ds-color-text-secondary)]"
            >
              E-mail de Destino
            </label>
            <Input
              id="send-mail-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.com"
              autoFocus
              required
            />
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={sending}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 gap-2" disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
