// NAIROS: se conservan las claves existentes para mantener clientes, promociones y lanzamientos.
const STORAGE_KEY = 'gestion-datos-comercio-clientes-v1';
const NETWORK_KEY = 'gestion-datos-comercio-red-v1';
const PRODUCTS_KEY = 'nairos-products-v1';
const ASSETS_DB = 'nairos-images-v1';
const WHATSAPP_URL = 'https://wa.me/573137025268';
const WHATSAPP_TEXT = 'Hola NAIROS, quiero información';
const SOCIAL = {
  instagram: 'https://instagram.com/rinconduque',
  facebook: 'https://facebook.com/jhonnairo.rinconduque',
  whatsapp: WHATSAPP_URL,
  telegram: 'https://t.me/NAIROS',
  tiktok: 'https://www.tiktok.com/@rinconduque'
};
const STOCK_PHOTO = 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=1200&q=85';
const money = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const $ = (selector) => document.querySelector(selector);

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function getAppLink(section) {
  const link = new URL(window.location.href);
  link.hash = section || 'inicio';
  return link.href;
}
function formatDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('es-CO', options);
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2300);
}

let clients = (Array.isArray(readJson(STORAGE_KEY, [])) ? readJson(STORAGE_KEY, []) : []).map((client) => ({
  ...client,
  frequency: Number(client.frequency ?? 0),
  lastPurchase: Number(client.lastPurchase ?? 0),
  interests: client.interests || '',
  sharing: client.sharing === true || client.sharing === 'yes' || client.sharing === 'sí'
}));
const savedNetwork = readJson(NETWORK_KEY, {});
let settings = { earlyAccessThreshold: Number(savedNetwork.earlyAccessThreshold ?? 150000) };
let promotions = Array.isArray(savedNetwork.promotions) ? savedNetwork.promotions : [];
let launches = Array.isArray(savedNetwork.launches) ? savedNetwork.launches : [];
let products = Array.isArray(readJson(PRODUCTS_KEY, [])) ? readJson(PRODUCTS_KEY, []) : [];
let lastSearchedClient = null;
let activePromoIndex = 0;
let promoTimer = null;
const imageUrlCache = new Map();

function saveClients() { writeJson(STORAGE_KEY, clients); }
function saveNetwork() { writeJson(NETWORK_KEY, { ...settings, promotions, launches }); }
function saveProducts() { writeJson(PRODUCTS_KEY, products); }

let dbPromise;
function openAssetsDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('No se puede guardar la foto en este navegador.'));
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSETS_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function saveImage(id, file) {
  if (!file) return;
  const db = await openAssetsDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('images', 'readwrite');
    transaction.objectStore('images').put({ id, blob: file });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  if (imageUrlCache.has(id)) URL.revokeObjectURL(imageUrlCache.get(id));
  imageUrlCache.delete(id);
}
async function getImage(id) {
  if (!id) return '';
  if (imageUrlCache.has(id)) return imageUrlCache.get(id);
  try {
    const db = await openAssetsDb();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('images', 'readonly').objectStore('images').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!record?.blob) return '';
    const url = URL.createObjectURL(record.blob);
    imageUrlCache.set(id, url);
    return url;
  } catch { return ''; }
}

function clientTier(client) {
  const frequent = Number(client.frequency || 0) >= 3;
  return frequent && Number(client.lastPurchase || 0) > settings.earlyAccessThreshold ? 'VIP' : frequent ? 'Frecuente' : 'Nuevo';
}
function nthWeekday(year, month, weekday, occurrence) {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (occurrence - 1) * 7);
}
function commercialDates() {
  const today = new Date();
  const dates = [];
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    dates.push({ name: 'Día de la Madre', date: nthWeekday(year, 4, 0, 2), idea: 'prepara una selección de regalos y accesorios en cuero' });
    dates.push({ name: 'Día del Padre', date: nthWeekday(year, 5, 0, 3), idea: 'destaca billeteras, cinturones y accesorios para regalar' });
    dates.push({ name: 'Amor y Amistad', date: nthWeekday(year, 8, 6, 3), idea: 'ofrece opciones de regalo y detalles en cuero' });
    const thanksgiving = nthWeekday(year, 10, 4, 4);
    dates.push({ name: 'Black Friday', date: new Date(year, 10, thanksgiving.getDate() + 1), idea: 'presenta una selección especial con unidades limitadas' });
    dates.push({ name: 'Temporada de Navidad', date: new Date(year, 11, 1), idea: 'inspira regalos y compras de fin de año' });
  }
  return dates.filter(({ date }) => date >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => a.date - b.date);
}

