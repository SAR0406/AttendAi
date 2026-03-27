'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { ArrowLeft } from 'lucide-react';

interface NavbarProps {
  /** If provided, renders a back link with this label. */
  backHref?: string;
  backLabel?: string;
}

export function Navbar({ backHref, backLabel = 'Back' }: NavbarProps) {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Left: logo or back button */}
        <div className="flex items-center gap-3 min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{backLabel}</span>
            </Link>
          ) : (
            <Link
              href="/"
              className="font-bold text-brand-600 text-lg tracking-tight hover:opacity-80 transition-opacity"
              aria-label="AttendAi home"
            >
              AttendAi
            </Link>
          )}
        </div>

        {/* Right: nav links + user */}
        <div className="flex items-center gap-4">
          {!isDashboard && !backHref && (
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Dashboard
            </Link>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  );
}
