'use client';

import { useState, useEffect } from 'react';
import { Building2, Search, LogOut, ChevronRight, Loader2 } from 'lucide-react';
import { companiesService, Company } from '@/services/companiesService';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface Props {
  open: boolean;
  onSelect: (company: Company) => void;
  onLogout: () => void;
  currentCompanyId?: string | null;
}

export default function CompanySelectorModal({ open, onSelect, onLogout, currentCompanyId }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    companiesService.findAll()
      .then((data) => setCompanies(data ?? []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = companies.filter((c) =>
    c.razao_social.toLowerCase().includes(search.toLowerCase()) ||
    c.cnpj.includes(search)
  );

  return (
    <div className="ds-modal-overlay z-50">
      <div className="ds-modal-shell mx-4 max-w-lg">
        <div className="bg-[image:var(--ds-gradient-brand)] px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="h-6 w-6" />
            <h2 className="text-lg font-bold">Selecionar Empresa</h2>
          </div>
          <p className="text-sm text-white/80">
            Escolha a empresa para operar como Administrador Geral
          </p>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="px-6 pb-4 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[var(--ds-color-text-muted)]">
              <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              <span className="text-sm">Carregando empresas...</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--ds-color-text-muted)]">
              {search ? 'Nenhuma empresa encontrada.' : 'Sem empresas cadastradas.'}
            </p>
          ) : (
            <ul className="space-y-1 mt-1">
              {filtered.map((company) => {
                const isActive = company.id === currentCompanyId;
                return (
                  <li key={company.id}>
                    <button
                      onClick={() => {
                        selectedTenantStore.set({ companyId: company.id, companyName: company.razao_social });
                        onSelect(company);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors ${
                        isActive
                          ? 'border border-[var(--ds-color-action-primary)]/20 bg-[var(--ds-color-primary-subtle)]'
                          : 'border border-transparent hover:bg-[var(--ds-color-surface-muted)]/18'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isActive ? 'bg-[image:var(--ds-gradient-brand)] text-white' : 'bg-[var(--ds-color-surface-muted)]/35 text-[var(--ds-color-text-muted)]'
                        }`}>
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${isActive ? 'text-[var(--ds-color-action-primary)]' : 'text-[var(--ds-color-text-primary)]'}`}>
                            {company.razao_social}
                          </p>
                          <p className="truncate text-xs text-[var(--ds-color-text-muted)]">CNPJ: {company.cnpj}</p>
                        </div>
                      </div>
                      {isActive ? (
                        <Badge variant="primary" className="ml-2 flex-shrink-0">Atual</Badge>
                      ) : (
                        <ChevronRight className="ml-2 h-4 w-4 flex-shrink-0 text-[var(--ds-color-text-muted)]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="ds-modal-footer items-center justify-between">
          <span className="text-xs text-[var(--ds-color-text-muted)]">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''}
          </span>
          <Button
            type="button"
            onClick={onLogout}
            variant="ghost"
            className="gap-2 text-[var(--ds-color-danger)] hover:text-[var(--ds-color-danger)]"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
