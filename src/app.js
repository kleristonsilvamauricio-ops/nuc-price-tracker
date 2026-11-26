import {uid, parseMoney, formatMoney, safeUrl, compareProduct, compareProject, quoteTotal, convertMinor, latestObservations, historyStats, exportBackup, importBackup, validateState} from './domain.js';
import {loadState, saveState, listSnapshots, listRecoveryCopies, restoreSnapshot, requestPersistence} from './storage.js';

const app=document.querySelector('#app'), modal=document.querySelector('#modal');
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>JSON.parse(JSON.stringify(value));
const icons={plus:'<path d="M12 5v14M5 12h14"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',box:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 15h5m3 0h.1M4 10h16"/>',memory:'<rect x="3" y="6" width="18" height="11" rx="2"/><path d="M7 9v5m5-5v5m5-5v5M6 17v3m4-3v3m4-3v3m4-3v3"/>',disk:'<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="4"/><path d="M10 17h4"/>',tag:'<path d="M4 4h7l9 9-7 7-9-9V4Z"/><circle cx="8" cy="8" r="1"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',link:'<path d="m10 13 4-4m-6 8-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/>',check:'<path d="m5 12 4 4L19 6"/>',chart:'<path d="M4 3v17h17M7 15l4-5 4 2 5-7"/>',store:'<path d="m3 9 2-6h14l2 6M5 10v11h14V10M9 21v-7h6v7M3 9c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0"/>',share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 10.5 7-4m-7 7 7 4"/>',back:'<path d="m14 5-7 7 7 7"/>'};
const icon=name=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.tag}</svg>`;
const countryName=code=>code==='BR'?'Brasil':code==='US'?'Estados Unidos':'Brasil + EUA';
const conditionName=code=>({new:'Novo',used:'Usado',refurbished:'Recondicionado'}[code]||'Não informado');
const availabilityName=code=>({in_stock:'Disponível',out_of_stock:'Sem estoque',unknown:'Estoque não confirmado'}[code]||'Não informado');
const dateText=value=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza'}).format(new Date(value)):'Data não informada';
const numericValue=minor=>minor==null?'':(minor/100).toFixed(2).replace('.',',');
const nowLocal=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const option=(value,label,selected)=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`;
let state,storageInfo,automation=null,exchange=null,refreshing=false,installPrompt=null,pendingBackup=null;
let filter={query:'',category:'ALL',status:'active'},historyProduct='nuc-32-2tb',historyCurrency='USD';
let saveQueue=Promise.resolve(),toastTimer;
const storeById=id=>state.stores.find(s=>s.id===id);
const productById=id=>state.products.find(p=>p.id===id);
const viewCurrency=()=>state.settings.country==='US'?'USD':state.settings.country==='BR'?'BRL':state.settings.displayCurrency;
const href=value=>{try{return esc(safeUrl(value));}catch{return '';}};
function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5500);}
function route(){const h=location.hash.slice(1)||'products';return {view:h.split('/')[0],id:decodeURIComponent(h.split('/')[1]||'')};}
function go(view){location.hash=view;}
async function persist(next=state,{quiet=false,snapshot=true}={}){
  state=validateState(next);
  const snapshotState=clone(state);
  const work=saveQueue.then(()=>saveState(snapshotState,{snapshot}));
  saveQueue=work.catch(()=>{});
  try{const result=await work;storageInfo={...storageInfo,...result};if(!quiet)notify('Salvo neste dispositivo.');return true;}
  catch(error){storageInfo.warning=error.message;notify(error.message);render();return false;}
}
function summary(){
  const active=state.products.filter(p=>p.status!=='archived');
  let priced=0,targets=0;
  for(const p of active){const r=compareProduct(state,p.id,{country:state.settings.country,currency:viewCurrency()});const q=r.best||r.bestKnown;if(q){priced++;const target=q.observation.currency==='BRL'?p.targetBRL:p.targetUSD;if(target!=null&&q.complete&&q.totalMinor<=target)targets++;}}
  return {active:active.length,priced,targets,observations:state.observations.length};
}
function header(eyebrow,title,description,actions=''){return `<section class="hero"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="hero-actions">${actions}</div></section>`;}
function refreshButton(){return `<button class="btn" data-action="refresh"${refreshing?' disabled':''}>${refreshing?'<span class="loading-spinner"></span>':icon('refresh')}${refreshing?'Atualizando…':'Atualizar painel'}</button>`;}
function countryControl(){return `<div class="segmented" role="group" aria-label="País da pesquisa">${[['ALL','Comparar países'],['BR','🇧🇷 Brasil'],['US','🇺🇸 EUA']].map(([c,l])=>`<button class="${state.settings.country===c?'active':''}" data-action="country" data-id="${c}" aria-pressed="${state.settings.country===c}">${l}</button>`).join('')}</div>`;}
function warning(){return storageInfo?.warning?`<div class="notice" role="alert">${esc(storageInfo.warning)}</div>`:'';}
function statusStrip(){
  const label=automation?.sources?.some(s=>s.state==='ready')?'Há fontes configuradas; confira a data de cada oferta.':'Consultas das lojas aguardam integração. Seus registros manuais continuam disponíveis.';
  return `<div class="status-strip">${icon('clock')}<p class="muted">${label} ${state.settings.usdBrl?`Dólar de referência: R$ ${Number(state.settings.usdBrl).toFixed(4).replace('.',',')}.`:''}</p><button class="btn subtle small" data-view="settings">Ver fontes</button></div>`;
}
function render(){
  if(!state)return;
  const r=route();
  document.querySelectorAll('.nav [data-view]').forEach(b=>{if(b.dataset.view===(r.view==='product'?'products':r.view))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(r.view==='compare')renderCompare();else if(r.view==='history')renderHistory();else if(r.view==='settings')renderSettings();else if(r.view==='product'&&productById(r.id))renderDetail(productById(r.id));else renderProducts();
}
function renderProducts(){
  const stats=summary();
  app.innerHTML=header('Seu observatório de compras','Cada compra, uma boa escolha.','Organize produtos, acompanhe suas cotações e compare o custo de comprar pronto ou montar.',`${refreshButton()}<button class="btn primary" data-action="new-product">${icon('plus')}Adicionar produto</button>`)+warning()+`
  <div class="stat-grid"><div class="stat"><span>Produtos acompanhados</span><strong>${stats.active}</strong><small>NUC e suas novas pesquisas</small></div><div class="stat"><span>Com cotação recente</span><strong>${stats.priced}</strong><small>Novos e disponíveis</small></div><div class="stat"><span>Dentro da sua meta</span><strong>${stats.targets}</strong><small>Custo completo registrado</small></div><div class="stat"><span>Cotações no histórico</span><strong>${stats.observations}</strong><small>Registros preservados</small></div></div>
  <div class="toolbar">${countryControl()}<div class="search">${icon('search')}<input id="product-search" aria-label="Buscar produtos" placeholder="Buscar produtos…" value="${esc(filter.query)}"></div><select id="category-filter" aria-label="Filtrar categoria">${option('ALL','Todas as categorias',filter.category)}${state.categories.map(c=>option(c.id,c.name,filter.category)).join('')}</select></div>
  <div class="section-line"><h2>Suas pesquisas</h2><div class="action-row"><select id="status-filter" aria-label="Situação dos produtos">${[['active','Acompanhando'],['purchased','Comprados'],['archived','Arquivados'],['all','Todos']].map(([v,l])=>option(v,l,filter.status)).join('')}</select></div></div>
  <div id="product-grid" class="products-grid"></div>${statusStrip()}
  <div class="panel panel-tint"><div class="action-row" style="justify-content:space-between"><div><h3>Seu NUC continua aqui</h3><p class="muted">32 GB, 64 GB, barebone, RAM, SSD e Windows já organizados. A versão original também foi preservada.</p></div><button class="btn" data-view="compare">${icon('chart')}Comparar montagens</button></div></div>`;
  drawProductCards();
}
function drawProductCards(){
  const products=state.products.filter(p=>(filter.status==='all'||(filter.status==='active'&&!['archived','purchased'].includes(p.status))||p.status===filter.status)&&(filter.category==='ALL'||p.categoryId===filter.category)&&`${p.name} ${p.brand} ${p.model} ${p.specs}`.toLowerCase().includes(filter.query.toLowerCase()));
  $('#product-grid').innerHTML=products.length?products.map(p=>{
    const currency=viewCurrency(),r=compareProduct(state,p.id,{country:state.settings.country,currency});
    const q=r.best||r.bestKnown,old=r.offers[0],category=state.categories.find(c=>c.id===p.categoryId)?.name||'Produto';
    const target=currency==='BRL'?p.targetBRL:p.targetUSD;
    const achieved=q?.complete&&target!=null&&q.convertedTotalMinor<=target;
    const value=q?(q.convertedTotalMinor??q.convertedKnownTotalMinor):null;
    return `<article class="product-card"><div class="category">${esc(category)}</div><div class="product-top"><div class="product-icon">${icon(p.categoryId==='memory'?'memory':p.categoryId==='storage'?'disk':p.categoryId==='computers'?'box':'tag')}</div><div><h3>${esc(p.name)}</h3><div class="muted">${esc(p.model||p.brand||'Pesquisa personalizada')}</div></div></div><div class="muted">${q?(q.complete?'Menor total registrado':'Custo conhecido · faltam encargos'):'Cotação atual'}</div><div class="product-price${value==null?' empty':''}">${value==null?(r.missingCurrency?'Informe o câmbio para comparar':old?'Atualize a cotação':'Aguardando primeiro preço'):esc(formatMoney(value,currency))}</div><div class="muted">${q?`${esc(storeById(q.observation.storeId)?.name)} · ${esc(countryName(storeById(q.observation.storeId)?.country))}`:old?'Há registros no histórico.':'Adicione um link ou registre uma oferta.'}</div><div class="card-meta"><span>${target!=null?`Meta: ${esc(formatMoney(target,currency))}`:'Meta ainda não definida'}</span>${achieved?'<span class="badge success">Meta atingida</span>':`<span class="badge">${q?'Registrado':p.status==='purchased'?'Comprado':'Acompanhar'}</span>`}</div><div class="card-bottom"><button class="btn small" data-action="details" data-id="${esc(p.id)}">Ver pesquisa</button><button class="btn primary small" data-action="new-quote" data-id="${esc(p.id)}">${icon('plus')}Preço</button></div></article>`;
  }).join(''):`<div class="empty-state" style="grid-column:1/-1">${icon('search')}<h3>Nenhum produto neste filtro</h3><p>Ajuste a busca ou adicione uma nova pesquisa.</p><button class="btn primary" data-action="new-product">Adicionar produto</button></div>`;
}
function storeSearchLinks(p){
  return state.stores.filter(s=>(state.settings.country==='ALL'||s.country===state.settings.country)&&s.searchUrl).map(s=>{
    const query=`${p.name} ${p.model}`.replaceAll('·',' ').replaceAll(' / ',' ');
    const url=s.searchUrl.replaceAll('{query}',encodeURIComponent(query));
    return `<a class="store-link" href="${href(url)}" target="_blank" rel="noopener noreferrer">${s.country==='BR'?'🇧🇷':'🇺🇸'} ${esc(s.name)}</a>`;
  }).join('');
}
function renderDetail(p){
  const result=compareProduct(state,p.id,{country:state.settings.country,currency:viewCurrency(),condition:'ALL'});
  const quotes=result.offers;
  app.innerHTML=`<button class="btn subtle small" data-view="products">${icon('back')}Voltar aos produtos</button>`+header('Detalhes da pesquisa',p.name,p.specs||'Registre as especificações para comparar a mesma configuração.',`<button class="btn" data-action="edit-product" data-id="${esc(p.id)}">Editar produto</button><button class="btn primary" data-action="new-quote" data-id="${esc(p.id)}">${icon('plus')}Registrar preço</button>`)+warning()+`
  <div class="toolbar">${countryControl()}<span class="muted">Moeda de comparação: ${viewCurrency()}</span></div>
  <div class="details-grid"><section><div class="panel"><h2>Ofertas registradas</h2><p class="muted">Uma nova cotação preserva a anterior no histórico. Frete ou impostos em branco deixam o total pendente.</p>${quotes.length?quotes.map(q=>quoteCard(q)).join(''):'<div class="empty-state"><h3>Comece pela primeira cotação</h3><p>Abra uma loja abaixo e registre o preço anunciado, o vendedor e a disponibilidade.</p></div>'}</div></section><aside><div class="panel"><h2>Pesquisar nas lojas</h2><p class="muted">Os links abrem a busca da loja. Confirme a configuração e o valor antes de registrar.</p><div class="store-list">${storeSearchLinks(p)}</div></div><div class="panel"><h2>Metas e acompanhamento</h2><div class="row"><span>Brasil</span><strong>${p.targetBRL!=null?esc(formatMoney(p.targetBRL,'BRL')):'Não definida'}</strong></div><div class="row"><span>Estados Unidos</span><strong>${p.targetUSD!=null?esc(formatMoney(p.targetUSD,'USD')):'Não definida'}</strong></div><div class="row"><span>Registros</span><strong>${state.observations.filter(o=>o.productId===p.id).length}</strong></div><div class="action-row" style="margin-top:16px"><button class="btn small" data-action="history-product" data-id="${esc(p.id)}">${icon('chart')}Histórico</button><button class="btn small" data-action="share-product" data-id="${esc(p.id)}">${icon('share')}Compartilhar</button></div></div>${p.id==='nuc-32-1tb'?'<div class="notice">Referência de planejamento: US$ 1.869 para 32 GB / 1 TB, informada anteriormente. Não é uma oferta atual e não entra no ranking.</div>':''}</aside></div>`;
}
function quoteCard(q){
  const o=q.observation,s=storeById(o.storeId),stale=q.stale;
  return `<article class="quote-box"><div class="quote-heading"><div><strong>${esc(s?.name||'Loja')}</strong><div class="muted">${esc(o.seller||'Vendedor não informado')} · ${esc(countryName(s?.country))}</div></div><span class="badge${stale?' warning':o.availability==='in_stock'?' success':''}">${q.future?'Data futura · não usada':stale?'Cotação antiga':availabilityName(o.availability)}</span></div><div class="quote-price">${esc(formatMoney(o.priceMinor,o.currency))}</div><div class="quote-meta"><span class="badge">${conditionName(o.condition)}</span><span class="muted">${dateText(o.observedAt)}</span></div><p class="quote-costs">Frete: ${o.shippingMinor==null?'pendente':esc(formatMoney(o.shippingMinor,o.currency))} · Impostos: ${o.taxMinor==null?'pendentes':esc(formatMoney(o.taxMinor,o.currency))}${o.discountMinor?` · Desconto: ${esc(formatMoney(o.discountMinor,o.currency))}`:''}<br><strong>${q.complete?`Total registrado: ${esc(formatMoney(q.totalMinor,o.currency))}`:'Total final pendente'}</strong>${q.complete&&o.currency!==viewCurrency()&&q.convertedTotalMinor!=null?` · ≈ ${esc(formatMoney(q.convertedTotalMinor,viewCurrency()))}`:''}</p>${o.shippingOrigin?`<div class="muted">Origem do envio: ${esc(o.shippingOrigin)}</div>`:''}${o.notes?`<p class="muted">${esc(o.notes)}</p>`:''}<div class="action-row">${o.url?`<a class="btn small" href="${href(o.url)}" target="_blank" rel="noopener noreferrer">${icon('link')}Abrir anúncio</a>`:''}<button class="btn small" data-action="update-quote" data-id="${esc(o.id)}">Nova cotação</button></div></article>`;
}
function renderCompare(){
  const currency=viewCurrency();
  const results=state.projects.map(p=>compareProject(state,p,{country:state.settings.country,currency}));
  const complete=results.filter(r=>r.complete);const minimum=complete.length>=2?Math.min(...complete.map(r=>r.totalMinor)):null;
  const byId=id=>results.find(r=>r.project.id===id);
  const delta=(a,b)=>a?.complete&&b?.complete?esc(formatMoney(b.totalMinor-a.totalMinor,currency)):'Aguardando preços completos';
  app.innerHTML=header('Pronto ou por componentes','Compare o conjunto completo.','Monte projetos de compra com quantidades, itens que já possui e custos adicionais.',`<button class="btn primary" data-action="new-project">${icon('plus')}Novo projeto</button>`)+warning()+`
  <div class="toolbar">${countryControl()}<select id="compare-currency" aria-label="Moeda para comparar">${option('BRL','Mostrar em reais',state.settings.displayCurrency)}${option('USD','Mostrar em dólares',state.settings.displayCurrency)}</select></div>
  <div class="notice">O total inclui os custos registrados de cada item. Uma peça sem cotação atual ou com frete/impostos desconhecidos mantém a montagem incompleta. Conversões usam a taxa de referência em Ajustes.</div>
  <div class="project-grid">${results.map(r=>`<article class="project-card"><div class="quote-heading"><h3>${esc(r.project.name)}</h3><button class="btn small" data-action="edit-project" data-id="${esc(r.project.id)}">Editar</button></div><div class="project-lines">${r.lines.map(l=>`<div class="project-line"><span>${l.quantity} × ${esc(l.product?.name||l.productId)}${l.owned?' <span class="badge success">Já tenho</span>':''}${l.offer?`<br><small>${esc(storeById(l.offer.observation.storeId)?.name)}${l.missing.length?' · custos pendentes':''}</small>`:''}</span><strong>${l.totalMinor!=null?esc(formatMoney(l.totalMinor,currency)):l.offer?esc(formatMoney(l.knownSubtotalMinor,currency)):'—'}</strong></div>`).join('')}${r.project.extrasMinor?`<div class="project-line"><span>Custos adicionais do projeto</span><strong>${esc(formatMoney(convertMinor(r.project.extrasMinor,r.project.currency,currency,state.settings.usdBrl),currency))}</strong></div>`:''}</div><div class="project-total"><div class="muted">${r.complete?'Total registrado':'Subtotal conhecido · montagem incompleta'}</div><strong>${esc(formatMoney(r.complete?r.totalMinor:r.knownSubtotalMinor,currency))}</strong>${r.complete&&r.totalMinor===minimum?'<p><span class="badge success">Menor custo entre projetos completos</span></p>':''}${!r.complete?`<p class="muted">Faltam ${r.missing.length} ${r.missing.length===1?'verificação':'verificações'}. Registre as cotações dos itens para concluir.</p>`:''}</div></article>`).join('')}</div>
  <div class="panel" style="margin-top:20px"><h2>NUC: diferença de 32 GB para 64 GB</h2><div class="row"><span>Montando com componentes · 2 TB</span><strong>${delta(byId('nuc-build-32'),byId('nuc-build-64'))}</strong></div><div class="row"><span>Comprando pronto · 2 TB</span><strong>${delta(byId('nuc-ready-32'),byId('nuc-ready-64'))}</strong></div><p class="muted">O cálculo utiliza a mesma moeda e apenas custos completos. Confira Windows, garantia e configuração de cada anúncio.</p></div>${statusStrip()}`;
}
function chart(history){
  if(!history.series.length)return '<div class="empty-state"><p>A evolução aparece após registrar preços com data.</p></div>';
  const entries=history.series.slice(-40),min=Math.min(...entries.map(x=>x.priceMinor)),max=Math.max(...entries.map(x=>x.priceMinor)),spread=max-min||Math.max(max*.1,100),w=680,h=185;
  const pts=entries.map((p,i)=>({p,x:55+(entries.length===1?.5:i/(entries.length-1))*590,y:145-(p.priceMinor-min)/spread*110}));
  return `<svg class="history-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Preços registrados em ordem cronológica"><path d="M55 20v125h590" stroke="#dce4ed" fill="none"/><path d="M55 80h590M55 20h590" stroke="#edf2f7" fill="none"/>${pts.map(({p,x,y})=>`<circle cx="${x}" cy="${y}" r="5" fill="#2671db"><title>${esc(dateText(p.date))} · ${esc(formatMoney(p.priceMinor,historyCurrency))} · ${esc(storeById(p.storeId)?.name)}</title></circle>`).join('')}<text x="54" y="174">${esc(dateText(entries[0].date).split(',')[0])}</text><text x="645" y="174" text-anchor="end">${esc(dateText(entries.at(-1).date).split(',')[0])}</text><text x="5" y="24">${(max/100).toFixed(0)}</text><text x="5" y="148">${(min/100).toFixed(0)}</text></svg><p class="muted">Cada ponto é uma cotação, sem frete e impostos. Lojas e condições podem diferir; consulte a tabela.</p>`;
}
function renderHistory(){
  if(!productById(historyProduct))historyProduct=state.products[0]?.id;
  const stats=historyStats(state,historyProduct,historyCurrency);
  const records=state.observations.filter(o=>o.productId===historyProduct&&o.currency===historyCurrency).sort((a,b)=>(b.observedAt||b.recordedAt).localeCompare(a.observedAt||a.recordedAt));
  app.innerHTML=header('Histórico com origem','O preço muda. O registro fica.','Consulte o que você verificou, em qual loja e quando. As moedas originais são preservadas.',`<button class="btn" data-action="export-csv">${icon('download')}Exportar CSV</button>`)+warning()+`
  <div class="toolbar"><select id="history-product" aria-label="Produto do histórico" style="flex:1">${state.products.map(p=>option(p.id,p.name,historyProduct)).join('')}</select><select id="history-currency" aria-label="Moeda do histórico">${option('USD','Dólar · USD',historyCurrency)}${option('BRL','Real · BRL',historyCurrency)}</select></div>
  <div class="stat-grid"><div class="stat"><span>Menor preço registrado</span><strong style="font-size:1.35rem">${esc(formatMoney(stats.minMinor,historyCurrency))}</strong></div><div class="stat"><span>Maior preço registrado</span><strong style="font-size:1.35rem">${esc(formatMoney(stats.maxMinor,historyCurrency))}</strong></div><div class="stat"><span>Média dos registros</span><strong style="font-size:1.35rem">${esc(formatMoney(stats.averageMinor,historyCurrency))}</strong></div><div class="stat"><span>Cotações com data</span><strong>${stats.count}</strong></div></div>
  <div class="panel"><h2>Evolução dos registros</h2>${chart(stats)}</div>
  <div class="panel"><h2>Detalhes de cada cotação</h2>${records.length?`<div class="table-wrap"><table><thead><tr><th>Verificado em</th><th>Loja / vendedor</th><th>Produto</th><th>Disponibilidade</th><th>Preço</th><th></th></tr></thead><tbody>${records.map(o=>`<tr><td>${dateText(o.observedAt)}${o.source==='legacy'?'<br><small>Migrado do NUC</small>':''}</td><td>${esc(storeById(o.storeId)?.name)}<br><small>${esc(o.seller||'Não informado')}</small></td><td>${conditionName(o.condition)}</td><td>${availabilityName(o.availability)}</td><td class="num">${esc(formatMoney(o.priceMinor,o.currency))}</td><td><button class="btn small" data-action="update-quote" data-id="${esc(o.id)}">Atualizar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><p>Ainda não há cotações nesta moeda.</p><button class="btn primary" data-action="new-quote" data-id="'+esc(historyProduct)+'">Registrar preço</button></div>'}</div>`;
}
function sourceState(source){return ({manual:'Consulta por link',pending_config:'Acesso pendente',pending_validation:'Validação pendente',blocked:'Consulta bloqueada',ready:'Configurada',unavailable:'Indisponível'}[source.state]||'A confirmar');}
function renderSettings(){
  const sources=automation?.sources||[
    {id:'ebay',name:'eBay',country:'US',state:'pending_config',detail:'A API oficial aguarda acesso aprovado. O coletor público anterior recebeu HTTP 403.'},
    {id:'bestbuy',name:'Best Buy',country:'US',state:'pending_config',detail:'Acesso e validação da API ainda pendentes.'},
    {id:'manual',name:'Demais lojas',country:'ALL',state:'manual',detail:'Pesquise pelos links e registre as cotações verificadas.'}
  ];
  app.innerHTML=header('Preferências e proteção','Você no controle dos dados.','Ajuste a comparação, organize suas lojas e mantenha uma cópia fora do navegador.',installPrompt?'<button class="btn primary" data-action="install">Instalar aplicativo</button>':'')+warning()+`
  <div class="details-grid"><div><section class="panel"><h2>Câmbio e comparação</h2><p class="muted">Taxa de referência para comparar reais e dólares. O custo do cartão, frete e tributos da sua compra deve ser informado separadamente.</p><form id="preferences-form"><div class="form-grid"><label>Moeda de exibição<select name="currency">${option('BRL','Real (BRL)',state.settings.displayCurrency)}${option('USD','Dólar (USD)',state.settings.displayCurrency)}</select></label><label>Cotação válida por<select name="stale">${[6,12,24,48,72,168].map(h=>option(String(h),h===168?'7 dias':`${h} horas`,String(state.settings.staleAfterHours))).join('')}</select></label><label class="full">Valor de US$ 1 em reais<input name="rate" inputmode="decimal" placeholder="Ex.: 5,50" value="${state.settings.usdBrl==null?'':String(state.settings.usdBrl).replace('.',',')}"></label><label class="check full"><input type="checkbox" name="auto"${state.settings.exchangeMode!=='manual'?' checked':''}>Usar automaticamente a última referência disponível do Banco Central.</label></div><p class="field-note">${state.settings.exchangeUpdatedAt?`Atualizada: ${dateText(state.settings.exchangeUpdatedAt)} · ${esc(state.settings.exchangeSource||'Informada manualmente')}`:'Sem taxa verificada disponível.'}</p>${exchange?.status==='stale'?'<p class="notice">A consulta mais recente falhou. A taxa anterior foi preservada com a data original.</p>':''}<div class="form-error"></div><button class="btn primary" type="submit">Salvar preferências</button></form></section>
  <section class="panel"><h2>Backup e recuperação</h2><p class="muted">O salvamento e os pontos de recuperação são automáticos neste navegador. Para proteger os dados ao trocar de celular, exporte uma cópia.</p><div class="action-row"><button class="btn primary" data-action="export-backup">${icon('download')}Baixar backup</button><button class="btn" data-action="import-backup">${icon('upload')}Restaurar arquivo</button><button class="btn" data-action="share-backup">${icon('share')}Salvar / compartilhar</button></div><div class="divider"></div><h3>OneDrive</h3><p class="muted">Você pode enviar o arquivo de backup ao OneDrive pelo compartilhamento do celular, se essa opção estiver disponível. A sincronização direta ainda exige vincular sua conta Microsoft.</p><button class="btn small" data-action="snapshots">Ver pontos de recuperação locais</button><button class="btn small subtle" data-action="persistence">Proteger armazenamento local</button></section>
  <section class="panel"><div class="section-line" style="margin-top:0"><h2>Categorias</h2><button class="btn small" data-action="new-category">${icon('plus')}Adicionar</button></div>${state.categories.map(c=>`<div class="row"><span>${esc(c.name)} <small>(${state.products.filter(p=>p.categoryId===c.id).length})</small></span><button class="btn small subtle" data-action="edit-category" data-id="${esc(c.id)}">Editar</button></div>`).join('')}</section>
  <section class="panel"><div class="section-line" style="margin-top:0"><h2>Lojas</h2><button class="btn small" data-action="new-store">${icon('plus')}Adicionar</button></div>${state.stores.map(s=>`<div class="row"><div><strong class="row-title">${s.country==='BR'?'🇧🇷':'🇺🇸'} ${esc(s.name)}</strong><div class="muted">${esc(s.domain||'Loja personalizada')}</div></div><button class="btn small subtle" data-action="edit-store" data-id="${esc(s.id)}">Editar</button></div>`).join('')}</section></div>
  <aside><section class="panel"><h2>Atualizações automáticas</h2><p class="muted">Atualizar o painel busca a última publicação de câmbio e estado das fontes. Não inicia uma pesquisa de preços nas lojas.</p>${refreshButton()}<div class="divider"></div><p class="muted">${automation?.checked_at?`Última verificação do serviço: ${dateText(automation.checked_at)}.`:'Ainda não há verificação de serviço carregada.'}</p><p class="muted">Câmbio e estado das fontes: todos os dias às 13h07 e 18h07, horário de Brasília. A execução pode atrasar. A campanha NUC mantém o prazo de 30/11/2026; sua coleta de preços depende de fontes aprovadas.</p><div class="stack">${sources.map(s=>`<div class="source-card"><div class="row"><strong>${esc(s.name)}</strong><span class="badge${s.state==='ready'?' success':' warning'}">${sourceState(s)}</span></div><p class="muted">${esc(s.detail||'Verificação pendente.')}</p>${s.last_success_at?`<p class="muted">Último sucesso: ${dateText(s.last_success_at)}</p>`:''}</div>`).join('')}</div><div class="divider"></div><a class="btn small" target="_blank" rel="noopener noreferrer" href="https://github.com/kleristonsilvamauricio-ops/nuc-price-tracker/actions/workflows/prices.yml">Abrir atualização no GitHub</a><p class="field-note">Disparo manual pelo GitHub exige login do proprietário. Nenhuma credencial fica no aplicativo.</p></section><section class="panel"><h2>Privacidade e limites</h2><p class="muted">Seu cadastro, histórico e metas ficam neste dispositivo. Os arquivos públicos contêm apenas o aplicativo e dados de referência.</p><p class="muted">Não há mensalidade nem cota de cálculos. APIs externas podem exigir aprovação e ter limites próprios. Não há sincronização entre dispositivos ou notificações com o aplicativo fechado nesta versão.</p><a href="./legacy/">Abrir o monitor NUC original</a></section></aside></div>`;
}
function showDialog(title,body){
  $('#modal-content').innerHTML=`<div class="dialog-header"><h2 id="modal-title">${esc(title)}</h2><button class="btn icon subtle" data-action="close" aria-label="Fechar">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;
  if(!modal.open)modal.showModal();
  queueMicrotask(()=>modal.querySelector('input:not([type=hidden]),select,textarea')?.focus());
}
function formActions(label='Salvar'){return `<div class="form-error" role="alert"></div><div class="dialog-actions"><button class="btn" type="button" data-action="close">Cancelar</button><button class="btn primary" type="submit">${esc(label)}</button></div>`;}
function openProduct(id=null,prefill={}){
  const p=id?productById(id):{name:'',brand:'',model:'',categoryId:'other',specs:'',targetBRL:null,targetUSD:null,status:'watching',...prefill};
  showDialog(id?'Editar produto':'Nova pesquisa',`<form id="product-form" data-id="${esc(id||'')}">${!id?`<fieldset><legend>Começar por um anúncio</legend><div class="link-editor"><input name="sourceUrl" type="url" placeholder="Cole o link do produto" aria-label="Link para adicionar produto" value="${esc(prefill.url||'')}"><button type="button" class="btn" data-action="read-link">Ler link</button></div><p class="field-note">Identifica a loja e sugere um nome. O preço deve ser verificado no anúncio.</p></fieldset>`:''}<div class="form-grid"><label class="full">Nome do produto<input name="name" required maxlength="240" placeholder="Ex.: SSD Samsung 990 Pro 2 TB" value="${esc(p.name)}"></label><label>Marca<input name="brand" maxlength="150" value="${esc(p.brand)}"></label><label>Modelo / referência<input name="model" maxlength="200" value="${esc(p.model)}"></label><label>Categoria<select name="category">${state.categories.map(c=>option(c.id,c.name,p.categoryId)).join('')}</select></label><label>Situação<select name="status">${[['watching','Aguardando oferta'],['ready','Pronto para comprar'],['purchased','Comprado'],['archived','Arquivado']].map(([v,l])=>option(v,l,p.status)).join('')}</select></label><label>Preço-alvo Brasil · R$<input name="targetBRL" inputmode="decimal" placeholder="Opcional" value="${numericValue(p.targetBRL)}"></label><label>Preço-alvo EUA · US$<input name="targetUSD" inputmode="decimal" placeholder="Opcional" value="${numericValue(p.targetUSD)}"></label><label class="full">Especificações que precisam ser iguais<textarea name="specs" maxlength="5000" placeholder="Capacidade, tamanho, versão, itens incluídos…">${esc(p.specs)}</textarea></label></div>${formActions(id?'Salvar alterações':'Criar pesquisa')}</form>`);
}
function openQuote(productId,previousId=null){
  const p=productById(productId);if(!p)return;
  const old=previousId?state.observations.find(o=>o.id===previousId):null;
  const store=old?.storeId||p.defaultStoreId||state.stores.find(s=>s.country===(state.settings.country==='BR'?'BR':'US'))?.id||state.stores[0]?.id;
  const currency=old?.currency||(storeById(store)?.country==='BR'?'BRL':'USD');
  showDialog(old?'Atualizar cotação':'Registrar preço',`<p class="muted">${esc(p.name)}${old?'<br>Os dados anteriores servem de base. Confirme o preço atual; um novo registro será criado.':''}</p><form id="quote-form" data-product="${esc(productId)}"><div class="form-grid"><label class="full">Link do anúncio<input name="url" type="url" placeholder="https://…" value="${esc(old?.url||p.defaultUrl||'')}"></label><label>Loja<select name="store">${state.stores.map(s=>option(s.id,`${s.country==='BR'?'🇧🇷':'🇺🇸'} ${s.name}`,store)).join('')}</select></label><label>Moeda<select name="currency">${option('USD','Dólar · USD',currency)}${option('BRL','Real · BRL',currency)}</select></label><label>Preço do produto<input name="price" inputmode="decimal" required placeholder="Ex.: 1.599,99" value="${numericValue(old?.priceMinor)}"></label><label>Desconto adicional<input name="discount" inputmode="decimal" placeholder="0,00" value="${numericValue(old?.discountMinor)}"></label><label>Frete<input name="shipping" inputmode="decimal" placeholder="Não informado" value="${numericValue(old?.shippingMinor)}"><small>Informe 0 se gratuito.</small></label><label>Impostos adicionais<input name="tax" inputmode="decimal" placeholder="Não informado" value="${numericValue(old?.taxMinor)}"><small>Informe 0 se inclusos ou não aplicáveis.</small></label><label>Condição<select name="condition">${[['new','Novo'],['used','Usado'],['refurbished','Recondicionado']].map(([v,l])=>option(v,l,old?.condition||'new')).join('')}</select></label><label>Disponibilidade<select name="availability">${[['unknown','Não confirmada'],['in_stock','Disponível'],['out_of_stock','Sem estoque']].map(([v,l])=>option(v,l,old?.availability||'unknown')).join('')}</select></label><label>Vendedor<input name="seller" maxlength="200" placeholder="Nome da loja ou marketplace" value="${esc(old?.seller||'')}"></label><label>Origem do envio<input name="origin" maxlength="120" placeholder="Ex.: EUA, Brasil, China" value="${esc(old?.shippingOrigin||'')}"></label><label class="full">Verificado em<input name="observed" type="datetime-local" required value="${nowLocal()}"><small>Horário local do dispositivo.</small></label><label class="full">Garantia, licença e observações<textarea name="notes" maxlength="5000" placeholder="Ex.: Windows 11 Pro incluso; garantia de 1 ano…">${esc(old?.notes||'')}</textarea></label><label class="check full"><input type="checkbox" name="confirmed" required>Conferi o anúncio e a configuração deste produto.</label></div>${formActions('Salvar cotação')}</form>`);
}
function openCategory(id=null){const c=state.categories.find(c=>c.id===id);showDialog(c?'Editar categoria':'Nova categoria',`<form id="category-form" data-id="${esc(id||'')}"><label>Nome<input name="name" required maxlength="100" value="${esc(c?.name||'')}"></label>${formActions()}</form>`);}
function openStore(id=null){const s=storeById(id)||{};showDialog(id?'Editar loja':'Nova loja',`<form id="store-form" data-id="${esc(id||'')}"><div class="form-grid"><label>Nome<input name="name" required maxlength="150" value="${esc(s.name||'')}"></label><label>País<select name="country">${option('BR','Brasil',s.country||'BR')}${option('US','Estados Unidos',s.country)}</select></label><label class="full">Domínio<input name="domain" placeholder="Ex.: amazon.com.br" value="${esc(s.domain||'')}"></label><label class="full">Endereço da busca (opcional)<input name="search" type="url" value="${esc(s.searchUrl||'')}" placeholder="https://loja.com/busca?q={query}"><small>Use {query} no lugar do nome pesquisado.</small></label></div>${formActions()}</form>`);}
function openProject(id=null){const p=state.projects.find(p=>p.id===id)||{name:'',currency:viewCurrency(),items:[{productId:state.products[0]?.id,quantity:1}],extrasMinor:0};showDialog(id?'Editar composição':'Novo projeto de compra',`<form id="project-form" data-id="${esc(id||'')}"><div class="form-grid"><label class="full">Nome do projeto<input name="name" maxlength="240" required placeholder="Ex.: Montagem do NAS" value="${esc(p.name)}"></label><label>Moeda dos custos adicionais<select name="currency">${option('BRL','BRL',p.currency)}${option('USD','USD',p.currency)}</select></label><label>Custos adicionais<input name="extras" inputmode="decimal" value="${numericValue(p.extrasMinor)}" placeholder="0,00"></label></div><fieldset><legend>Componentes e quantidades</legend><div id="project-items">${p.items.map(projectItem).join('')}</div><button type="button" class="btn small" data-action="add-project-item">${icon('plus')}Adicionar item</button></fieldset><p class="muted">Um componente marcado como “já tenho” não acrescenta custo. Confira a compatibilidade antes de reutilizar.</p>${formActions()}</form>`);}
function projectItem(item={}){return `<div class="project-line-editor"><select class="item-product" aria-label="Produto do componente">${state.products.filter(p=>p.status!=='archived'||p.id===item.productId).map(p=>option(p.id,p.name+(p.status==='archived'?' (arquivado)':''),item.productId)).join('')}</select><input class="item-quantity" type="number" min="1" max="9999" required value="${Number(item.quantity)||1}" aria-label="Quantidade"><button type="button" class="btn icon subtle" data-action="remove-project-item" aria-label="Remover componente">${icon('close')}</button><label class="check"><input class="item-owned" type="checkbox"${item.owned?' checked':''}>Já tenho este item</label></div>`;}
function detectStore(url){try{const host=new URL(url).hostname.replace(/^www\./,'');return state.stores.find(s=>s.domain&&(host===s.domain||host.endsWith('.'+s.domain)));}catch{return null;}}
function canonicalUrl(value){const raw=safeUrl(value);if(!raw)return '';const u=new URL(raw);for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid|msclkid)$/i.test(key))u.searchParams.delete(key);u.hash='';return u.href;}
function readProductLink(){
  const form=$('#product-form');try{const url=canonicalUrl(form.elements.sourceUrl.value);if(!url)throw Error('Cole o endereço do anúncio primeiro.');const s=detectStore(url);const u=new URL(url);const segments=u.pathname.split('/').filter(Boolean);let suggestion='';for(const seg of segments){if(seg.length>12&&/[-_]/.test(seg)&&!/^MLB-\d+$/i.test(seg)){suggestion=decodeURIComponent(seg).replaceAll('-',' ').replaceAll('_',' ').replace(/\.html?$/,'');break;}}
  if(!form.elements.name.value&&suggestion)form.elements.name.value=suggestion.slice(0,240);form.elements.sourceUrl.value=url;form.querySelector('.form-error').textContent='';notify(s?`Loja identificada: ${s.name}. Confira o nome e salve.`:'Link válido. Preencha o nome do produto e escolha a loja na cotação.');}catch(e){form.querySelector('.form-error').textContent=e.message;}
}
async function submit(form){
  if(form.dataset.saving==='true')return;
  const values=new FormData(form),value=k=>String(values.get(k)||'').trim();const error=form.querySelector('.form-error');if(error)error.textContent='';
  const submitButton=form.querySelector('[type="submit"]'),submitLabel=submitButton?.textContent;
  form.dataset.saving='true';if(submitButton){submitButton.disabled=true;submitButton.textContent='Salvando…';}
  try{
    const next=clone(state);let nextView=null,newProduct=null;
    if(form.id==='product-form'){
      const id=form.dataset.id||uid('product'),old=productById(id);
      const url=value('sourceUrl')?canonicalUrl(value('sourceUrl')):old?.defaultUrl||'';
      const p={...old,id,name:value('name'),brand:value('brand'),model:value('model'),categoryId:value('category'),specs:value('specs'),targetBRL:parseMoney(value('targetBRL')),targetUSD:parseMoney(value('targetUSD')),status:value('status'),createdAt:old?.createdAt||new Date().toISOString(),defaultUrl:url,defaultStoreId:detectStore(url)?.id||old?.defaultStoreId||''};
      const at=next.products.findIndex(p=>p.id===id);if(at<0){next.products.push(p);newProduct=id;}else next.products[at]=p;nextView=`product/${id}`;
    }else if(form.id==='quote-form'){
      const priceMinor=parseMoney(value('price'));if(priceMinor==null||priceMinor<=0)throw Error('Informe um preço maior que zero.');
      const observed=new Date(value('observed'));if(!Number.isFinite(observed.getTime())||observed.getTime()>Date.now()+300000)throw Error('Informe uma data de verificação válida, sem horário futuro.');
      const o={id:uid('quote'),productId:form.dataset.product,storeId:value('store'),seller:value('seller'),url:canonicalUrl(value('url')),priceMinor,currency:value('currency'),shippingMinor:parseMoney(value('shipping')),taxMinor:parseMoney(value('tax')),discountMinor:parseMoney(value('discount'))??0,condition:value('condition'),availability:value('availability'),observedAt:observed.toISOString(),recordedAt:new Date().toISOString(),source:'manual',notes:value('notes'),shippingOrigin:value('origin')};
      next.observations.push(o);nextView=`product/${o.productId}`;
    }else if(form.id==='category-form'){
      const c={id:form.dataset.id||uid('category'),name:value('name')};const at=next.categories.findIndex(ca=>ca.id===c.id);if(at<0)next.categories.push(c);else next.categories[at]=c;
    }else if(form.id==='store-form'){
      const domain=value('domain').replace(/^https?:\/\//i,'').split('/')[0].replace(/^www\./,'').toLowerCase();const s={id:form.dataset.id||uid('store'),name:value('name'),country:value('country'),domain,searchUrl:safeUrl(value('search'))};
      const at=next.stores.findIndex(st=>st.id===s.id);if(at<0)next.stores.push(s);else next.stores[at]=s;
    }else if(form.id==='project-form'){
      const items=[...form.querySelectorAll('.project-line-editor')].map(el=>({productId:el.querySelector('.item-product').value,quantity:Number(el.querySelector('.item-quantity').value),owned:el.querySelector('.item-owned').checked}));if(!items.length)throw Error('Adicione pelo menos um componente.');
      const p={id:form.dataset.id||uid('project'),name:value('name'),currency:value('currency'),items,extrasMinor:parseMoney(value('extras'))??0};const at=next.projects.findIndex(pr=>pr.id===p.id);if(at<0)next.projects.push(p);else next.projects[at]=p;
    }else if(form.id==='preferences-form'){
      const rate=value('rate')?Number(value('rate').replace(',','.')):null;if(rate!=null&&(!Number.isFinite(rate)||rate<=0||rate>1000))throw Error('Informe uma cotação válida para US$ 1.');
      next.settings.displayCurrency=value('currency');next.settings.staleAfterHours=Number(value('stale'));next.settings.exchangeMode=values.get('auto')?'auto':'manual';
      if(next.settings.exchangeMode==='auto'&&exchange?.rate){next.settings.usdBrl=exchange.rate;next.settings.exchangeUpdatedAt=exchange.observed_at;next.settings.exchangeSource=exchange.source?.name||'Banco Central';}
      else{next.settings.usdBrl=rate;next.settings.exchangeUpdatedAt=rate?new Date().toISOString():null;next.settings.exchangeSource=rate?'Informada manualmente':'';}
    }else return;
    const ok=await persist(next);if(!ok)return;if(modal.open)modal.close();if(nextView)go(nextView);render();
    if(newProduct&&productById(newProduct)?.defaultUrl)notify('Pesquisa criada com link. Use “Registrar preço” para adicionar a cotação.');
  }catch(e){if(error)error.textContent=e.message;else notify(e.message);}
  finally{delete form.dataset.saving;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitLabel;}}
}
async function fetchData(file){
  const urls=[`https://raw.githubusercontent.com/kleristonsilvamauricio-ops/nuc-price-tracker/main/data/${file}`,`./data/${file}`];
  for(const url of urls){try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);try{const r=await fetch(`${url}?t=${Date.now()}`,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('indisponível');return await r.json();}finally{clearTimeout(timer);}}catch{/* Try packaged last known data. */}}
  throw Error('Sem conexão com os dados publicados.');
}
async function refreshData({quiet=false}={}){
  if(refreshing)return;refreshing=true;paintRefreshButtons();
  const results=await Promise.allSettled([fetchData('automation-status.json'),fetchData('exchange.json')]);
  if(results[0].status==='fulfilled'&&Array.isArray(results[0].value.sources))automation=results[0].value;
  if(results[1].status==='fulfilled'){
    const x=results[1].value;
    if(x.base==='USD'&&x.quote==='BRL'&&Number.isFinite(x.rate)&&x.rate>0&&x.rate<1000&&Number.isFinite(Date.parse(x.observed_at))){
      exchange=x;
      if(state.settings.exchangeMode!=='manual'&&(!state.settings.exchangeUpdatedAt||Date.parse(x.observed_at)>=Date.parse(state.settings.exchangeUpdatedAt))){const next=clone(state);next.settings.usdBrl=x.rate;next.settings.exchangeUpdatedAt=x.observed_at;next.settings.exchangeSource=x.source?.name||'Banco Central';next.settings.exchangeMode='auto';await persist(next,{quiet:true,snapshot:false});}
    }
  }
  refreshing=false;
  // Reference updates must not replace an unsaved form or an active search.
  const editing=modal.open||app.querySelector('form')||app.contains(document.activeElement)&&document.activeElement.matches('input,select,textarea');
  if(editing)paintRefreshButtons();else render();
  if(!quiet)notify(results.some(r=>r.status==='fulfilled')?'Painel e referências atualizados. Os preços das lojas exigem cotação verificada.':'Sem conexão. Seus registros locais continuam disponíveis.');
}
function paintRefreshButtons(){document.querySelectorAll('[data-action="refresh"]').forEach(button=>{button.disabled=refreshing;button.innerHTML=refreshing?'<span class="loading-spinner"></span>Atualizando…':icon('refresh')+'Atualizar painel';});}
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const backupName=()=>`price-tracker-backup-${new Date().toISOString().slice(0,10)}.json`;
function exportCSV(){
  const rows=[['Produto','Categoria','País','Loja','Vendedor','Moeda','Preço','Frete','Impostos','Desconto','Condição','Estoque','Verificado em (UTC)','Link'],...state.observations.map(o=>[productById(o.productId)?.name,state.categories.find(c=>c.id===productById(o.productId)?.categoryId)?.name,storeById(o.storeId)?.country,storeById(o.storeId)?.name,o.seller,o.currency,(o.priceMinor/100).toFixed(2),o.shippingMinor==null?'':(o.shippingMinor/100).toFixed(2),o.taxMinor==null?'':(o.taxMinor/100).toFixed(2),(o.discountMinor/100).toFixed(2),conditionName(o.condition),availabilityName(o.availability),o.observedAt||'',o.url])];
  const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  download('\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n'),'price-tracker-historico.csv','text/csv;charset=utf-8');
}
async function shareBackup(){
  const file=new File([exportBackup(state)],backupName(),{type:'application/json'});
  if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Backup Price Tracker'});notify('Arquivo enviado para o compartilhamento do dispositivo.');}catch(e){if(e.name!=='AbortError')notify('Compartilhamento indisponível. Use “Baixar backup”.');}}
  else{download(exportBackup(state),backupName());notify('Backup baixado. Você pode enviá-lo ao OneDrive pelo aplicativo Arquivos.');}
}
async function shareProduct(id){const p=productById(id),r=compareProduct(state,id,{currency:viewCurrency(),country:state.settings.country}),q=r.best||r.bestKnown;const text=`${p.name}\n${p.specs}\n${q?`${formatMoney(q.convertedKnownTotalMinor,viewCurrency())}${q.complete?' · total registrado':' · custos pendentes'}\n${storeById(q.observation.storeId)?.name}\nVerificado: ${dateText(q.observation.observedAt)}\n${q.observation.url}`:'Ainda sem cotação atual.'}`;try{if(navigator.share)await navigator.share({title:p.name,text});else{await navigator.clipboard.writeText(text);notify('Resumo copiado.');}}catch(e){if(e.name!=='AbortError')notify('Não foi possível compartilhar agora.');}}
async function openSnapshots(){
  const snapshots=await listSnapshots();
  const recovery=listRecoveryCopies();
  showDialog('Recuperação local',`<p class="muted">As últimas alterações geram cópias neste navegador. Elas ajudam a desfazer mudanças, mas não substituem um arquivo fora do dispositivo.</p>${snapshots.length?snapshots.map(s=>`<div class="row"><div><strong>${dateText(s.createdAt)}</strong><div class="muted">${s.state.products.length} produtos · ${s.state.observations.length} cotações</div></div><button class="btn small" data-action="restore-snapshot" data-id="${esc(s.id)}">Restaurar</button></div>`).join(''):'<p>Ainda não há pontos de recuperação. Eles serão criados ao salvar alterações.</p>'}${recovery.length?`<div class="divider"></div><h3>Arquivos preservados para recuperação</h3><p class="muted">Um arquivo local não pôde ser lido. O conteúdo original foi preservado e pode ser baixado para análise.</p>${recovery.map(r=>`<div class="row"><span>${dateText(r.createdAt)}</span><button class="btn small" data-action="download-recovery" data-id="${esc(r.id)}">Baixar conteúdo original</button></div>`).join('')}`:''}<div class="dialog-actions"><button class="btn" data-action="close">Fechar</button></div>`);
}
async function action(button){
  const action=button.dataset.action,id=button.dataset.id;
  if(button.dataset.view){go(button.dataset.view);return;}
  if(action==='close')modal.close();
  else if(action==='new-product')openProduct();else if(action==='edit-product')openProduct(id);
  else if(action==='details')go(`product/${id}`);else if(action==='new-quote')openQuote(id);
  else if(action==='update-quote'){const o=state.observations.find(o=>o.id===id);if(o)openQuote(o.productId,id);}
  else if(action==='country'){const next=clone(state);next.settings.country=id;await persist(next,{quiet:true,snapshot:false});render();}
  else if(action==='refresh')await refreshData();
  else if(action==='new-category')openCategory();else if(action==='edit-category')openCategory(id);
  else if(action==='new-store')openStore();else if(action==='edit-store')openStore(id);
  else if(action==='new-project')openProject();else if(action==='edit-project')openProject(id);
  else if(action==='add-project-item')$('#project-items').insertAdjacentHTML('beforeend',projectItem());
  else if(action==='remove-project-item')button.closest('.project-line-editor')?.remove();
  else if(action==='read-link')readProductLink();
  else if(action==='history-product'){historyProduct=id;go('history');}
  else if(action==='share-product')await shareProduct(id);
  else if(action==='export-backup'){download(exportBackup(state),backupName());notify('Backup preparado para download.');}
  else if(action==='share-backup')await shareBackup();
  else if(action==='export-csv')exportCSV();
  else if(action==='import-backup')$('#backup-file').click();
  else if(action==='apply-backup'&&pendingBackup){
    const mode=id==='replace'?'replace':'merge';
    const next=importBackup(pendingBackup,state,{mode});
    if(await persist(next)){pendingBackup=null;modal.close();render();notify(mode==='replace'?'Backup restaurado, incluindo metas, montagens e preferências.':'Novos dados adicionados; personalizações atuais preservadas.');}
  }
  else if(action==='snapshots')await openSnapshots();
  else if(action==='download-recovery'){const recovery=listRecoveryCopies().find(r=>r.id===id);if(recovery)download(recovery.raw,`price-tracker-recuperacao-${new Date(recovery.createdAt).toISOString().slice(0,10)}.txt`,'text/plain');}
  else if(action==='restore-snapshot'){
    if(confirm('Restaurar este ponto? O estado atual será guardado como outro ponto de recuperação.')){state=await restoreSnapshot(id);modal.close();render();notify('Ponto de recuperação restaurado.');}
  }else if(action==='persistence'){const granted=await requestPersistence();notify(granted?'O navegador concedeu armazenamento persistente. Mantenha também um backup externo.':'O navegador não confirmou persistência. A exportação continua disponível.');}
  else if(action==='install'&&installPrompt){await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;render();}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action],[data-view]');if(b){e.preventDefault();action(b).catch(error=>notify(error.message));}});
document.addEventListener('submit',e=>{if(e.target.matches('#product-form,#quote-form,#category-form,#store-form,#project-form,#preferences-form')){e.preventDefault();submit(e.target);}});
document.addEventListener('input',e=>{if(e.target.id==='product-search'){filter.query=e.target.value;drawProductCards();}});
document.addEventListener('change',async e=>{
  const id=e.target.id;
  if(id==='category-filter'){filter.category=e.target.value;drawProductCards();}else if(id==='status-filter'){filter.status=e.target.value;drawProductCards();}
  else if(id==='history-product'){historyProduct=e.target.value;renderHistory();}else if(id==='history-currency'){historyCurrency=e.target.value;renderHistory();}
  else if(id==='compare-currency'){const next=clone(state);next.settings.displayCurrency=e.target.value;next.settings.country='ALL';await persist(next,{quiet:true,snapshot:false});render();}
  else if(e.target.name==='store'&&e.target.form?.id==='quote-form'){e.target.form.elements.currency.value=storeById(e.target.value)?.country==='BR'?'BRL':'USD';}
  else if(e.target.name==='url'&&e.target.form?.id==='quote-form'){const store=detectStore(e.target.value);if(store){e.target.form.elements.store.value=store.id;e.target.form.elements.currency.value=store.country==='BR'?'BRL':'USD';}}
});
$('#backup-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    if(file.size>20_000_000)throw Error('O backup deve ter até 20 MB.');
    const text=await file.text(),restored=importBackup(text,state,{mode:'replace'}),merged=importBackup(text,state,{mode:'merge'});
    pendingBackup=text;
    showDialog('Restaurar backup',`<p><strong>${esc(file.name)}</strong></p><p class="muted">O arquivo contém ${restored.products.length} produtos e ${restored.observations.length} cotações.</p><div class="panel panel-tint"><h3>Recuperar todo o cadastro</h3><p>Restaura produtos, metas, montagens, histórico e preferências como estavam no arquivo. O cadastro atual será guardado em um ponto de recuperação local.</p><button class="btn primary" data-action="apply-backup" data-id="replace">Restaurar tudo</button></div><div class="panel"><h3>Adicionar ao cadastro atual</h3><p>Acrescenta ${merged.observations.length-state.observations.length} cotações novas e novos cadastros. Mantém as personalizações atuais quando o mesmo item já existe, além das preferências deste aparelho.</p><button class="btn" data-action="apply-backup" data-id="merge">Adicionar novos registros</button></div><div class="dialog-actions"><button class="btn" data-action="close">Cancelar</button></div>`);
  }
  catch(error){notify(error.message);}finally{e.target.value='';}
});
window.addEventListener('hashchange',render);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
window.addEventListener('online',()=>{notify('Conexão restabelecida.');refreshData({quiet:true});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state&&(!automation?.checked_at||Date.now()-Date.parse(automation.checked_at)>3600000))refreshData({quiet:true});});
async function boot(){
  try{
    storageInfo=await loadState();state=storageInfo.state;render();
    if(storageInfo.migration?.migrated)notify(`${storageInfo.migration.migrated} registros do NUC foram preservados na versão universal.`);
    if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});}
    const params=new URLSearchParams(location.search),shared=params.get('share_url')||params.get('share_text');
    if(params.get('action')==='new'||shared){let url='';try{const match=String(shared||'').match(/https?:\/\/[^\s]+/);if(match)url=safeUrl(match[0]);}catch{}openProduct(null,{name:params.get('share_title')||'',url});history.replaceState(null,'',location.pathname+location.hash);}
    refreshData({quiet:true});
  }catch(error){app.innerHTML=`<div class="notice" role="alert"><h2>Não foi possível abrir o cadastro</h2><p>${esc(error.message)}</p><p>Os dados existentes não foram apagados. Reabra o aplicativo ou restaure um backup em outro navegador.</p></div>`;}
}
boot();
