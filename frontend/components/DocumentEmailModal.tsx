import React, { useState } from 'react';
import { Mail, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface DocumentEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  onSend: (email: string) => Promise<void>;
}

export function DocumentEmailModal({
  isOpen,
  onClose,
  documentName,
  onSend,
}: DocumentEmailModalProps) {
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
      await onSend(email);
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
              O documento <span className="font-semibold text-[var(--ds-color-text-primary)]">{documentName}</span> será enviado para o e-mail abaixo como um link seguro.
            </p>
            
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[var(--ds-color-text-secondary)]">
              E-mail de Destino
            </label>
            <Input
              id="email"
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
            <Button
              type="submit"
              className="flex-1 gap-2"
              loading={sending}
              disabled={sending}
            >
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
