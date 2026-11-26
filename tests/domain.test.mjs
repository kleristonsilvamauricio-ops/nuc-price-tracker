import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, parseMoney, quoteTotal, convertMinor, compareProduct, compareProject, latestObservations, historyStats, safeUrl, validateState, exportBackup, importBackup, migrateLegacy } from '../src/domain.js';

const NOW = '2026-11-26T18:00:00.000Z';
const fresh = () => createInitialState(NOW);
const observation = (values = {}) => ({ id: 'quote-1', productId: 'nuc-32-2tb', storeId: 'newegg-us', seller: 'Seller A', url: 'https://www.newegg.com/test', priceMinor: 100000, currency: 'USD', shippingMinor: 0, taxMinor: 0, discountMinor: 0, condition: 'new', availability: 'in_stock', observedAt: NOW, recordedAt: NOW, source: 'manual', notes: '', shippingOrigin: 'US', ...values });

test('parses BRL and USD prices into exact cents', () => {
  for (const [text, cents] of [['1.299,90', 129990], ['1,299.90', 129990], ['R$ 199,99', 19999], ['US$ 199.99', 19999], ['1.234', 123400], ['1,234', 123400], ['0,01', 1], ['12', 1200], ['0', 0]]) assert.equal(parseMoney(text), cents);
  assert.equal(parseMoney(199.99), 19999);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('  '), null);
});
test('rejects malformed, fractional-cent, negative and nonfinite money', () => {
  for (const input of [-1, NaN, Infinity, '1e3', '12,34,56', '1.23.456', '-1', {}, 0.001]) assert.throws(() => parseMoney(input));
  assert.throws(() => parseMoney('1,234', { locale: 'pt-BR' }));
  assert.throws(() => parseMoney('1.234', { locale: 'en-US' }));
});
test('empty costs are unknown, explicit zero is free', () => {
  const partial = quoteTotal(observation({ shippingMinor: null, taxMinor: null }));
  assert.equal(partial.totalMinor, null);
  assert.equal(partial.knownTotalMinor, 100000);
  assert.deepEqual(partial.missing, ['frete', 'impostos']);
  assert.equal(quoteTotal(observation()).totalMinor, 100000);
});
test('currency conversion requires rate only across different currencies', () => {
  assert.equal(convertMinor(10000, 'USD', 'BRL', 5.37), 53700);
  assert.equal(convertMinor(53700, 'BRL', 'USD', 5.37), 10000);
  assert.equal(convertMinor(10000, 'USD', 'BRL', null), null);
  assert.equal(convertMinor(10000, 'USD', 'USD', null), 10000);
  assert.equal(convertMinor(null, 'USD', 'USD', 5), null);
});
test('latest quote replaces obsolete availability for same seller and URL', () => {
  const state = fresh();
  state.observations = [observation({ observedAt: '2026-11-26T17:00:00Z' }), observation({ id: 'quote-2', availability: 'out_of_stock' })];
  assert.equal(latestObservations(state).length, 1);
  assert.equal(compareProduct(state, 'nuc-32-2tb', { currency: 'USD', now: NOW }).best, null);
});
test('tracking URL parameters do not retain an obsolete price as another offer', () => {
  const state = fresh();
  state.observations = [observation({ url: 'https://www.newegg.com/test?sku=1&utm_source=old', observedAt: '2026-11-26T17:00:00Z' }), observation({ id: 'quote-2', url: 'https://www.newegg.com/test?fbclid=123&sku=1', availability: 'out_of_stock' })];
  assert.equal(latestObservations(state).length, 1);
  assert.equal(compareProduct(state, 'nuc-32-2tb', { currency: 'USD', now: NOW }).best, null);
  assert.match(state.observations[0].url, /utm_source/);
});
test('ranking separates exact product, condition, freshness, country and totals', () => {
  const state = fresh();
  state.observations = [
    observation(),
    observation({ id: 'old', url: 'https://www.newegg.com/old', priceMinor: 1, observedAt: '2026-11-23T18:00:00Z' }),
    observation({ id: 'used', condition: 'used', priceMinor: 1 }),
    observation({ id: 'partial', url: 'https://www.newegg.com/partial', priceMinor: 80000, taxMinor: null }),
    observation({ id: 'other', productId: 'nuc-64-2tb', priceMinor: 1 }),
    observation({ id: 'br', storeId: 'amazon-br', currency: 'BRL', priceMinor: 1 })
  ];
  const compared = compareProduct(state, 'nuc-32-2tb', { country: 'US', currency: 'USD', now: NOW });
  assert.equal(compared.best.observation.id, 'quote-1');
  assert.equal(compared.bestKnown.observation.id, 'partial');
  assert.equal(compared.offers.length, 4);
});
test('a missing exchange rate is never replaced with parity', () => {
  const state = fresh(); state.observations = [observation()];
  const compared = compareProduct(state, 'nuc-32-2tb', { currency: 'BRL', now: NOW });
  assert.equal(compared.best, null);
  assert.equal(compared.missingCurrency, true);
});
test('future timestamps are preserved but excluded from purchase ranking even with stale quotes enabled', () => {
  const state = fresh();
  state.observations = [observation({ id: 'future', priceMinor: 1, observedAt: '2028-11-26T18:00:00.000Z' }), observation({ id: 'current', url: 'https://www.newegg.com/current' })];
  const compared = compareProduct(validateState(state), 'nuc-32-2tb', { currency: 'USD', now: NOW, includeStale: true });
  assert.equal(compared.best.observation.id, 'current');
  assert.equal(compared.offers.find(offer => offer.observation.id === 'future').future, true);
  assert.equal(compared.offers.find(offer => offer.observation.id === 'future').eligible, false);
  assert.equal(state.observations[0].observedAt, '2028-11-26T18:00:00.000Z');
});
test('project sums quantities and charges and preserves missing components', () => {
  const state = fresh();
  state.observations = [observation({ productId: 'ram-32', priceMinor: 20000, shippingMinor: 1000, taxMinor: 1000 })];
  const project = { id: 'project', name: 'Test', currency: 'USD', items: [{ productId: 'ram-32', quantity: 2 }, { productId: 'ssd-2tb', quantity: 1 }], extrasMinor: 500 };
  let compared = compareProject(state, project, { now: NOW });
  assert.equal(compared.totalMinor, null);
  assert.equal(compared.knownSubtotalMinor, 44500);
  project.items[1].owned = true;
  compared = compareProject(state, project, { now: NOW });
  assert.equal(compared.totalMinor, 44500);
  project.items[0].quantity = 0;
  assert.equal(compareProject(state, project, { now: NOW }).totalMinor, null);
});
test('project converts both lines and explicit project costs', () => {
  const state = fresh(); state.settings.usdBrl = 5;
  state.observations = [observation({ productId: 'ram-32', priceMinor: 20000 })];
  const project = { id: 'project', name: 'Test', currency: 'USD', items: [{ productId: 'ram-32', quantity: 1 }], extrasMinor: 1000 };
  assert.equal(compareProject(state, project, { now: NOW, currency: 'BRL' }).totalMinor, 105000);
});
test('history does not mix currencies or invent a timestamp', () => {
  const state = fresh(); state.observations = [observation(), observation({ id: 'other', currency: 'BRL', priceMinor: 10 }), observation({ id: 'undated', observedAt: null })];
  assert.equal(historyStats(state, 'nuc-32-2tb', 'USD').count, 1);
  assert.equal(historyStats(state, 'nuc-32-2tb', 'USD').minMinor, 100000);
});
test('URLs exclude executable schemes and embedded credentials', () => {
  assert.equal(safeUrl('https://example.com/item'), 'https://example.com/item');
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/x', 'https://user:pass@example.com/', '//example.com']) assert.throws(() => safeUrl(url));
});
test('backup roundtrip preserves data and merge is idempotent', () => {
  const state = fresh(); state.observations = [observation()];
  const text = exportBackup(state);
  assert.deepEqual(importBackup(text), validateState(state));
  const merged = importBackup(text, state);
  assert.equal(merged.observations.length, 1);
  assert.equal(importBackup(text, merged).observations.length, 1);
});
test('backup rejects references, duplicate IDs, malformed dates, bad amounts and pollution', () => {
  for (const mutate of [
    s => s.observations.push(observation({ productId: 'missing' })),
    s => s.products.push({ ...s.products[0] }),
    s => s.observations.push(observation({ observedAt: '2026-02-31T01:00:00Z' })),
    s => s.observations.push(observation({ priceMinor: 1.5 })),
    s => s.observations.push(observation({ discountMinor: 100001 })),
    s => s.observations.push(observation({ url: 'javascript:alert(1)' })),
    s => s.projects[0].items[0].quantity = -1,
    s => s.settings.usdBrl = 0
  ]) { const state = fresh(); mutate(state); assert.throws(() => validateState(state)); }
  assert.throws(() => importBackup('{"app":"PriceTrackerUniversal","version":2,"state":{"__proto__":{"polluted":true}}}'));
  assert.throws(() => importBackup('{}'));
  assert.throws(() => importBackup('not json'));
});
test('legacy migration preserves dates, comparisons, original inputs and idempotence', () => {
  const legacy = [{ config: '32 GB / 2 TB — montado', store: 'Newegg', price: 999.99, url: 'https://www.newegg.com/test', date: '23/11/2026, 18:30:00' }];
  const old = JSON.stringify(legacy);
  const result = migrateLegacy(fresh(), old, { bare: '800', ram32: '100', ssd: '200', win: '199.99', ownssd: true, extra: '10' }, NOW);
  assert.equal(result.migrated, 5);
  assert.equal(result.state.observations[0].observedAt, '2026-11-23T21:30:00.000Z');
  assert.equal(result.state.observations[0].availability, 'unknown');
  assert.equal(result.state.observations[1].observedAt, null);
  assert.equal(result.state.projects[0].items.find(i => i.productId === 'ssd-2tb').owned, true);
  assert.equal(result.state.projects[0].extrasMinor, 1000);
  assert.equal(migrateLegacy(result.state, old, { bare: '900' }, NOW).migrated, 0);
  assert.equal(JSON.stringify(legacy), old);
});
test('unrecognized legacy timestamps stay unknown and invalid URLs are removed', () => {
  const result = migrateLegacy(fresh(), [{ config: 'Outros', store: 'Outro', price: 15, date: 'unknown', url: 'javascript:alert(1)' }], null, NOW);
  assert.equal(result.state.observations[0].observedAt, null);
  assert.equal(result.state.observations[0].url, '');
  assert.equal(result.warnings.length, 1);
});
test('initial catalog has zero fabricated observations and reference remains metadata', () => {
  const state = validateState(fresh());
  assert.equal(state.observations.length, 0);
  assert.equal(state.meta.historicalReference.priceMinor, 186900);
  assert.equal(state.meta.historicalReference.verified, false);
  assert.equal(state.stores.find(store => store.id === 'amazon-us').searchUrl.includes('{query}'), true);
});
