import { useMemo, useState } from 'react';
import { referenceBarcode } from '../lib/reference-barcode';

export function ReceiptReference({ reference, barcode = false }: { reference: string; barcode?: boolean }) {
  const [copied, setCopied] = useState(false);
  const encoded = useMemo(() => barcode ? referenceBarcode(reference) : null, [reference, barcode]);
  return <div className="receipt-reference">
    {encoded && <svg className="pass-bars" aria-hidden="true" focusable="false" viewBox={`0 0 ${encoded.width} 52`} preserveAspectRatio="none">
      <rect width={encoded.width} height="52" fill="white" />
      {encoded.bars.map(bar => <rect key={bar.x} x={bar.x} y="4" width={bar.width} height="44" fill="#111" />)}
    </svg>}
    <div className="pass-reference"><span>{reference}</span><button type="button" aria-label="Copiar referencia" onClick={() => { void (async () => { try { await navigator.clipboard.writeText(reference); setCopied(true); } catch { setCopied(false); } })(); }}>{copied ? 'Copiado' : 'Copiar'}</button></div>
  </div>;
}
