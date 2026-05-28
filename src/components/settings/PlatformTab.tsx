'use client';

import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/base';

export function PlatformTab() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Platform Configuration</span>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Platform-level settings such as service config, license keys, and infrastructure defaults are managed here.
            These settings affect all tenants and require platform admin access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
