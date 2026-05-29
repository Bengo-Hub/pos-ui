'use client';

import { useState } from 'react';
import { Globe, Link2, Loader2, Save } from 'lucide-react';
import { Button, Card, CardContent, CardHeader } from '@/components/ui/base';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/store/auth';
import { useModuleAccess } from '@/hooks/use-module-access';
import { toast } from 'sonner';
import { inputClass, labelClass } from './shared';

const AUTH_API_URL_DEFAULT = process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://sso.codevertexitsolutions.com';
const POS_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://posapi.codevertexitsolutions.com';

export function IntegrationsTab() {
  const { isSuperUser } = useModuleAccess();
  const user = useAuthStore((s) => s.user);
  const isPlatformOwner = isSuperUser || user?.isPlatformOwner || user?.isSuperUser;

  const [authApiUrl, setAuthApiUrl] = useState(AUTH_API_URL_DEFAULT);
  const [allowedOrigins, setAllowedOrigins] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [saving, setSaving] = useState(false);

  const testConnection = async () => {
    setTestStatus('loading');
    try {
      const res = await fetch(`${authApiUrl}/healthz`);
      setTestStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setTestStatus('fail');
    }
  };

  const handleSave = async () => {
    if (!allowedOrigins.trim()) { toast.success('No changes to save'); return; }
    setSaving(true);
    try {
      await apiClient.put('/api/v1/admin/config/allowed_origins', {
        config_value: allowedOrigins,
        config_type: 'string',
      });
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">S2S Auth</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className={labelClass}>Auth-API URL</label>
            <div className="flex gap-3">
              <input
                value={authApiUrl}
                onChange={(e) => setAuthApiUrl(e.target.value)}
                className={`${inputClass} flex-1`}
              />
              <Button
                type="button"
                size="sm"
                onClick={testConnection}
                disabled={testStatus === 'loading'}
              >
                {testStatus === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
              </Button>
            </div>
            {testStatus === 'ok' && <p className="text-xs text-green-600">Connection successful</p>}
            {testStatus === 'fail' && <p className="text-xs text-red-600">Connection failed</p>}
          </div>
          <div className="space-y-2">
            <label className={labelClass}>POS API URL</label>
            <input
              value={POS_API_URL}
              readOnly
              className={`${inputClass} opacity-60 cursor-not-allowed`}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">CORS</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPlatformOwner ? (
            <>
              <div className="space-y-2">
                <label className={labelClass}>Allowed Origins</label>
                <input
                  value={allowedOrigins}
                  onChange={(e) => setAllowedOrigins(e.target.value)}
                  placeholder="https://app.example.com, https://admin.example.com"
                  className={inputClass}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list of allowed CORS origins.</p>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              CORS configuration is managed by the platform administrator.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
