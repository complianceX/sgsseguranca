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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4 bg-gray-50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Assinatura de Participante</h3>
            <p className="text-xs text-gray-500">Participante: <span className="font-bold text-blue-600">{userName}</span></p>
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

        <div className="p-6">
          <div className="mb-6 flex space-x-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('digital')}
              className={`flex flex-1 items-center justify-center space-x-2 rounded-md py-2 text-sm font-medium transition-all ${
                activeTab === 'digital' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <PenTool className="h-4 w-4" />
              <span>Digital</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex flex-1 items-center justify-center space-x-2 rounded-md py-2 text-sm font-medium transition-all ${
                activeTab === 'upload' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Upload</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('facial')}
              className={`flex flex-1 items-center justify-center space-x-2 rounded-md py-2 text-sm font-medium transition-all ${
                activeTab === 'facial' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Camera className="h-4 w-4" />
              <span>Facial</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cpf_pin')}
              className={`flex flex-1 items-center justify-center space-x-2 rounded-md py-2 text-sm font-medium transition-all ${
                activeTab === 'cpf_pin' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>CPF+PIN</span>
            </button>
          </div>

          <div className={`relative mb-6 flex ${activeTab === 'cpf_pin' ? 'h-auto' : 'h-64'} w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden`}>
            {activeTab === 'digital' && (
              <SignatureCanvas
                ref={sigCanvas}
                penColor="black"
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
                      className="rounded-lg object-contain shadow-md" 
                    />
                  </div>
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center space-y-2">
                    <div className="rounded-full bg-blue-100 p-3">
                      <Upload className="h-6 w-6 text-blue-600" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">Clique para selecionar imagem</span>
                    <span className="text-xs text-gray-400">PNG, JPG ou JPEG</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
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
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 p-4 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-transform"
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
              <div className="flex flex-col gap-4 p-6 w-full">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">CPF</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">PIN (4–6 dígitos)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="••••"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between space-x-4">
            <button
              type="button"
              onClick={clearSignature}
              className="flex items-center space-x-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Limpar</span>
            </button>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center space-x-2 rounded-lg bg-blue-600 px-8 py-2 text-sm font-bold text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
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