function renderClients() {
  $('#totalClients').textContent = clients.length;
  $('#sharingClients').textContent = clients.filter((client) => client.sharing).length;
  const average = clients.length ? clients.reduce((sum, client) => sum + Number(client.frequency || 0), 0) / clients.length : null;
  $('#averageFrequency').textContent = average === null ? '—' : average.toFixed(1).replace('.', ',');
  $('#listCount').textContent = clients.length;
  const rows = $('#clientRows');
  if (!clients.length) { rows.innerHTML = '<tr class="empty-row"><td colspan="4">Aún no hay clientes.</td></tr>'; return; }
  rows.innerHTML = [...clients].reverse().map((client) => `<tr><td class="client-name">${safe(client.name)}</td><td>${safe(client.id)}</td><td class="gold-text">${Number(client.frequency || 0)}</td><td><span class="share-pill ${client.sharing ? 'yes' : 'no'}">${client.sharing ? '✓ Sí' : '— No'}</span></td></tr>`).join('');
}

function productMatches(product, search) {
  const query = search.trim().toLocaleLowerCase('es');
  return !query || [product.name, product.code, product.category].some((part) => String(part).toLocaleLowerCase('es').includes(query));
}
function renderInventory() {
  const search = $('#inventorySearch').value;
  const visible = [...products].filter((product) => productMatches(product, search));
  const rows = $('#productRows');
  if (!visible.length) rows.innerHTML = `<tr class="empty-row"><td colspan="7">${products.length ? 'No hay productos que coincidan con la búsqueda.' : 'Aún no hay productos. Agrega el primero arriba.'}</td></tr>`;
  else rows.innerHTML = visible.map((product) => `<tr class="${Number(product.units) <= 3 ? 'low-stock-row' : ''}"><td class="client-name">${safe(product.name)}</td><td>${safe(product.code)}</td><td>${safe(product.category)}</td><td>$${money.format(Number(product.price))}</td><td>${Number(product.units)}</td><td>${Number(product.units) <= 3 ? '<span class="stock-pill low">Pocas unidades</span>' : '<span class="stock-pill ok">Disponible</span>'}</td><td><span class="quantity-controls"><button type="button" data-stock="-1" data-id="${safe(product.id)}" aria-label="Restar unidad">−</button><button type="button" data-stock="1" data-id="${safe(product.id)}" aria-label="Sumar unidad">＋</button></span></td></tr>`).join('');
  const lowCount = products.filter((product) => Number(product.units) <= 3).length;
  const alert = $('#stockAlert');
  alert.classList.toggle('has-alert', lowCount > 0);
  alert.textContent = lowCount ? `⚠ ${lowCount} producto${lowCount === 1 ? '' : 's'} con 3 unidades o menos` : '✓ Todo en orden';
}

function shareLinks(type, id, message, section) {
  const appLink = getAppLink(section);
  const completeText = `${message}\n${appLink}`;
  const wa = `${SOCIAL.whatsapp}?text=${encodeURIComponent(completeText)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(appLink)}&quote=${encodeURIComponent(message)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(message)}`;
  return `<div class="card-share" aria-label="Compartir ${type}">
    <a href="${wa}" target="_blank" rel="noopener" class="share-action wa-share">WhatsApp</a>
    <a href="${fb}" target="_blank" rel="noopener" class="share-action">Facebook</a>
    <a href="${tg}" target="_blank" rel="noopener" class="share-action">Telegram</a>
    <button type="button" class="share-action" data-copy-link="${safe(section)}">Copiar enlace</button>
    <a href="${SOCIAL.facebook}" target="_blank" rel="noopener" class="share-action profile-share">Perfil Facebook ↗</a>
    <a href="${SOCIAL.instagram}" target="_blank" rel="noopener" class="share-action profile-share">Instagram ↗</a>
    <a href="${SOCIAL.tiktok}" target="_blank" rel="noopener" class="share-action profile-share">TikTok ↗</a>
  </div>`;
}

