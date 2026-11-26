/* Price Tracker Universal: pure, dependency-free data and monetary rules. */
export const SCHEMA_VERSION = 2;
const MAX_MONEY = 100_000_000_000;
const clone = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const currencies = new Set(['BRL', 'USD']);
const countries = new Set(['BR', 'US']);
const statuses = new Set(['watching', 'ready', 'purchased', 'archived']);
const conditions = new Set(['new', 'used', 'refurbished']);
const availability = new Set(['in_stock', 'out_of_stock', 'unknown']);
const sources = new Set(['manual', 'import', 'feed', 'legacy']);
const nowISO = () => new Date().toISOString();

export function uid(prefix = 'item') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function parseMoney(input, { locale = 'auto' } = {}) {
  if (input == null || (typeof input === 'string' && !input.trim())) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0 || input * 100 > MAX_MONEY) throw new Error('Preço inválido.');
    const minor = Math.round((input + Number.EPSILON) * 100);
    if (Math.abs(minor / 100 - input) > 1e-8) throw new Error('Use no máximo duas casas decimais.');
    return minor;
  }
  if (typeof input !== 'string') throw new Error('Preço inválido.');
  let text = input.trim().replace(/^(?:US\$|R\$|\$)\s*/i, '').replace(/[\s\u00a0]/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(text)) throw new Error('Informe um preço positivo, como 1.299,90.');
  const comma = text.lastIndexOf(','), dot = text.lastIndexOf('.');
  let decimal = null;
  if (comma >= 0 && dot >= 0) decimal = comma > dot ? ',' : '.';
  else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.';
    const pieces = text.split(separator);
    if (pieces.length === 2 && pieces[1].length <= 2) decimal = separator;
    else if ((locale === 'pt-BR' && separator === ',') || (locale === 'en-US' && separator === '.')) {
      throw new Error('Use no máximo duas casas decimais.');
    }
  }
  let integer = text, fraction = '';
  if (decimal) {
    const index = text.lastIndexOf(decimal);
    integer = text.slice(0, index);
    fraction = text.slice(index + 1);
    if (fraction.length > 2 || integer.includes(decimal)) throw new Error('Preço inválido.');
  }
  if (/[.,]/.test(integer)) {
    const separator = integer.includes(',') ? ',' : '.';
    const pieces = integer.split(separator);
    if (!/^\d{1,3}$/.test(pieces[0]) || pieces.slice(1).some(part => !/^\d{3}$/.test(part))) {
      throw new Error('Separadores de milhar inválidos.');
    }
    integer = pieces.join('');
  }
  const minor = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > MAX_MONEY) throw new Error('Preço fora do limite suportado.');
  return minor;
}

export function formatMoney(minor, currency = 'USD') {
  if (minor == null || !Number.isFinite(minor)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, currencyDisplay: 'symbol' }).format(minor / 100);
}

