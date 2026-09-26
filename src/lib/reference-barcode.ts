import JsBarcode from 'jsbarcode';

/** Encode only the public reference, never the private receipt/management token. */
export function referenceBarcode(reference: string) {
  const encoded: { encodings?: Array<{ data: string }> } = {};
  JsBarcode(encoded, reference, { format: 'CODE128', displayValue: false });
  const modules = encoded.encodings!.map(part => part.data).join('');
  const bars = Array.from(modules.matchAll(/1+/g), match => ({ x: match.index! + 10, width: match[0].length }));
  return { modules, width: modules.length + 20, bars };
}
