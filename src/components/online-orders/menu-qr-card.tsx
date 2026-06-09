'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';

/**
 * MenuQRCard — a scannable QR for the outlet's public online-ordering menu (table tents / posters).
 * Encodes the online-store URL; rendered client-side via the qrcode lib (no external service).
 */
export function MenuQRCard({ url, label }: { url: string; label?: string }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then((d) => { if (active) setDataUrl(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [url]);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-5">
      <div className="shrink-0">
        {dataUrl ? (
          <img src={dataUrl} alt="Online menu QR code" className="h-28 w-28 rounded-lg border border-border" />
        ) : (
          <div className="h-28 w-28 rounded-lg bg-muted animate-pulse" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">{label ?? 'Scan to order online'}</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1 break-all">{url}</p>
        {dataUrl && (
          <a
            href={dataUrl}
            download="menu-qr.png"
            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        )}
      </div>
    </div>
  );
}
