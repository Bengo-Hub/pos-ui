'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

export function Footer() {
  const { tenant } = useTenantBranding();
  const tenantName = tenant?.name || 'Urban Loft Cafe';

  return (
    <footer className="border-t border-border bg-background py-4 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>All Rights Reserved. {tenantName} &copy; {new Date().getFullYear()}.</span>
        <a
          href="https://codevertexitsolutions.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-primary transition-colors"
        >
          Powered by <span className="font-bold text-primary">Codevertex IT Solutions</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </footer>
  );
}
