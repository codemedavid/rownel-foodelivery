import React, { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';

const QR_PIXEL_SIZE = 240;

/**
 * Renders the install link as a QR code so someone reading on a laptop can
 * install on their phone. The encoder is ~50 KB, so it is imported only when
 * this panel actually renders, and it produces a data URL rather than markup
 * so no HTML is ever injected into the page.
 */
const QrPanel: React.FC<{ url: string; caption?: string }> = ({ url, caption }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    import('qrcode')
      .then((qrcode) =>
        qrcode.toDataURL(url, {
          margin: 1,
          width: QR_PIXEL_SIZE,
          color: { dark: '#04140c', light: '#ffffff' },
        })
      )
      .then((encoded) => {
        if (isCurrent) setDataUrl(encoded);
      })
      .catch(() => {
        if (isCurrent) setHasFailed(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [url]);

  if (hasFailed) return null;

  return (
    <div className="flex items-center gap-5 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
      <div className="flex h-[124px] w-[124px] flex-shrink-0 items-center justify-center rounded-xl bg-white p-2">
        {dataUrl ? (
          <img src={dataUrl} alt={`QR code linking to ${url}`} className="h-full w-full" />
        ) : (
          <QrCode className="h-8 w-8 animate-pulse text-gray-300" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">Scan with your phone</p>
        <p className="mt-1 text-sm leading-relaxed text-white/60">
          {caption ?? 'Point your camera at the code to open this page on your phone and install from there.'}
        </p>
      </div>
    </div>
  );
};

export default QrPanel;
