'use client';

import { useState, useEffect } from 'react';
import { Building2, Search, LogOut, ChevronRight, Loader2 } from 'lucide-react';
import { companiesService, Company } from '@/services/companiesService';
import { selectedTenantStore } from '@/lib/selectedTenantStore';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="h-6 w-6" />
            <h2 className="text-lg font-bold">Selecionar Empresa</h2>
          </div>
          <p className="text-blue-100 text-sm">
            Escolha a empresa para operar como Administrador Geral
          </p>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="px-6 pb-4 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-sm">Carregando empresas...</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">
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
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                            {company.razao_social}
                          </p>
                          <p className="text-xs text-gray-400 truncate">CNPJ: {company.cnpj}</p>
                        </div>
                      </div>
                      {isActive ? (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
                          Atual
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-400">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} cadastrada{companies.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
