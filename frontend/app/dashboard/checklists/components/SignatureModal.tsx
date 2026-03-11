'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { X, PenTool, Upload, Camera, Check, RefreshCw, Smartphone } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from 'sonner';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureData: string, type: string) => void;
  userName: string;
}

export function SignatureModal({ isOpen, onClose, onSave, userName }: SignatureModalProps) {
  const [activeTab, setActiveTab] = useState<'digital' | 'upload' | 'facial' | 'cpf_pin'>('digital');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');

  const sigCanvas = useRef<SignatureCanvas>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tabButtonClassName =
    'flex flex-1 items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';
  const fieldClassName =
    'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';
  const labelClassName = 'mb-1 block text-sm font-medium text-[var(--ds-color-text-secondary)]';

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Erro ao acessar a câmera:', err);
      toast.error('Não foi possível acessar a câmera.');
      // Usar um pequeno delay para evitar renderização em cascata se chamado do useEffect
      setTimeout(() => setActiveTab('digital'), 0);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (activeTab === 'facial' && isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab, isOpen]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setPreviewImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearSignature = () => {
    if (activeTab === 'digital') {
      sigCanvas.current?.clear();
    } else {
      setPreviewImage(null);
      if (activeTab === 'facial') startCamera();
    }
  };

  const handleSave = () => {
    let signatureData = '';

    if (activeTab === 'cpf_pin') {
      if (!cpf.trim()) { toast.error('Informe o CPF.'); return; }
      if (!/^\d{4,6}$/.test(pin)) { toast.error('PIN deve ter entre 4 e 6 dígitos numéricos.'); return; }
      signatureData = JSON.stringify({ cpf: cpf.trim(), confirmed_at: new Date().toISOString() });
      onSave(signatureData, 'cpf_pin');
      onClose();
      return;
    }

    if (activeTab === 'digital') {
      if (sigCanvas.current?.isEmpty()) {
        toast.error('Por favor, faça a assinatura.');
        return;
      }
      signatureData = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png') || '';
    } else {
      if (!previewImage) {
        toast.error('Por favor, forneça a imagem da assinatura.');
        return;
      }
      signatureData = previewImage;
    }

    onSave(signatureData, activeTab);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="ds-modal-overlay z-[60]">
      <div className="ds-modal-shell max-w-lg">
        <div className="ds-modal-header">
          <div>
            <h3 className="text-lg font-bold text-[var(--ds-color-text-primary)]">Assinatura de Participante</h3>
            <p className="text-xs text-[var(--ds-color-text-muted)]">
              Participante: <span className="font-bold text-[var(--ds-color-text-primary)]">{userName}</span>
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

        <div className="ds-modal-body">
          <div className="mb-6 flex space-x-2 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/35 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('digital')}
              className={`${tabButtonClassName} ${
                activeTab === 'digital'
                  ? 'border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-xs)]'
                  : 'text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]'
              }`}
            >
              <PenTool className="h-4 w-4" />
              <span>Digital</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`${tabButtonClassName} ${
                activeTab === 'upload'
                  ? 'border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-xs)]'
                  : 'text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('facial')}
              className={`${tabButtonClassName} ${
                activeTab === 'facial'
                  ? 'border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-xs)]'
                  : 'text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]'
              }`}
            >
              <Camera className="h-4 w-4" />
              <span>Facial</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cpf_pin')}
              className={`${tabButtonClassName} ${
                activeTab === 'cpf_pin'
                  ? 'border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-xs)]'
                  : 'text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>CPF+PIN</span>
            </button>
          </div>

          <div
            className={`relative mb-6 flex ${activeTab === 'cpf_pin' ? 'h-auto' : 'h-64'} w-full items-center justify-center overflow-hidden rounded-[var(--ds-radius-xl)] border-2 border-dashed border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]/26`}
          >
            {activeTab === 'digital' && (
              <SignatureCanvas
                ref={sigCanvas}
                penColor="#1e40af"
                canvasProps={{
                  className: "h-full w-full cursor-crosshair",
                }}
              />
            )}

            {activeTab === 'upload' && (
              <div className="flex flex-col items-center justify-center p-4">
                {previewImage ? (
                  <div className="relative h-56 w-full">
                    <Image
                      src={previewImage}
                      alt="Preview"
                      fill
                      className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] object-contain p-2"
                    />
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center space-y-2">
                    <div className="rounded-full bg-[var(--ds-color-primary-subtle)] p-3">
                      <Upload className="h-6 w-6 text-[var(--ds-color-action-primary)]" />
                    </div>
                    <span className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Clique para selecionar imagem</span>
                    <span className="text-xs text-[var(--ds-color-text-muted)]">PNG, JPG ou JPEG</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      aria-label="Selecionar imagem de assinatura"
                      onChange={handleFileUpload}
                    />
                  </label>
                )}
              </div>
            )}

            {activeTab === 'facial' && (
              <div className="relative h-full w-full">
                {previewImage ? (
                  <Image 
                    src={previewImage} 
                    alt="Foto Capturada" 
                    fill
                    className="object-cover" 
                  />
                ) : (
                  <>
                    <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[var(--ds-color-action-primary)] p-4 text-[var(--ds-color-action-primary-foreground)] shadow-[var(--ds-shadow-sm)] transition-transform hover:bg-[var(--ds-color-action-primary-hover)] active:scale-95"
                      title="Capturar Foto"
                    >
                      <Camera className="h-6 w-6" />
                    </button>
                  </>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            {activeTab === 'cpf_pin' && (
              <div className="flex w-full flex-col gap-4 p-6">
                <div>
                  <label className={labelClassName}>CPF</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName}>PIN (4–6 dígitos)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="••••"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className={fieldClassName}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between space-x-4">
            <button
              type="button"
              onClick={clearSignature}
              className="flex items-center space-x-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/24 hover:text-[var(--ds-color-text-primary)]"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Limpar</span>
            </button>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-6 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/24 hover:text-[var(--ds-color-text-primary)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-8 py-2 text-sm font-bold text-[var(--ds-color-action-primary-foreground)] shadow-[var(--ds-shadow-sm)] transition-all hover:bg-[var(--ds-color-action-primary-hover)] active:scale-[0.99]"
              >
                <Check className="h-4 w-4" />
                <span>Confirmar Assinatura</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