export function safeUrl(value, { allowEmpty = true } = {}) {
  if (value == null || String(value).trim() === '') {
    if (allowEmpty) return '';
    throw new Error('Informe o link do anúncio.');
  }
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Link inválido.');
  let parsed;
  try { parsed = new URL(value.trim()); } catch { throw new Error('Use um link completo iniciado por https://.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('Somente links HTTP/HTTPS sem credenciais são aceitos.');
  }
  return parsed.href;
}

export function createInitialState(now = nowISO()) {
  const products = [
    ['nuc-32-1tb', 'ASUS NUC 15 Pro+ · 32 GB / 1 TB', 'computers', 'Intel Core Ultra 9 285H; 32 GB RAM; SSD 1 TB'],
    ['nuc-32-2tb', 'ASUS NUC 15 Pro+ · 32 GB / 2 TB', 'computers', 'Intel Core Ultra 9 285H; 32 GB RAM; SSD 2 TB; conferir Windows 11 Pro'],
    ['nuc-64-1tb', 'ASUS NUC 15 Pro+ · 64 GB / 1 TB', 'computers', 'Intel Core Ultra 9 285H; 64 GB RAM; SSD 1 TB'],
    ['nuc-64-2tb', 'ASUS NUC 15 Pro+ · 64 GB / 2 TB', 'computers', 'Intel Core Ultra 9 285H; 64 GB RAM; SSD 2 TB; conferir Windows 11 Pro'],
    ['nuc-barebone', 'ASUS NUC 15 Pro+ · barebone', 'computers', 'Intel Core Ultra 9 285H; sem RAM, SSD ou sistema'],
    ['ram-32', 'Memória DDR5 SO-DIMM · 32 GB', 'memory', 'Kit 2 × 16 GB; DDR5-5600; confirmar compatibilidade'],
    ['ram-64', 'Memória DDR5 SO-DIMM · 64 GB', 'memory', 'Kit 2 × 32 GB; DDR5-5600; confirmar compatibilidade'],
    ['ssd-2tb', 'SSD NVMe M.2 2280 · 2 TB', 'storage', '2 TB; NVMe; M.2 2280; confirmar formato e garantia'],
    ['windows-pro', 'Windows 11 Pro · licença', 'software', 'Licença legítima; verificar modalidade e transferência']
  ].map(([id, name, categoryId, specs]) => ({ id, name, brand: id.startsWith('nuc-') ? 'ASUS' : '', model: id.startsWith('nuc-') ? 'NUC 15 Pro+ 285H' : '', categoryId, specs, targetBRL: null, targetUSD: null, status: 'watching', createdAt: now }));
  const stores = [
    ['amazon-us', 'Amazon.com', 'US', 'amazon.com', 'https://www.amazon.com/s?k={query}'],
    ['bestbuy-us', 'Best Buy', 'US', 'bestbuy.com', 'https://www.bestbuy.com/site/searchpage.jsp?st={query}'],
    ['bh-us', 'B&H', 'US', 'bhphotovideo.com', 'https://www.bhphotovideo.com/c/search?q={query}'],
    ['newegg-us', 'Newegg', 'US', 'newegg.com', 'https://www.newegg.com/p/pl?d={query}'],
    ['ebay-us', 'eBay', 'US', 'ebay.com', 'https://www.ebay.com/sch/i.html?_nkw={query}'],
    ['amazon-br', 'Amazon Brasil', 'BR', 'amazon.com.br', 'https://www.amazon.com.br/s?k={query}'],
    ['mercadolivre-br', 'Mercado Livre', 'BR', 'mercadolivre.com.br', 'https://lista.mercadolivre.com.br/{query}'],
    ['kabum-br', 'KaBuM!', 'BR', 'kabum.com.br', 'https://www.kabum.com.br/busca/{query}'],
    ['magalu-br', 'Magazine Luiza', 'BR', 'magazineluiza.com.br', 'https://www.magazineluiza.com.br/busca/{query}/']
  ].map(([id, name, country, domain, searchUrl]) => ({ id, name, country, domain, searchUrl }));
  const projects = [
    { id: 'nuc-build-32', name: 'NUC · montar com 32 GB e 2 TB', currency: 'USD', items: [{ productId: 'nuc-barebone', quantity: 1 }, { productId: 'ram-32', quantity: 1 }, { productId: 'ssd-2tb', quantity: 1 }, { productId: 'windows-pro', quantity: 1 }], extrasMinor: 0 },
    { id: 'nuc-build-64', name: 'NUC · montar com 64 GB e 2 TB', currency: 'USD', items: [{ productId: 'nuc-barebone', quantity: 1 }, { productId: 'ram-64', quantity: 1 }, { productId: 'ssd-2tb', quantity: 1 }, { productId: 'windows-pro', quantity: 1 }], extrasMinor: 0 },
    { id: 'nuc-ready-32', name: 'NUC · pronto com 32 GB e 2 TB', currency: 'USD', items: [{ productId: 'nuc-32-2tb', quantity: 1 }], extrasMinor: 0 },
    { id: 'nuc-ready-64', name: 'NUC · pronto com 64 GB e 2 TB', currency: 'USD', items: [{ productId: 'nuc-64-2tb', quantity: 1 }], extrasMinor: 0 }
  ];
  return { schemaVersion: 2, products, categories: [{ id: 'computers', name: 'Computadores' }, { id: 'memory', name: 'Memórias' }, { id: 'storage', name: 'Armazenamento' }, { id: 'software', name: 'Software' }, { id: 'other', name: 'Outros' }], stores, observations: [], projects,
    settings: { country: 'ALL', displayCurrency: 'BRL', usdBrl: null, exchangeUpdatedAt: null, exchangeSource: '', staleAfterHours: 24 },
    meta: { createdAt: now, updatedAt: now, legacyMigrated: false,
      historicalReference: { productId: 'nuc-32-1tb', currency: 'USD', priceMinor: 186900, verified: false, note: 'Referência da conversa, sem cotação atual verificada.' } } };
}

export function quoteTotal(observation) {
  const missing = [];
  if (observation.shippingMinor == null) missing.push('frete');
  if (observation.taxMinor == null) missing.push('impostos');
  const subtotalMinor = observation.priceMinor - (observation.discountMinor || 0);
  const knownTotalMinor = subtotalMinor + (observation.shippingMinor || 0) + (observation.taxMinor || 0);
  return { subtotalMinor, knownTotalMinor, totalMinor: missing.length ? null : knownTotalMinor, complete: !missing.length, missing };
}

export function convertMinor(amount, from, to, usdBrl) {
  if (amount == null) return null;
  if (from === to) return amount;
  if (!currencies.has(from) || !currencies.has(to) || !Number.isFinite(usdBrl) || usdBrl <= 0) return null;
  return Math.round(from === 'USD' ? amount * usdBrl : amount / usdBrl);
}

export function latestObservations(state, productId = null, { country = 'ALL' } = {}) {
  const stores = new Map(state.stores.map(store => [store.id, store]));
  const latest = new Map();
  for (const observation of state.observations) {
    if (productId && observation.productId !== productId) continue;
    if (country !== 'ALL' && stores.get(observation.storeId)?.country !== country) continue;
    let offerUrl = observation.url || '';
    if (offerUrl) {
      try {
        const normalized = new URL(offerUrl);
        normalized.hash = '';
        for (const key of [...normalized.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'msclkid'].includes(key.toLowerCase())) normalized.searchParams.delete(key);
        normalized.searchParams.sort();
        offerUrl = normalized.href;
      } catch { /* Invalid stored links are still grouped deterministically; validation rejects them. */ }
    }
    const key = [observation.productId, observation.storeId, (observation.seller || '').trim().toLowerCase(), offerUrl, observation.condition].join('|');
    const date = observation.observedAt || observation.recordedAt || '';
    const old = latest.get(key);
    const oldDate = old?.observedAt || old?.recordedAt || '';
    if (!old || date > oldDate || (date === oldDate && observation.recordedAt > old.recordedAt)) latest.set(key, observation);
  }
  return [...latest.values()].sort((a, b) => (b.observedAt || b.recordedAt || '').localeCompare(a.observedAt || a.recordedAt || ''));
}

export function compareProduct(state, productId, options = {}) {
  const { country = 'ALL', currency = state.settings.displayCurrency, now = nowISO(), includeStale = false, condition = 'new' } = options;
  const nowTime = new Date(now).getTime();
  const cutoff = nowTime - state.settings.staleAfterHours * 3_600_000;
  const offers = latestObservations(state, productId, { country }).map(observation => {
    const quote = quoteTotal(observation);
    const observedTime = observation.observedAt ? new Date(observation.observedAt).getTime() : NaN;
    const stale = !Number.isFinite(observedTime) || observedTime < cutoff;
    const future = Number.isFinite(observedTime) && observedTime > nowTime + 5 * 60_000;
    const eligible = !future && observation.availability === 'in_stock' && (condition === 'ALL' || observation.condition === condition) && (includeStale || !stale);
    return { observation, ...quote, stale, future, eligible,
      convertedTotalMinor: convertMinor(quote.totalMinor, observation.currency, currency, state.settings.usdBrl),
      convertedSubtotalMinor: convertMinor(quote.subtotalMinor, observation.currency, currency, state.settings.usdBrl),
      convertedKnownTotalMinor: convertMinor(quote.knownTotalMinor, observation.currency, currency, state.settings.usdBrl), currency };
  });
  const eligible = offers.filter(offer => offer.eligible);
  const best = eligible.filter(offer => offer.complete && offer.convertedTotalMinor !== null).sort((a, b) => a.convertedTotalMinor - b.convertedTotalMinor)[0] || null;
  const bestKnown = eligible.filter(offer => offer.convertedKnownTotalMinor !== null).sort((a, b) => a.convertedKnownTotalMinor - b.convertedKnownTotalMinor)[0] || null;
  return { offers, best, bestKnown, missingCurrency: eligible.some(offer => offer.convertedSubtotalMinor === null), currency };
}

export function compareProject(state, project, options = {}) {
  const currency = options.currency || project.currency;
  const missing = [];
  const convertedExtras = convertMinor(project.extrasMinor || 0, project.currency, currency, state.settings.usdBrl);
  let knownSubtotalMinor = convertedExtras || 0;
  if (convertedExtras === null && project.extrasMinor) missing.push('câmbio dos custos adicionais');
  const lines = project.items.map(item => {
    const product = state.products.find(product => product.id === item.productId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 || !product) {
      missing.push(product?.name || item.productId);
      return { ...item, product, totalMinor: null, knownSubtotalMinor: 0, missing: ['produto ou quantidade inválida'] };
    }
    if (item.owned) return { ...item, product, totalMinor: 0, knownSubtotalMinor: 0, missing: [], owned: true };
    const result = compareProduct(state, item.productId, { ...options, currency });
    const offer = result.best || result.bestKnown;
    if (!offer) {
      const reason = result.missingCurrency ? 'câmbio não informado' : 'cotação atual disponível';
      missing.push(`${product.name}: ${reason}`);
      return { ...item, product, totalMinor: null, knownSubtotalMinor: 0, missing: [reason], offer: null };
    }
    const known = offer.convertedKnownTotalMinor * item.quantity;
    knownSubtotalMinor += known;
    if (!offer.complete) missing.push(`${product.name}: ${offer.missing.join(', ')}`);
    return { ...item, product, totalMinor: offer.convertedTotalMinor === null ? null : offer.convertedTotalMinor * item.quantity,
      knownSubtotalMinor: known, missing: offer.missing, offer };
  });
  if (!project.items.length) missing.push('componentes');
  return { project, lines, currency, totalMinor: missing.length ? null : knownSubtotalMinor, knownSubtotalMinor, complete: !missing.length, missing };
}

export function historyStats(state, productId, currency) {
  const observations = state.observations.filter(item => item.productId === productId && item.currency === currency && item.observedAt)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const values = observations.map(item => item.priceMinor - (item.discountMinor || 0));
  return { count: values.length, minMinor: values.length ? Math.min(...values) : null, maxMinor: values.length ? Math.max(...values) : null,
    averageMinor: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
    series: observations.map(item => ({ date: item.observedAt, priceMinor: item.priceMinor - (item.discountMinor || 0), storeId: item.storeId, condition: item.condition, observationId: item.id })) };
}

function plainData(value, depth = 0) {
  if (depth > 12) throw new Error('Arquivo contém estrutura muito profunda.');
  if (value == null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Número inválido.'); return; }
  if (Array.isArray(value)) { for (const item of value) plainData(item, depth + 1); return; }
  if (!isObject(value)) throw new Error('Estrutura inválida.');
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Chave de arquivo não permitida.');
    plainData(item, depth + 1);
  }
}
function string(value, field, max = 200, optional = false) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Campo inválido: ${field}.`);
  return value.trim();
}
function identifier(value, field = 'ID') {
  const id = string(value, field, 180);
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) throw new Error(`Identificador inválido: ${field}.`);
  return id;
}
function money(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) throw new Error(`Valor inválido: ${field}.`);
  return value;
}
function date(value, field, nullable = false) {
  if (nullable && value == null) return null;
  const matched = typeof value === 'string' && value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/);
  if (!matched || !Number.isFinite(Date.parse(value))) throw new Error(`Data inválida: ${field}.`);
  const [year, month, day, hour, minute, second] = matched.slice(1).map(value => Number(value || 0));
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error(`Data inválida: ${field}.`);
  return new Date(value).toISOString();
}
function collection(value, name, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Lista inválida: ${name}.`);
  const ids = new Set();
  for (const record of value) {
    if (!isObject(record)) throw new Error(`Registro inválido: ${name}.`);
    identifier(record.id, name);
    if (ids.has(record.id)) throw new Error(`ID duplicado em ${name}.`);
    ids.add(record.id);
  }
  return ids;
}

