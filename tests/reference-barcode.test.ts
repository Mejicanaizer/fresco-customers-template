import assert from 'node:assert/strict';
import { test } from 'node:test';
import { referenceBarcode } from '../src/lib/reference-barcode.ts';

test('numeric public reference uses Code 128 C with its checksum and stop symbol', () => {
  // 105 (start C), 26, 09, 25, 10, 48, 72, 9 (mod-103 checksum), 106 (stop).
  const expected = ['11010011100', '11100100110', '11001001000', '11100101100', '11001000100', '11101110110', '10011000010', '11001001000', '1100011101011'].join('');
  const result = referenceBarcode('260925104872');
  assert.equal(result.modules, expected);
  assert.equal(result.width, expected.length + 20);
  const reconstructed = Array(result.width).fill('0');
  for (const bar of result.bars) reconstructed.fill('1', bar.x, bar.x + bar.width);
  assert.equal(reconstructed.join(''), `0000000000${expected}0000000000`);
});

test('alphanumeric reference retains letters, digits and hyphen in Code 128 B', () => {
  // 104 (start B), A=33, B=34, -=13, 1=17, 2=18, 93 (checksum), 106 (stop).
  const expected = ['11010010000', '10100011000', '10001011000', '10011011100', '10011100110', '11001110010', '10100011110', '1100011101011'].join('');
  assert.equal(referenceBarcode('AB-12').modules, expected);
});
