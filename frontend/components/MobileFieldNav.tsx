'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Archive, ClipboardCheck, FileText, LayoutDashboard, Radio } from 'lucide-react';

const items = [
  { href: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { href: '/dashboard/tst', label: 'Campo', icon: Radio },
  { href: '/dashboard/aprs', label: 'APR', icon: FileText },
  { href: '/dashboard/pts', label: 'PT', icon: ClipboardCheck },
  { href: '/dashboard/document-registry', label: 'Docs', icon: Archive },
];

export function MobileFieldNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação mobile" className="ds-mobile-nav xl:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'ds-mobile-nav__item',
              active && 'ds-mobile-nav__item--active',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