async function renderCatalog() {
  const grid = $('#catalogGrid');
  if (!products.length) { grid.innerHTML = '<div class="empty-card">Tu catálogo aparecerá aquí cuando agregues productos al inventario.</div>'; return; }
  const cards = await Promise.all(products.map(async (product) => {
    const image = await getImage(product.id);
    const message = `Conoce ${product.name}, de nuestra categoría ${product.category}, por $${money.format(Number(product.price))} COP. Disponible en NAIROS.`;
    return `<article class="product-card"><button class="product-image image-zoom" type="button" data-zoom="${safe(image || STOCK_PHOTO)}" aria-label="Ampliar foto de ${safe(product.name)}"><img src="${safe(image || STOCK_PHOTO)}" alt="${safe(product.name)}" loading="lazy"><span class="image-label">VER DETALLE ↗</span></button><div class="product-card-info"><p class="product-category">${safe(product.category)} · NAIROS</p><h3>${safe(product.name)}</h3><p class="product-code">REF. ${safe(product.code)}</p><div class="product-card-bottom"><strong>$${money.format(Number(product.price))}</strong><span class="catalog-stock">${Number(product.units) <= 3 ? 'Últimas unidades' : `${Number(product.units)} disponibles`}</span></div>${shareLinks('producto', product.id, message, 'catalogo')}</div></article>`;
  }));
  grid.innerHTML = cards.join('');
}

function promoMessage(promotion) {
  return `${promotion.title}. ${promotion.description} Vigente hasta ${formatDate(promotion.validUntil)}.`;
}
async function promotionImage(promotion) {
  return await getImage(promotion.id) || (products.length ? await getImage(products[0].id) : '') || STOCK_PHOTO;
}
async function renderPromotions() {
  const carousel = $('#promotionCarousel');
  const dots = $('#carouselDots');
  if (!promotions.length) {
    carousel.classList.add('is-empty');
    carousel.querySelectorAll('.carousel-arrow').forEach((arrow) => { arrow.hidden = true; });
    dots.innerHTML = '';
    carousel.querySelector('.carousel-empty').hidden = false;
    $('#promotionList').innerHTML = '<p class="empty-card">Las promociones publicadas aparecerán aquí.</p>';
    return;
  }
  carousel.classList.remove('is-empty');
  carousel.querySelectorAll('.carousel-arrow').forEach((arrow) => { arrow.hidden = promotions.length < 2; });
  activePromoIndex = ((activePromoIndex % promotions.length) + promotions.length) % promotions.length;
  const promo = promotions[activePromoIndex];
  const image = await promotionImage(promo);
  carousel.querySelector('.carousel-empty').hidden = true;
  let slide = carousel.querySelector('.promotion-slide');
  if (slide) slide.remove();
  const article = document.createElement('article');
  article.className = 'promotion-slide';
  article.innerHTML = `<button class="promo-photo image-zoom" type="button" data-zoom="${safe(image)}" aria-label="Ampliar imagen de la promoción"><img src="${safe(image)}" alt="${safe(promo.title)}" loading="lazy"></button><div class="promo-overlay"><span class="promo-tag">NAIROS · ESPECIAL</span><div><p class="promo-expiry">VÁLIDA HASTA ${safe(formatDate(promo.validUntil, { day: 'numeric', month: 'long' }).toUpperCase())}</p><h3>${safe(promo.title)}</h3><p>${safe(promo.description)}</p><button class="button promo-cta" type="button" data-copy-link="promociones">Conocer promoción <span>↗</span></button></div></div>`;
  carousel.insertBefore(article, carousel.querySelector('.carousel-arrow'));
  dots.innerHTML = promotions.map((_, index) => `<button type="button" class="carousel-dot ${index === activePromoIndex ? 'active' : ''}" data-promo-index="${index}" aria-label="Ver promoción ${index + 1}"></button>`).join('');
  $('#promotionList').innerHTML = [...promotions].reverse().map((item) => `<article class="promo-list-card"><div><strong>${safe(item.title)}</strong><small>Vigente hasta ${safe(formatDate(item.validUntil))}</small><p>${safe(item.description)}</p>${shareLinks('promoción', item.id, promoMessage(item), 'promociones')}</div></article>`).join('');
}

