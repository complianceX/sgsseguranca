"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Eraser,
  FileText,
  PenLine,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineLoadingState } from "@/components/ui/state";
import {
  PublicDdsSignatureContext,
  publicDdsSignatureService,
} from "@/services/publicDdsSignatureService";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("pt-BR");
}

export default function PublicDdsSignaturePage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token || "");
  const signatureRef = useRef<SignatureCanvas>(null);
  const [context, setContext] = useState<PublicDdsSignatureContext | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    publicDdsSignatureService
      .getContext(token)
      .then((data) => {
        if (!active) return;
        setContext(data);
        setSignedAt(data.signedAt);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Link de assinatura inválido ou expirado.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  function clearSignature() {
    signatureRef.current?.clear();
  }

  function getSignatureDataUrl() {
    const signatureCanvas = signatureRef.current;
    if (!signatureCanvas) return "";

    try {
      const trimmedCanvas =
        typeof signatureCanvas.getTrimmedCanvas === "function"
          ? signatureCanvas.getTrimmedCanvas()
          : null;
      if (trimmedCanvas) {
        return trimmedCanvas.toDataURL("image/png");
      }
    } catch {
      return signatureCanvas.toDataURL("image/png");
    }

    return signatureCanvas.toDataURL("image/png");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acceptedTerms) {
      toast.error("Confirme a ciência antes de assinar.");
      return;
    }
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast.error("Faça sua assinatura no quadro indicado.");
      return;
    }

    const signatureData = getSignatureDataUrl();
    if (!signatureData) {
      toast.error("Não foi possível capturar a assinatura.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await publicDdsSignatureService.submit(token, {
        accepted_terms: acceptedTerms,
        signature_data: signatureData,
      });
      setSignedAt(result.signedAt || new Date().toISOString());
      toast.success("Assinatura registrada com segurança.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível registrar a assinatura.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--ds-color-bg-subtle)] px-4 py-8">
      <section className="mx-auto max-w-3xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-secondary)]">
              SGS Segurança
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--ds-color-text-primary)]">
              Assinatura de DDS
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-secondary)]">
            <ShieldCheck className="h-4 w-4" />
            Link protegido
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-6">
              <InlineLoadingState label="Validando link de assinatura" />
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="flex items-start gap-3 py-6 text-sm text-[var(--ds-color-danger)]">
              <ShieldAlert className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-medium">{error}</p>
                <p className="mt-1 text-[var(--ds-color-text-secondary)]">
                  Solicite um novo link ao responsável pelo DDS.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : context ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
                  {context.dds.tema}
                </CardTitle>
                <CardDescription>
                  Revise os dados mínimos antes de assinar.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-[var(--ds-color-text-secondary)] md:grid-cols-2">
                <p>
                  <strong className="text-[var(--ds-color-text-primary)]">
                    Empresa:
                  </strong>{" "}
                  {context.dds.companyName || "-"}
                </p>
                <p>
                  <strong className="text-[var(--ds-color-text-primary)]">
                    Obra:
                  </strong>{" "}
                  {context.dds.siteName || "-"}
                </p>
                <p>
                  <strong className="text-[var(--ds-color-text-primary)]">
                    Data:
                  </strong>{" "}
                  {formatDate(context.dds.data)}
                </p>
                <p>
                  <strong className="text-[var(--ds-color-text-primary)]">
                    Facilitador:
                  </strong>{" "}
                  {context.dds.facilitatorName || "-"}
                </p>
                <p>
                  <strong className="text-[var(--ds-color-text-primary)]">
                    Assinante:
                  </strong>{" "}
                  {context.signer.name}
                  {context.signer.role ? ` - ${context.signer.role}` : ""}
                </p>
                <p>
                  <strong className="text-[var(--ds-color-text-primary)]">
                    Expira em:
                  </strong>{" "}
                  {formatDateTime(context.expiresAt)}
                </p>
              </CardContent>
            </Card>

            {signedAt || context.status === "signed" ? (
              <Card>
                <CardContent className="flex items-start gap-3 py-6 text-sm text-[var(--ds-color-success)]">
                  <CheckCircle2 className="mt-0.5 h-5 w-5" />
                  <div>
                    <p className="font-medium">Assinatura registrada.</p>
                    <p className="mt-1 text-[var(--ds-color-text-secondary)]">
                      Data/hora: {formatDateTime(signedAt || context.signedAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <form onSubmit={onSubmit} className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PenLine className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
                      Assine no quadro abaixo
                    </CardTitle>
                    <CardDescription>
                      Use o dedo ou mouse. A assinatura será vinculada somente a
                      este DDS e a este participante.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="h-56 overflow-hidden rounded-[var(--ds-radius-lg)] border-2 border-dashed border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)]">
                      <SignatureCanvas
                        ref={signatureRef}
                        penColor="var(--ds-color-action-primary)"
                        canvasProps={{
                          className: "h-full w-full cursor-crosshair",
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <label className="flex max-w-xl items-start gap-3 text-sm text-[var(--ds-color-text-secondary)]">
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(event) =>
                            setAcceptedTerms(event.target.checked)
                          }
                          className="mt-1 h-4 w-4 accent-[var(--ds-color-action-primary)]"
                        />
                        <span>
                          Confirmo que participei do DDS informado, reconheço o
                          conteúdo apresentado e autorizo o registro desta
                          assinatura eletrônica no SGS.
                        </span>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={clearSignature}
                        leftIcon={<Eraser className="h-4 w-4" />}
                      >
                        Limpar
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={submitting || !acceptedTerms}
                    leftIcon={<ShieldCheck className="h-4 w-4" />}
                  >
                    {submitting ? "Registrando..." : "Confirmar assinatura"}
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
