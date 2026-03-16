import React, { useState } from 'react';
import { Mail, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import api from '@/lib/api';
import { Input } from './ui/input';
import { mailService } from '@/services/mailService';
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Por favor, insira um e-mail válido.');
      return;
    }

    try {
      setSending(true);

      if (storedDocument) {
        await mailService.sendStoredDocument(
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

        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('email', email);
        formData.append('docName', documentName);

        await api.post('/mail/send-uploaded-document', formData);
      } else {
        throw new Error('Nenhum documento disponível para envio.');
      }

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
    <ModalFrame isOpen={isOpen} onClose={onClose} shellClassName="max-w-md">
      <form onSubmit={handleSend}>
        <ModalHeader
          title="Enviar documento"
          description="Compartilhe o PDF final diretamente por e-mail sem sair da tela."
          icon={<Mail className="h-5 w-5" />}
          onClose={onClose}
        />
        <ModalBody className="space-y-5">
          <div>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              O documento{' '}
              <span className="font-semibold text-[var(--ds-color-text-primary)]">{documentName}</span>{' '}
              será enviado para o e-mail abaixo como anexo PDF.
            </p>
            <label htmlFor="send-mail-email" className="mb-2 mt-4 block">
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