export function validateState(input) {
  plainData(input);
  if (!isObject(input) || input.schemaVersion !== 2) throw new Error('Versão de backup incompatível.');
  const state = clone(input);
  const categoryIds = collection(state.categories, 'categorias', 2000);
  const storeIds = collection(state.stores, 'lojas', 5000);
  const productIds = collection(state.products, 'produtos', 10000);
  collection(state.observations, 'cotações', 100000);
  collection(state.projects, 'projetos', 5000);
  for (const category of state.categories) category.name = string(category.name, 'categoria', 100);
  for (const store of state.stores) {
    store.name = string(store.name, 'loja', 150);
    if (!countries.has(store.country)) throw new Error('País de loja inválido.');
    store.domain = string(store.domain, 'domínio', 253, true);
    if (store.domain && !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(store.domain)) throw new Error('Domínio inválido.');
    store.searchUrl = safeUrl(store.searchUrl || '');
    // URL serialisation encodes braces; preserve the documented search placeholder.
    store.searchUrl = store.searchUrl.replaceAll('%7Bquery%7D', '{query}');
  }
  for (const product of state.products) {
    product.name = string(product.name, 'produto', 240);
    if (!categoryIds.has(product.categoryId)) throw new Error('Categoria de produto não encontrada.');
    product.brand = string(product.brand, 'marca', 150, true);
    product.model = string(product.model, 'modelo', 200, true);
    product.specs = string(product.specs, 'especificações', 5000, true);
    if (!statuses.has(product.status)) throw new Error('Situação do produto inválida.');
    product.createdAt = date(product.createdAt, 'criação');
    product.targetBRL = money(product.targetBRL, 'meta em reais', true);
    product.targetUSD = money(product.targetUSD, 'meta em dólares', true);
    if (product.country != null && product.country !== 'ALL' && !countries.has(product.country)) throw new Error('País de produto inválido.');
  }
  for (const observation of state.observations) {
    if (!productIds.has(observation.productId) || !storeIds.has(observation.storeId)) throw new Error('Cotação sem produto ou loja correspondente.');
    if (!currencies.has(observation.currency) || !conditions.has(observation.condition) || !availability.has(observation.availability) || !sources.has(observation.source)) throw new Error('Classificação de cotação inválida.');
    observation.priceMinor = money(observation.priceMinor, 'preço');
    observation.shippingMinor = money(observation.shippingMinor, 'frete', true);
    observation.taxMinor = money(observation.taxMinor, 'imposto', true);
    observation.discountMinor = money(observation.discountMinor ?? 0, 'desconto');
    if (observation.discountMinor > observation.priceMinor) throw new Error('Desconto maior que o preço.');
    observation.seller = string(observation.seller, 'vendedor', 200, true);
    observation.url = safeUrl(observation.url || '');
    observation.observedAt = date(observation.observedAt, 'verificação', true);
    observation.recordedAt = date(observation.recordedAt, 'registro');
    observation.notes = string(observation.notes, 'observações', 5000, true);
    observation.shippingOrigin = string(observation.shippingOrigin, 'origem do envio', 120, true);
  }
  for (const project of state.projects) {
    project.name = string(project.name, 'projeto', 240);
    if (!currencies.has(project.currency)) throw new Error('Moeda de projeto inválida.');
    project.extrasMinor = money(project.extrasMinor ?? 0, 'custos do projeto');
    if (!Array.isArray(project.items) || project.items.length > 1000) throw new Error('Componentes inválidos.');
    for (const item of project.items) {
      if (!isObject(item) || !productIds.has(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) throw new Error('Componente ou quantidade inválida.');
      if (item.owned != null && typeof item.owned !== 'boolean') throw new Error('Propriedade de componente inválida.');
    }
  }
  if (!isObject(state.settings) || !isObject(state.meta)) throw new Error('Preferências ou metadados inválidos.');
  if (!['BR', 'US', 'ALL'].includes(state.settings.country) || !currencies.has(state.settings.displayCurrency)) throw new Error('Preferências de país/moeda inválidas.');
  if (state.settings.usdBrl != null && (!Number.isFinite(state.settings.usdBrl) || state.settings.usdBrl <= 0 || state.settings.usdBrl > 1000)) throw new Error('Câmbio inválido.');
  state.settings.exchangeUpdatedAt = date(state.settings.exchangeUpdatedAt, 'câmbio', true);
  if (!Number.isFinite(state.settings.staleAfterHours) || state.settings.staleAfterHours < 1 || state.settings.staleAfterHours > 8760) throw new Error('Validade de preço inválida.');
  return state;
}

export function exportBackup(state) {
  return JSON.stringify({ app: 'PriceTrackerUniversal', version: 2, exportedAt: nowISO(), state: validateState(state) }, null, 2);
}

export function importBackup(text, currentState = null, { mode = 'merge' } = {}) {
  if (typeof text !== 'string' || text.length > 20_000_000) throw new Error('Backup inválido ou maior que 20 MB.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('O arquivo não contém um JSON válido.'); }
  if (!isObject(parsed) || parsed.app !== 'PriceTrackerUniversal' || parsed.version !== 2) throw new Error('Este arquivo não é um backup do Price Tracker Universal.');
  const imported = validateState(parsed.state);
  if (!currentState || mode === 'replace') return imported;
  if (mode !== 'merge') throw new Error('Modo de restauração inválido.');
  const state = validateState(currentState);
  // Local records win on ID collisions; observation IDs are immutable.
  for (const key of ['categories', 'stores', 'products', 'observations', 'projects']) {
    const ids = new Set(state[key].map(item => item.id));
    for (const item of imported[key]) if (!ids.has(item.id)) { state[key].push(item); ids.add(item.id); }
  }
  state.meta.updatedAt = nowISO();
  return validateState(state);
}

function legacyDate(input) {
  if (!input || typeof input !== 'string') return null;
  if (/^\d{4}-\d\d-\d\dT/.test(input) && Number.isFinite(Date.parse(input))) return new Date(input).toISOString();
  const match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, day, month, year, hour, minute, second = '00'] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:${second}-03:00`;
  try { return date(iso, 'data legada'); } catch { return null; }
}
function hash(text) { let hash = 2166136261; for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); return (hash >>> 0).toString(36); }

export function migrateLegacy(input, legacyPrices = null, legacyComparison = null, now = nowISO()) {
  const state = clone(input);
  const warnings = [];
  let migrated = 0;
  if (state.meta.legacyMigrated) return { state: validateState(state), migrated, warnings };
  const parse = (value, label) => {
    if (!value) return null;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { warnings.push(`${label}: dados antigos inválidos, originais preservados.`); return null; }
  };
  const prices = parse(legacyPrices, 'Histórico');
  const comparison = parse(legacyComparison, 'Comparador');
  const existing = new Set(state.observations.map(item => item.id));
  const ensureStore = (name = 'Importado do NUC') => {
    const found = state.stores.find(store => store.name.toLowerCase() === String(name).trim().toLowerCase() && store.country === 'US');
    if (found) return found.id;
    const id = `legacy-store-${hash(String(name))}`;
    if (!state.stores.some(store => store.id === id)) state.stores.push({ id, name: String(name).slice(0, 150) || 'Importado do NUC', country: 'US', domain: '', searchUrl: '' });
    return id;
  };
  const add = (raw, productId, name, price, store, url, observedAt, notes) => {
    const id = `legacy-${hash(JSON.stringify(raw))}`;
    if (existing.has(id)) return;
    let priceMinor;
    try { priceMinor = parseMoney(price); } catch { warnings.push('Um preço antigo inválido foi preservado somente no original.'); return; }
    if (priceMinor == null) return;
    if (!state.products.some(product => product.id === productId)) state.products.push({ id: productId, name: name.slice(0, 240), brand: '', model: '', categoryId: 'other', specs: 'Registro importado do monitor NUC', targetBRL: null, targetUSD: null, status: 'watching', createdAt: now });
    let safe = '';
    try { safe = safeUrl(url || ''); } catch { warnings.push('Um link antigo inseguro foi removido da cópia migrada.'); }
    state.observations.push({ id, productId, storeId: ensureStore(store), seller: '', url: safe, priceMinor, currency: 'USD', shippingMinor: null, taxMinor: null, discountMinor: 0, condition: 'new', availability: 'unknown', observedAt, recordedAt: now, source: 'legacy', notes, shippingOrigin: '' });
    existing.add(id); migrated++;
  };
  if (Array.isArray(prices)) for (const item of prices.slice(0, 100000)) {
    if (!isObject(item)) continue;
    const config = String(item.config || 'Oferta importada');
    const isBuild = /barebone|componentes/i.test(config);
    const ram = /64/.test(config) ? '64' : /32/.test(config) ? '32' : null;
    const capacity = /\b1\s*TB/i.test(config) ? '1' : '2';
    const productId = ram && !isBuild ? `nuc-${ram}-${capacity}tb` : `legacy-product-${hash(config)}`;
    const parsedDate = legacyDate(item.date);
    add(item, productId, config, item.price, item.store, item.url, parsedDate,
      `Importado do NUC; estoque e custos adicionais precisam de revisão.${parsedDate ? ' Horário antigo interpretado como Brasília.' : ' Data de verificação não informada.'}${item.date ? ` Registro original: ${String(item.date).slice(0, 100)}.` : ''}`);
  }
  if (isObject(comparison)) {
    const fields = { ready32: 'nuc-32-2tb', ready64: 'nuc-64-2tb', bare: 'nuc-barebone', ram32: 'ram-32', ram64: 'ram-64', ssd: 'ssd-2tb', win: 'windows-pro' };
    for (const [key, productId] of Object.entries(fields)) if (comparison[key] != null && String(comparison[key]).trim()) {
      add({ key, value: comparison[key], origin: 'comparison' }, productId, productId, comparison[key], 'Comparador NUC anterior', '', null, 'Valor manual do comparador anterior, sem data de verificação. Reconfirme antes de comprar.');
    }
    if (!state.meta.legacyComparisonApplied) {
      for (const project of state.projects.filter(project => ['nuc-build-32', 'nuc-build-64'].includes(project.id))) {
        for (const item of project.items) if ((item.productId === 'ssd-2tb' && comparison.ownssd) || (item.productId === 'windows-pro' && comparison.ownwin)) item.owned = true;
        if (comparison.nolic) { project.items = project.items.filter(item => item.productId !== 'windows-pro'); project.name += ' · sem Windows'; }
        try { project.extrasMinor = parseMoney(comparison.extra) ?? 0; } catch { warnings.push('Custo adicional antigo inválido.'); }
      }
      state.meta.legacyComparisonApplied = true;
    }
  }
  state.meta.legacyMigrated = true;
  state.meta.legacyMigrationAt = state.meta.legacyMigrationAt || now;
  state.meta.updatedAt = now;
  return { state: validateState(state), migrated, warnings };
}
