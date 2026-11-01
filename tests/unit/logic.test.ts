import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, normalize, levenshtein, tokenScore } from '../../src/server/services/search';
import { parseEGP, percentOf, formatEGP, toLatinDigits } from '../../src/server/money';
import { computeHmac, verifyHmac, mockTransaction } from '../../src/server/services/payments/paymob';
import { deriveNeeds } from '../../src/server/services/recommend';
import { normalizePhone } from '../../src/server/services/orders';

test('search: "لاب i7 جيل عاشر" → i7 + gen 10', () => {
  const p = parseQuery('لاب i7 جيل عاشر');
  assert.deepEqual(p.filters.cpu_tier, ['i7']); assert.deepEqual(p.filters.cpu_gen, [10]); assert.deepEqual(p.text, []);
});
test('search: "Dell 16GB" → brand dell + 16GB RAM', () => {
  const p = parseQuery('Dell 16GB');
  assert.deepEqual(p.filters.brand, ['dell']); assert.deepEqual(p.filters.ram, [16]);
});
test('search: "لاب للجرافيك" → usage graphics', () => { assert.deepEqual(parseQuery('لاب للجرافيك').filters.usage, ['graphics']); });
test('search: "RTX A2000" → GPU model, dedicated', () => {
  const p = parseQuery('RTX A2000'); assert.ok(p.filters.gpu_model?.some((g) => g.includes('a2000'))); assert.deepEqual(p.filters.gpu_type, ['dedicated']);
});
test('search: "لاب أقل من 15000" and Arabic digits / thousands', () => {
  assert.equal(parseQuery('لاب أقل من 15000').filters.max, 15000);
  assert.equal(parseQuery('لاب اقل من ١٥ الف').filters.max, 15000);
  assert.equal(parseQuery('under 20k').filters.max, 20000);
  const r = parseQuery('من 10000 الى 20000'); assert.equal(r.filters.min, 10000); assert.equal(r.filters.max, 20000);
});
test('search: processor variations', () => {
  assert.deepEqual(parseQuery('core i5').filters.cpu_tier, ['i5']);
  assert.deepEqual(parseQuery('كور اي 7').filters.cpu_tier, ['i7']);
  assert.deepEqual(parseQuery('ryzen 7 5800h').filters.cpu_tier, ['r7']);
  assert.deepEqual(parseQuery('i7-1185G7').filters.cpu_model, ['1185g7']);
  assert.deepEqual(parseQuery('11th gen').filters.cpu_gen, [11]);
  assert.deepEqual(parseQuery('الجيل الحادي عشر').filters.cpu_gen, [11]);
});
test('search: storage is not mistaken for RAM', () => {
  const p = parseQuery('512 ssd 16 رام'); assert.equal(p.filters.storage_min, 512); assert.deepEqual(p.filters.ram, [16]);
  assert.equal(parseQuery('1tb').filters.storage_min, 1024);
});
test('search: Arabic normalization and typo tolerance', () => {
  assert.equal(normalize('الإسكندرية'), 'الاسكندريه');
  assert.equal(levenshtein('thinkpd', 'thinkpad'), 1);
  assert.ok(tokenScore('elitebok', ['elitebook']) > 0);
  assert.equal(tokenScore('zzzz', ['dell']), 0);
});
test('money: integer piasters, no float drift', () => {
  assert.equal(parseEGP('15,000'), 1500000); assert.equal(parseEGP('١٥٠٠٠'), 1500000); assert.equal(parseEGP('0.1'), 10); assert.equal(parseEGP('12.345'), null); assert.equal(parseEGP('abc'), null);
  assert.equal(percentOf(1050, 5), 52); assert.equal(percentOf(1999999, 7), 139999);
  assert.equal(formatEGP(1050000, 'en'), 'EGP 10,500'); assert.equal(toLatinDigits('٠١٢'), '012');
});
test('phone normalization (Egypt)', () => {
  assert.equal(normalizePhone('01012345678'), '01012345678'); assert.equal(normalizePhone('+20 101 234 5678'), '01012345678');
  assert.equal(normalizePhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678'); assert.equal(normalizePhone('01312345678'), null); assert.equal(normalizePhone('0101234'), null);
});
test('paymob: HMAC verification and tamper detection', () => {
  const tx = mockTransaction({ id: 7, amount: 1250000, number: 'LO-1' }, true);
  assert.ok(verifyHmac(tx.obj, tx.hmac));
  assert.equal(verifyHmac({ ...tx.obj, amount_cents: 1 }, tx.hmac), false);
  assert.equal(verifyHmac({ ...tx.obj, success: false }, tx.hmac), false);
  assert.equal(verifyHmac(tx.obj, 'deadbeef'), false);
  assert.equal(verifyHmac(tx.obj, null), false);
  assert.equal(computeHmac(tx.obj).length, 128);
});
test('recommender: derived needs', () => {
  const g = deriveNeeds({ usage: 'gaming', budgetMin: null, budgetMax: null, apps: ['aaa'], pref: 'performance', reqs: [] });
  assert.equal(g.needDgpu, true); assert.equal(g.minVram, 6); assert.ok(g.minRam >= 16);
  const s = deriveNeeds({ usage: 'study', budgetMin: null, budgetMax: null, apps: ['office'], pref: 'portable', reqs: [] });
  assert.equal(s.needDgpu, false); assert.equal(s.minRam, 8);
});
