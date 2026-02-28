import React, { useState } from 'react';
import { Mail, X, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import api from '@/lib/api';

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Enviar Documento</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSend} className="p-6">
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              O documento{' '}
              <span className="font-semibold text-gray-900">{documentName}</span>{' '}
              será enviado para o e-mail abaixo como anexo PDF.
            </p>
            <label
              htmlFor="send-mail-email"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              E-mail de Destino
            </label>
            <input
              id="send-mail-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.com"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
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