function renderCalendar() {
  $('#calendarList').innerHTML = commercialDates().slice(0, 5).map((event) => `<article class="calendar-item"><time>${safe(event.date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }))}</time><div><strong>${safe(event.name)}</strong><p>${safe(event.idea)}.</p></div></article>`).join('');
}
function renderLaunches() {
  const target = $('#launchList');
  if (!launches.length) { target.innerHTML = '<p class="empty-card">Aún no hay lanzamientos programados.</p>'; return; }
  target.innerHTML = [...launches].reverse().map((launch) => `<article class="launch-card"><span class="launch-mark">N</span><div><p class="product-category">PRÓXIMAMENTE</p><h4>${safe(launch.name)}</h4><p>${safe(launch.description)}</p><small>Disponible desde ${safe(formatDate(launch.availableDate))}${launch.preorder ? ` · Reservas anticipadas desde $${money.format(Number(launch.threshold ?? settings.earlyAccessThreshold))}` : ''}</small></div></article>`).join('');
}

function customerMessage(client) {
  const tier = clientTier(client);
  const active = [...promotions].reverse().find((item) => item.validUntil >= new Date().toISOString().slice(0, 10));
  const offer = active ? `${active.title}: ${active.description}. Vigente hasta ${formatDate(active.validUntil)}.` : tier === 'VIP' ? 'Tienes 10% de descuento en tu próxima compra y acceso anticipado a nuevos productos.' : tier === 'Frecuente' ? 'Tienes 10% de descuento en tu próxima compra.' : 'Descubre nuestras novedades de cuero.';
  return `Hola ${client.name}, ${offer}${client.interests ? ` Creemos que te puede interesar: ${client.interests}.` : ''} ${getAppLink('catalogo')}`;
}
function leatherRecommendation(interests) {
  const source = String(interests || '').trim();
  if (!source) return '✨ Comparte nuestras novedades de bolsos, calzado y accesorios de cuero.';
  const lower = source.toLocaleLowerCase('es');
  const ideas = [];
  if (/bolso|cartera|morral|mochila/.test(lower)) ideas.push('bolsos y morrales de cuero');
  if (/zapato|calzado|bota/.test(lower)) ideas.push('calzado de cuero');
  if (/billetera/.test(lower)) ideas.push('billeteras de cuero');
  if (/cintur|correa/.test(lower)) ideas.push('cinturones de cuero');
  if (!ideas.length) ideas.push(`productos de cuero relacionados con “${source}”`);
  return `✨ Recomendaciones personalizadas: ${safe(ideas.join(', '))}.`;
}
function showClient(client) {
  lastSearchedClient = client;
  const tier = clientTier(client);
  const base = `<div class="result-header"><h3>${safe(client.name)}</h3><span class="tier-badge ${tier.toLowerCase()}">${tier}</span></div><div class="result-meta">${safe(client.id)} · ${safe(client.city)}<br>Frecuencia: ${Number(client.frequency || 0)} compras/mes · Última compra: $${money.format(Number(client.lastPurchase || 0))}<br>Intereses: ${safe(client.interests || 'No indicados')}<br>Autoriza promociones: <strong>${client.sharing ? 'Sí' : 'No'}</strong></div>`;
  if (!client.sharing) { $('#searchResult').innerHTML = `${base}<div class="offer protected">🔒 Privacidad activada — no enviamos promociones sin su autorización</div>`; return; }
  const offers = [];
  if (tier === 'Frecuente' || tier === 'VIP') offers.push('<div class="offer">🎁 Descuento del 10% en su próxima compra.</div>');
  if (tier === 'VIP') offers.push(`<div class="offer">📦 Acceso anticipado a nuevos productos y lotes especiales: compra superior a $${money.format(settings.earlyAccessThreshold)}.</div>`);
  offers.push(`<div class="offer interest-offer">${leatherRecommendation(client.interests)}</div>`);
  const next = commercialDates()[0];
  if (next) offers.push(`<div class="offer timing">🗓️ Próxima fecha estratégica: ${safe(formatDate(next.date.toISOString().slice(0, 10), { day: 'numeric', month: 'long' }))} (${safe(next.name)}). ${safe(next.idea)}.</div>`);
  offers.push(`<div class="result-share"><p class="form-kicker">MENSAJE PERSONALIZADO</p><a class="share-action wa-share" href="${WHATSAPP_URL}?text=${encodeURIComponent(customerMessage(client))}" target="_blank" rel="noopener">📲 Abrir WhatsApp</a></div>`);
  $('#searchResult').innerHTML = `${base}<div class="result-offers">${offers.join('')}</div>`;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const temporary = document.createElement('textarea'); temporary.value = text;
      temporary.style.position = 'fixed'; temporary.style.opacity = '0'; document.body.appendChild(temporary); temporary.select();
      const copied = document.execCommand('copy'); temporary.remove(); if (!copied) throw new Error('copy unavailable');
    }
    return true;
  } catch { return false; }
}

