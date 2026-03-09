'use client';

import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { Send, X, Loader2, Sparkles, ImagePlus, TriangleAlert } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { cn } from '@/lib/utils';
import type { AiRouteContext } from '@/lib/ai-context';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context: AiRouteContext;
}

export function AIChatPanel({ isOpen, onClose, context }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: 'assistant',
      content: context.assistantIntro,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: context.assistantIntro,
        timestamp: new Date(),
      },
    ]);
  }, [context.assistantIntro]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!selectedImage) {
      setSelectedImagePreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedImage);
    setSelectedImagePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImage]);

  const formatImageAnalysis = (analysis: Awaited<ReturnType<typeof aiService.analyzeImageRisk>>) =>
    [
      `Resumo: ${analysis.summary}`,
      `Nível de risco: ${analysis.riskLevel}`,
      analysis.imminentRisks.length
        ? `Riscos iminentes:\n- ${analysis.imminentRisks.join('\n- ')}`
        : null,
      analysis.immediateActions.length
        ? `Ações imediatas:\n- ${analysis.immediateActions.join('\n- ')}`
        : null,
      analysis.ppeRecommendations.length
        ? `EPIs recomendados:\n- ${analysis.ppeRecommendations.join('\n- ')}`
        : null,
      `Observações: ${analysis.notes}`,
    ]
      .filter(Boolean)
      .join('\n\n');

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSelectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Use uma imagem JPG, PNG ou WEBP para análise de risco.',
          timestamp: new Date(),
        },
      ]);
      clearSelectedImage();
      return;
    }

    setSelectedImage(file);
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const prompt = input.trim() || 'Analise os riscos visíveis nesta imagem.';
    const contextualPrompt = `${context.promptPrefix}\n\nSolicitação do usuário: ${prompt}`;

    const userMessage: Message = {
      role: 'user',
      content: selectedImage
        ? `${prompt}\n\n[Imagem anexada: ${selectedImage.name}]`
        : prompt,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const assistantContent = selectedImage
        ? formatImageAnalysis(await aiService.analyzeImageRisk(selectedImage, contextualPrompt))
        : (
            await aiService.chat(contextualPrompt, {
              conversationHistory,
            })
          ).answer;

      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Erro no chat do COMPLIANCE X:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Não consegui responder agora. Tente novamente em instantes.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      clearSelectedImage();
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const ContextIcon = context.icon;

  return (
    <div className="fixed bottom-[8.5rem] left-4 right-4 z-50 flex h-[min(38rem,calc(100vh-10rem))] flex-col overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-2xl transition-all animate-in slide-in-from-bottom-4 sm:bottom-24 sm:left-6 sm:right-auto sm:w-[420px]">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-3 text-white">
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm">
            <ContextIcon className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold">{context.title}</h3>
            <div className="flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[10px] text-blue-100">{context.subtitle}</span>
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
        <div className="flex flex-wrap gap-2">
          {context.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setInput(suggestion)}
              className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
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
              <span className="text-xs text-gray-500 italic">Analisando contexto SST...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white p-4">
        {selectedImagePreview ? (
          <div className="mb-3 rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
                Foto pronta para análise de risco
              </div>
              <button
                type="button"
                onClick={clearSelectedImage}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                title="Remover imagem"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={selectedImagePreview}
              alt="Pré-visualização da imagem enviada para a IA SST"
              className="h-28 w-full rounded-xl object-cover"
            />
          </div>
        ) : null}
        <div className="relative flex items-center">
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Selecionar imagem para análise de risco"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSelectImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="absolute left-1 rounded-full p-2 text-gray-500 transition-all hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
            title="Anexar foto para análise"
            aria-label="Anexar foto para análise"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder={`Pergunte sobre ${context.title.toLowerCase()}...`}
            className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-11 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !selectedImage) || isLoading}
            className="absolute right-1 rounded-full bg-blue-600 p-1.5 text-white transition-all hover:bg-blue-700 disabled:bg-gray-300"
            title="Enviar mensagem"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center space-x-1">
          <Sparkles className="h-3 w-3 text-blue-600" />
          <span className="text-[10px] text-gray-400">
            IA especialista em SST com contexto da tela e análise de fotos
          </span>
        </div>
      </div>
    </div>
  );
}
