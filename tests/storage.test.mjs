import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, exportBackup, importBackup } from '../src/domain.js';

function mockStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test('fallback keeps existing legacy data and bounded recoverable checkpoints', async () => {
  const local = mockStorage(); globalThis.localStorage = local;
  local.setItem('nuc-prices-v1', '[{"config":"32 GB / 2 TB — montado","store":"Newegg","price":1500,"date":"23/11/2026, 08:00:00"}]');
  const original = local.getItem('nuc-prices-v1');
  const storage = await import('../src/storage.js?test=local');
  const loaded = await storage.loadState();
  assert.equal(loaded.mode, 'localstorage');
  assert.equal(loaded.migration.migrated, 1);
  assert.equal(local.getItem('nuc-prices-v1'), original);
  let state = loaded.state;
  for (let i = 0; i < 12; i++) { state = structuredClone(state); state.products[0].name = `Changed ${i}`; await storage.saveState(state); }
  const snapshots = await storage.listSnapshots();
  assert.equal(snapshots.length, 8);
  const restored = await storage.restoreSnapshot(snapshots[0].id);
  assert.notEqual(restored.products[0].name, state.products[0].name);
  const reloaded = await storage.loadState();
  assert.equal(reloaded.migration.migrated, 0);
  assert.equal(reloaded.state.observations.length, 1);
});

test('storage failure is reported rather than claiming persistence', async () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const storage = await import('../src/storage.js?test=blocked');
  const loaded = await storage.loadState();
  assert.equal(loaded.mode, 'memory');
  assert.match(loaded.warning, /Não foi possível salvar/);
  await assert.rejects(storage.saveState(loaded.state), /Não foi possível salvar/);
});

test('opening corrupted local state preserves exact raw content; later saves require a verified recovery copy', async () => {
  const local = mockStorage(); globalThis.localStorage = local;
  const key = 'price-tracker-universal-v2-state';
  const raw = '{"schemaVersion":2,"products":[{"id":"important-product","name":"Minha compra"}],';
  local.setItem(key, raw);
  const storage = await import('../src/storage.js?test=corrupt-state');
  const loaded = await storage.loadState();
  assert.equal(local.getItem(key), raw, 'initialization must not overwrite unreadable data');
  assert.match(loaded.warning, /conteúdo original foi preservado/);
  assert.equal(storage.listRecoveryCopies()[0].raw, raw, 'recovery preserves byte-for-byte input');
  const again = await storage.loadState();
  assert.equal(local.getItem(key), raw);
  assert.equal(storage.listRecoveryCopies().length, 1, 'repeat opening does not duplicate the recovery copy');
  again.state.products[0].name = 'Novo cadastro confirmado';
  await storage.saveState(again.state);
  assert.equal(JSON.parse(local.getItem(key)).products[0].name, 'Novo cadastro confirmado');
  assert.equal(storage.listRecoveryCopies()[0].raw, raw, 'explicit later saves do not discard recovery');
});

test('quota failure protecting corrupted state blocks replacing its original', async () => {
  const local = mockStorage();
  const key = 'price-tracker-universal-v2-state';
  const raw = '{broken original}';
  local.setItem(key, raw);
  const write = local.setItem;
  local.setItem = (storageKey, value) => {
    if (storageKey === 'price-tracker-universal-v2-recovery') throw new Error('quota');
    write(storageKey, value);
  };
  globalThis.localStorage = local;
  const storage = await import('../src/storage.js?test=corrupt-quota');
  const loaded = await storage.loadState();
  assert.equal(local.getItem(key), raw);
  assert.match(loaded.warning, /nenhuma substituição/);
  await assert.rejects(storage.saveState(loaded.state), /Não foi possível salvar/);
  assert.equal(local.getItem(key), raw, 'failed quarantine must never replace the original');
});

test('schema-invalid JSON is also preserved and snapshot corruption is safeguarded before replacement', async () => {
  const local = mockStorage(); globalThis.localStorage = local;
  const raw = '{"schemaVersion":99,"personal":"preserve-me"}';
  local.setItem('price-tracker-universal-v2-state', raw);
  const storage = await import('../src/storage.js?test=invalid-schema');
  const loaded = await storage.loadState();
  assert.equal(local.getItem('price-tracker-universal-v2-state'), raw);
  await storage.saveState(loaded.state);
  const rawSnapshots = '[broken snapshot collection]';
  local.setItem('price-tracker-universal-v2-snapshots', rawSnapshots);
  await storage.saveState(loaded.state);
  assert.deepEqual(storage.listRecoveryCopies().map(copy => copy.raw), [raw, rawSnapshots]);
});

test('full backup replacement restores customized seed products, projects and preferences', async () => {
  globalThis.localStorage = mockStorage();
  const source = createInitialState();
  source.products.find(product => product.id === 'nuc-32-2tb').targetUSD = 170000;
  source.products.find(product => product.id === 'nuc-32-2tb').name = 'Meu NUC personalizado';
  source.projects.find(project => project.id === 'nuc-build-32').items.find(item => item.productId === 'ssd-2tb').owned = true;
  source.settings.usdBrl = 5.75;
  source.settings.country = 'US';
  const restored = importBackup(exportBackup(source), createInitialState(), { mode: 'replace' });
  const storage = await import('../src/storage.js?test=replace-restore');
  await storage.loadState();
  await storage.saveState(restored);
  const loaded = await storage.loadState();
  const product = loaded.state.products.find(product => product.id === 'nuc-32-2tb');
  assert.equal(product.name, 'Meu NUC personalizado');
  assert.equal(product.targetUSD, 170000);
  assert.equal(loaded.state.projects.find(project => project.id === 'nuc-build-32').items.find(item => item.productId === 'ssd-2tb').owned, true);
  assert.equal(loaded.state.settings.usdBrl, 5.75);
  assert.equal(loaded.state.settings.country, 'US');
});
