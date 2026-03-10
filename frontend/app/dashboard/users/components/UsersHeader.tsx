import { Plus, UserRound } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function UsersHeader() {
  return (
    <Card tone="elevated" padding="lg" className="ds-crud-hero">
      <CardHeader className="ds-crud-hero__header md:flex-row md:items-start md:justify-between">
        <div className="ds-crud-hero__lead">
          <div className="ds-crud-hero__icon">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="ds-crud-hero__copy">
            <span className="ds-crud-hero__eyebrow">Acesso e governança</span>
            <CardTitle className="text-2xl">Usuários</CardTitle>
            <CardDescription>Gerencie os usuários cadastrados no sistema.</CardDescription>
          </div>
        </div>
        <Link
          href="/dashboard/users/new"
          className={cn(buttonVariants(), 'inline-flex items-center')}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo usuário
        </Link>
      </CardHeader>
    </Card>
  );
}
