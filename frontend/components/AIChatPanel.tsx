'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, X, Loader2, Sparkles } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIChatPanel({ isOpen, onClose }: AIChatPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Eu sou o COMPLIANCE X, seu assistente de segurança inteligente. Como posso ajudar você hoje?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await aiService.chat(input, {
        context: {
          companyName: user?.company?.razao_social || 'Empresa',
          userName: user?.nome || 'Usuário',
          currentPath: window.location.pathname,
        },
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Erro no chat do COMPLIANCE X:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl transition-all animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-3 text-white">
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm">
            <span className="text-lg font-black italic">G</span>
          </div>
          <div>
            <h3 className="text-sm font-bold">COMPLIANCE X AI</h3>
            <div className="flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] text-blue-100">Online e pronta</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="rounded-full p-1 transition-colors hover:bg-white/10"
          title="Fechar chat"
          aria-label="Fechar chat"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "flex w-full",
              message.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                message.role === 'user'
                  ? "bg-blue-600 text-white rounded-tr-none"
                  : "bg-white text-gray-800 rounded-tl-none border border-gray-100"
              )}
            >
              {message.content}
              <div
                className={cn(
                  "mt-1 text-[10px]",
                  message.role === 'user' ? "text-blue-100" : "text-gray-400"
                )}
              >
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center space-x-2 rounded-2xl bg-white border border-gray-100 px-4 py-2 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-xs text-gray-500 italic">COMPLIANCE X está pensando...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white p-4">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pergunte qualquer coisa sobre SST..."
            className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-4 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-1 rounded-full bg-blue-600 p-1.5 text-white transition-all hover:bg-blue-700 disabled:bg-gray-300"
            title="Enviar mensagem"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center space-x-1">
          <Sparkles className="h-3 w-3 text-blue-600" />
          <span className="text-[10px] text-gray-400">Poder de IA do COMPLIANCE X</span>
        </div>
      </div>
    </div>
  );
}
