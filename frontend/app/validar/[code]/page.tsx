"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ValidarPage(props: any) {
  const router = useRouter();
  const code = decodeURIComponent(props?.params?.code || "").trim();

  useEffect(() => {
    // Redireciona para a página pública de verificação já existente,
    // preservando o código para futuras integrações com hash.
    if (code) {
      router.replace(`/verify?code=${encodeURIComponent(code)}`);
    } else {
      router.replace("/verify");
    }
  }, [code, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--ds-color-bg-subtle)] px-4">
      <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-6 shadow-[var(--ds-shadow-sm)]">
        <p className="text-sm text-[var(--ds-color-text-secondary)]">
          Redirecionando para validação do documento...
        </p>
        <p className="mt-2 text-sm">
          Se não for redirecionado, <Link href="/verify" className="text-[var(--ds-color-action-primary)] underline">clique aqui</Link>.
        </p>
      </div>
    </main>
  );
}
