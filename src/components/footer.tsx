'use client';

import React from 'react';
import { PoweredByBadge } from '@bengo-hub/shared-ui-lib';
import { useTenantBranding } from '@/providers/tenant-branding-provider';

export function Footer() {
  const { tenant } = useTenantBranding();
  const tenantName = tenant?.name || 'Urban Loft Cafe';
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full mt-auto">
      <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 text-center md:text-left">
              All Rights Reserved. <span className="text-slate-900 dark:text-white font-bold">{tenantName}</span> &copy; {currentYear}.
            </div>
            
            <PoweredByBadge />
          </div>
        </div>
      </div>
    </footer>
  );
}