$('#productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const code = String(values.get('code')).trim();
  if (products.some((item) => item.code.toLocaleLowerCase() === code.toLocaleLowerCase())) { $('#productMessage').textContent = 'Ese código ya está registrado.'; return; }
  const id = makeId('product');
  const product = { id, name: String(values.get('name')).trim(), code, category: String(values.get('category')).trim(), price: Number(values.get('price')), units: Number(values.get('units')) };
  products.push(product); saveProducts();
  const file = values.get('photo');
  if (file instanceof File && file.size) {
    try { await saveImage(id, file); }
    catch { showToast('Producto guardado; no se pudo guardar la foto en este navegador.'); }
  }
  form.reset(); $('#productMessage').textContent = 'Producto guardado en el inventario.';
  renderInventory(); await renderCatalog(); await renderPromotions();
});

$('#inventorySearch').addEventListener('input', renderInventory);
$('#productRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-stock]');
  if (!button) return;
  const product = products.find((item) => item.id === button.dataset.id);
  if (!product) return;
  product.units = Math.max(0, Number(product.units) + Number(button.dataset.stock));
  saveProducts(); renderInventory(); renderCatalog();
});

$('#clientForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const id = String(values.get('id')).trim();
  if (clients.some((client) => String(client.id).toLocaleLowerCase() === id.toLocaleLowerCase())) { $('#formMessage').textContent = 'Ya existe un cliente con esa identificación.'; $('#formMessage').classList.add('error'); return; }
  clients.push({ name: String(values.get('name')).trim(), id, city: String(values.get('city')).trim(), frequency: Number(values.get('frequency')), lastPurchase: Number(values.get('lastPurchase')), interests: String(values.get('interests') || '').trim(), sharing: values.get('sharing') === 'yes', policyAccepted: true, policyAcceptedAt: new Date().toISOString() });
  saveClients(); renderClients(); form.reset(); $('#formMessage').classList.remove('error'); $('#formMessage').textContent = 'Cliente guardado correctamente.';
});
$('#searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = $('#searchId').value.trim();
  const client = clients.find((item) => String(item.id).toLocaleLowerCase() === id.toLocaleLowerCase());
  if (!id) $('#searchResult').textContent = 'Escribe una identificación para buscar.';
  else if (!client) { $('#searchResult').textContent = 'No encontramos ese cliente.'; lastSearchedClient = null; }
  else showClient(client);
});

