'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
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
            
            <div className="flex items-center gap-2">
              <a
                href="https://codevertexitsolutions.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 transition-all hover:ring-4 hover:ring-primary/20"
              >
                <img 
                  src="/images/logo/codevertex.png" 
                  alt="Codevertex" 
                  className="h-3.5 w-auto brightness-0 invert dark:brightness-100 dark:invert-0" 
                />
                <span className="text-[10px] font-black tracking-tight uppercase">
                  Powered by <span className="text-primary">Codevertex IT Solutions</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
