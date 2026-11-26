import { createInitialState, validateState, migrateLegacy, uid } from './domain.js';

const DB_NAME = 'price-tracker-universal-v2';
const STATE_KEY = 'price-tracker-universal-v2-state';
const SNAPSHOT_KEY = 'price-tracker-universal-v2-snapshots';
const RECOVERY_KEY = 'price-tracker-universal-v2-recovery';
const MAX_SNAPSHOTS = 8;
let database = null;
let memoryState = null;
let mode = 'memory';
let warning = '';
let pending = Promise.resolve();

function localRead(key) { try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; } }
function localWrite(key, value) {
  if (!globalThis.localStorage) throw new Error('Armazenamento local indisponível.');
  globalThis.localStorage.setItem(key, value);
}
function recoveryCopies() {
  const raw = localRead(RECOVERY_KEY);
  if (!raw) return [];
  const copies = JSON.parse(raw);
  if (!Array.isArray(copies) || copies.some(copy => !copy || typeof copy.raw !== 'string' || typeof copy.storageKey !== 'string')) {
    throw new Error('O arquivo local de recuperação está inválido.');
  }
  return copies;
}
function protectLocalRaw(storageKey, raw) {
  // Never prune raw recovery copies automatically. A malformed archive or quota
  // failure blocks replacing the original rather than silently discarding it.
  const copies = recoveryCopies();
  const existing = copies.find(copy => copy.storageKey === storageKey && copy.raw === raw);
  if (existing) return existing;
  const copy = { id: uid('recovery'), createdAt: new Date().toISOString(), storageKey, raw };
  const serialized = JSON.stringify([...copies, copy]);
  localWrite(RECOVERY_KEY, serialized);
  if (localRead(RECOVERY_KEY) !== serialized) throw new Error('Não foi possível confirmar a cópia de recuperação.');
  return copy;
}
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('A gravação foi cancelada.'));
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao gravar dados.'));
  });
}
function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function openDatabase() {
  if (database) return database;
  if (!globalThis.indexedDB) throw new Error('IndexedDB indisponível.');
  database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Feche outra aba do aplicativo para atualizar o armazenamento.'));
  });
  return database;
}

export async function loadState() {
  let state = null;
  let corruptLocalState = false;
  let recovery = null;
  try {
    const db = await openDatabase();
    state = await requestResult(db.transaction('state', 'readonly').objectStore('state').get('current'));
    mode = 'indexeddb'; warning = '';
  } catch (error) {
    mode = 'localstorage';
    warning = 'Armazenamento simplificado ativo. Exporte um backup para proteger seus dados.';
  }
  if (!state) {
    const stored = localRead(STATE_KEY);
    if (stored) {
      try { state = validateState(JSON.parse(stored)); } catch {
        corruptLocalState = true;
        try { recovery = protectLocalRaw(STATE_KEY, stored); } catch { /* Keep original even if quota prevents its copy. */ }
        warning = recovery
          ? 'O cadastro local não pôde ser lido. O conteúdo original foi preservado, com uma cópia de recuperação. Restaure um backup para recuperar os dados.'
          : 'O cadastro local não pôde ser lido e a cópia de recuperação não pôde ser salva. O conteúdo original permanece intacto; nenhuma substituição foi realizada.';
      }
    }
  }
  if (state) state = validateState(state);
  else state = createInitialState();
  const migration = migrateLegacy(state, localRead('nuc-prices-v1'), localRead('nuc-comparison-v1'));
  state = migration.state;
  memoryState = state;
  // Opening the app must not replace an unreadable record with an empty catalog.
  if (!corruptLocalState) {
    try { await saveState(state, { snapshot: false }); } catch (error) {
      warning = error.message;
      if (mode !== 'indexeddb') mode = 'memory';
    }
  }
  return { state, mode, warning, migration, recovery };
}

export function saveState(input, { snapshot = true } = {}) {
  const state = validateState(input);
  state.meta.updatedAt = new Date().toISOString();
  const execute = async () => {
    if (mode === 'indexeddb') {
      const db = await openDatabase();
      const transaction = db.transaction(['state', 'snapshots'], 'readwrite');
      const completion = transactionDone(transaction);
      const states = transaction.objectStore('state');
      const snapshots = transaction.objectStore('snapshots');
      const previousRequest = states.get('current');
      previousRequest.onsuccess = () => {
        const previous = previousRequest.result;
        if (snapshot && previous) snapshots.put({ id: uid('snapshot'), createdAt: new Date().toISOString(), state: previous });
        states.put(state, 'current');
        const all = snapshots.getAll();
        all.onsuccess = () => {
          const records = all.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          for (const record of records.slice(MAX_SNAPSHOTS)) snapshots.delete(record.id);
        };
      };
      await completion;
    } else {
      try {
        const previous = localRead(STATE_KEY);
        let previousState = null;
        if (previous) {
          try { previousState = validateState(JSON.parse(previous)); }
          catch { protectLocalRaw(STATE_KEY, previous); }
        }
        if (snapshot && previousState) {
          let snapshots = [];
          const rawSnapshots = localRead(SNAPSHOT_KEY);
          try {
            snapshots = JSON.parse(rawSnapshots || '[]');
            if (!Array.isArray(snapshots)) throw new Error('Pontos de recuperação inválidos.');
          } catch {
            if (rawSnapshots) protectLocalRaw(SNAPSHOT_KEY, rawSnapshots);
            snapshots = [];
          }
          snapshots.unshift({ id: uid('snapshot'), createdAt: new Date().toISOString(), state: previousState });
          localWrite(SNAPSHOT_KEY, JSON.stringify(snapshots.slice(0, MAX_SNAPSHOTS)));
        }
        localWrite(STATE_KEY, JSON.stringify(state));
        mode = 'localstorage';
      } catch {
        throw new Error('Não foi possível salvar no dispositivo. Os dados desta sessão continuam na tela; exporte um backup antes de fechar.');
      }
    }
    memoryState = state;
    return { state, mode, warning };
  };
  const result = pending.then(execute, execute);
  pending = result.catch(() => {});
  return result;
}

export async function listSnapshots() {
  if (mode === 'indexeddb') {
    const db = await openDatabase();
    const records = await requestResult(db.transaction('snapshots', 'readonly').objectStore('snapshots').getAll());
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  try { const result = JSON.parse(localRead(SNAPSHOT_KEY) || '[]'); return Array.isArray(result) ? result : []; } catch { return []; }
}

export async function restoreSnapshot(id) {
  const snapshot = (await listSnapshots()).find(item => item.id === id);
  if (!snapshot) throw new Error('Ponto de recuperação não encontrado.');
  const state = validateState(snapshot.state);
  await saveState(state);
  return state;
}

export function listRecoveryCopies() {
  try { return recoveryCopies(); } catch { return []; }
}

export async function requestPersistence() {
  try { return Boolean(await globalThis.navigator?.storage?.persist?.()); } catch { return false; }
}

export function storageStatus() { return { mode, warning, hasMemoryState: Boolean(memoryState) }; }