$('#thresholdInput').value = settings.earlyAccessThreshold;
$('#thresholdForm').addEventListener('submit', (event) => {
  event.preventDefault(); settings.earlyAccessThreshold = Math.max(0, Number($('#thresholdInput').value) || 0); saveNetwork();
  $('#thresholdMessage').textContent = `Monto guardado: $${money.format(settings.earlyAccessThreshold)}.`;
  if (lastSearchedClient) showClient(lastSearchedClient);
});
$('#promotionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget; const values = new FormData(form); const id = makeId('promo');
  promotions.push({ id, title: String(values.get('title')).trim(), description: String(values.get('description')).trim(), validUntil: String(values.get('validUntil')) });
  saveNetwork();
  const file = values.get('photo');
  if (file instanceof File && file.size) { try { await saveImage(id, file); } catch { showToast('Promoción guardada; no se pudo guardar la foto.'); } }
  form.reset(); activePromoIndex = promotions.length - 1; await renderPromotions(); startPromoCarousel(); showToast('Promoción publicada.');
});
$('#launchForm').addEventListener('submit', (event) => {
  event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const optionalThreshold = String(values.get('threshold') || '').trim();
  launches.push({ id: makeId('launch'), name: String(values.get('name')).trim(), description: String(values.get('description')).trim(), availableDate: String(values.get('availableDate')), threshold: optionalThreshold ? Number(optionalThreshold) : null, preorder: values.get('preorder') === 'on' });
  saveNetwork(); renderLaunches(); form.reset(); showToast('Lanzamiento guardado.');
});

function startPromoCarousel() {
  clearInterval(promoTimer);
  if (promotions.length > 1) promoTimer = setInterval(() => { activePromoIndex = (activePromoIndex + 1) % promotions.length; renderPromotions(); }, 4000);
}
$('#promoPrev').addEventListener('click', () => { activePromoIndex--; renderPromotions(); startPromoCarousel(); });
$('#promoNext').addEventListener('click', () => { activePromoIndex++; renderPromotions(); startPromoCarousel(); });
$('#carouselDots').addEventListener('click', (event) => {
  const dot = event.target.closest('[data-promo-index]');
  if (!dot) return;
  activePromoIndex = Number(dot.dataset.promoIndex); renderPromotions(); startPromoCarousel();
});

document.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-copy-link]');
  if (copyButton) {
    const copied = await copyText(getAppLink(copyButton.dataset.copyLink));
    copyButton.classList.add('was-clicked');
    copyButton.textContent = copied ? 'Enlace copiado ✓' : 'No se pudo copiar';
    showToast(copied ? 'Enlace de NAIROS copiado.' : 'No se pudo copiar el enlace.');
    setTimeout(() => { copyButton.textContent = 'Copiar enlace'; copyButton.classList.remove('was-clicked'); }, 1800);
    return;
  }
  const zoom = event.target.closest('[data-zoom]');
  if (zoom) { $('#dialogImage').src = zoom.dataset.zoom; $('#imageDialog').showModal(); return; }
  if (event.target.closest('.dialog-close')) $('#imageDialog').close();
});
$('#imageDialog').addEventListener('click', (event) => { if (event.target === $('#imageDialog')) $('#imageDialog').close(); });

// El subrayado de navegación sigue a la sección visible y las animaciones respetan la preferencia del dispositivo.
const navLinks = [...document.querySelectorAll('.top-nav a, .bottom-nav a')];
const navObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) navLinks.forEach((link) => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
  });
}, { rootMargin: '-35% 0px -55% 0px' });
['inicio', 'inventario', 'catalogo', 'promociones', 'clientes'].forEach((id) => { const element = document.getElementById(id); if (element) navObserver.observe(element); });

renderClients(); renderInventory(); renderCalendar(); renderLaunches();
renderCatalog(); renderPromotions().then(startPromoCarousel);
