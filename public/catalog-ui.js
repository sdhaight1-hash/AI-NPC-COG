(function () {
 'use strict';

 const catalog = ContentCatalog;
 const byId = id => document.getElementById(id);
 const dialog = byId('catalog');
 const search = byId('catalogQuery');
 const category = byId('catalogCategory');
 const results = byId('catalogResults');
 const detail = byId('catalogDetail');
 const live = Object.entries(Crafting.RECIPES).map(([id, recipe]) => ({
  id, name:recipe.name, inputs:recipe.inputs, station:recipe.station || 'hands',
  outputs:{[recipe.output.kind || recipe.output.structure]:recipe.output.count || 1},
  tools:recipe.tool ? [recipe.tool] : [],
  minutes:recipe.stages.reduce((sum, stage) => sum + stage.minutes, 0),
  stages:recipe.stages, active:true
 }));
 const recipes = [...live, ...catalog.recipes];
 const activeEntries = new Set(['meadow','forest','marsh','ridge','sand','water_tile','bedrock','air',
  'stone','cave','food','water','berries','nuts','wood','fiber','hands','campfire',
  ...live.flatMap(recipe => Object.keys(recipe.outputs))]);

 function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
 }
 function icon(entry) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [color, path] of ContentArt.icon(entry)) {
   const shape = document.createElementNS(ns, 'path');
   shape.setAttribute('d', path);
   shape.setAttribute('fill', color);
   svg.append(shape);
  }
  return svg;
 }
 const name = id => catalog.byId[id]?.name || id;
 const quantities = items => Object.entries(items).map(([id, count]) => count + ' × ' + name(id)).join(' · ');
 let selected = null;

 function renderDetail(entry) {
  detail.replaceChildren();
  if (!entry) {
   detail.append(el('p', 'No entries match your filters.'));
   return;
  }
  const head = el('header', undefined, 'catalog-detail-head');
  head.append(icon(entry), el('h3', entry.name));
  detail.append(head, el('p', entry.category + ' · ' + entry.origin +
   ' · ' + (activeEntries.has(entry.id) ? 'In simulation' : 'Design catalog'), 'catalog-meta'),
   el('p', entry.use));
  const yields = catalog.yields[entry.id];
  const soil = catalog.substrate[entry.id];
  const contents = catalog.containers[entry.id];
  const qualities = catalog.qualities[entry.id];
  if (yields) detail.append(el('p', 'Yields: ' + yields.map(name).join(', ')));
  if (soil) detail.append(el('p', 'Drainage: ' + soil.drainage + ' · Fertility: ' + soil.fertility));
  if (contents) detail.append(el('p', 'Capacity: ' +
   (contents.capacity === null ? contents.unit : contents.capacity + ' ' + contents.unit) +
   ' · Accepts ' + contents.accepted.join(', ')));
  if (qualities) detail.append(el('p', 'Qualities: ' +
   Object.entries(qualities).map(([key, value]) => key + ' ' + value).join(', ')));
  if (catalog.seedFor[entry.id]) detail.append(el('p', 'Seed: ' + name(catalog.seedFor[entry.id])));
  const processes = recipes.filter(recipe => Object.hasOwn(recipe.outputs, entry.id) ||
   Object.hasOwn(recipe.inputs, entry.id) || recipe.station === entry.id || recipe.tools.includes(entry.id));
  if (!processes.length) return;
  detail.append(el('h4', 'Related processes'));
  for (const recipe of processes) {
   const card = el('article', undefined, 'catalog-process');
   const title = recipe.id.replaceAll('_', ' ');
   card.append(el('strong', recipe.name || title[0].toUpperCase() + title.slice(1)),
    el('p', (recipe.active ? 'In simulation' : 'Design catalog') + ' · ' +
     name(recipe.station) + ' · ' + recipe.minutes + ' min', 'catalog-meta'),
    el('p', quantities(recipe.inputs) + ' → ' + quantities(recipe.outputs)));
   if (recipe.tools.length) card.append(el('p', 'Tools: ' + recipe.tools.map(name).join(', ')));
   if (recipe.tech) {
    const tech = catalog.technologies[recipe.tech];
    card.append(el('p', 'Research: ' + tech.name +
     (tech.requires.length ? ' · Requires ' + tech.requires.map(id => catalog.technologies[id].name).join(', ') : '')));
   }
   if (recipe.power) card.append(el('p', 'Power: ' + recipe.power));
   if (recipe.stages) {
    const stages = el('details');
    stages.append(el('summary', 'Work stages'));
    const list = el('ol');
    for (const stage of recipe.stages) list.append(el('li', stage.name + ' · ' + stage.minutes + ' min'));
    stages.append(list);
    card.append(stages);
   }
   detail.append(card);
  }
 }
 function render() {
  const query = search.value.trim().toLowerCase();
  const entries = catalog.entries.filter(entry =>
   (!category.value || category.value === entry.category) &&
   [entry.id, entry.name, entry.use].some(value => value.toLowerCase().includes(query)));
  if (!entries.some(entry => entry.id === selected)) selected = entries[0]?.id ?? null;
  byId('catalogCount').textContent = entries.length + (entries.length === 1 ? ' entry' : ' entries');
  results.replaceChildren(...entries.map(entry => {
   const button = el('button', undefined, 'catalog-entry');
   button.type = 'button';
   button.setAttribute('aria-pressed', String(entry.id === selected));
   button.append(icon(entry), el('span', entry.name));
   button.addEventListener('click', () => {
    results.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-pressed', 'true');
    selected = entry.id;
    renderDetail(entry);
   });
   return button;
  }));
  renderDetail(catalog.byId[selected]);
 }
 for (const value of new Set(catalog.entries.map(entry => entry.category))) {
  const option = el('option', value);
  option.value = value;
  category.append(option);
 }
 byId('catalogOpen').addEventListener('click', () => {
  dialog.showModal();
  search.focus();
 });
 search.addEventListener('input', render);
 category.addEventListener('change', render);
 render();
})();
