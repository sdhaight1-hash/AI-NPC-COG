import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const context = {Path2D: class { constructor(d) { this.d = d; } }};
for (const file of ['content-catalog.js','content-art.js','crafting.js']) {
 runInNewContext(readFileSync(new URL('../public/' + file, import.meta.url), 'utf8'), context);
}
const {ContentCatalog: catalog, ContentArt: art, Crafting} = context;

test('catalog IDs, recipes, research and physical references resolve', () => {
 const ids = catalog.entries.map(entry => entry.id);
 assert.equal(new Set(ids).size, ids.length);
 assert.ok(ids.length >= 125);
 for (const entry of catalog.entries) {
  assert.match(entry.id, /^[a-z][a-z0-9_]*$/);
  assert.ok(entry.name && entry.origin && entry.use);
  assert.ok(art.icon(entry).every(([color, path]) => /^#[0-9a-f]{6}$/.test(color) && /^M/.test(path)));
 }
 const recipeIds = catalog.recipes.map(recipe => recipe.id);
 assert.equal(new Set(recipeIds).size, recipeIds.length);
 for (const recipe of catalog.recipes) {
  assert.equal(catalog.byId[recipe.station]?.category, 'Workstations');
  assert.ok(catalog.technologies[recipe.tech]);
  assert.ok(recipe.minutes > 0 && Number.isInteger(recipe.minutes));
  for (const id of recipe.tools) assert.equal(catalog.byId[id]?.category, 'Tools and containers');
  for (const [id, amount] of [...Object.entries(recipe.inputs), ...Object.entries(recipe.outputs)]) {
   assert.ok(catalog.byId[id], id);
   assert.ok(Number.isInteger(amount) && amount > 0);
  }
 }
 for (const [id, yields] of Object.entries(catalog.yields)) {
  assert.ok(catalog.byId[id]);
  for (const output of yields) assert.ok(catalog.byId[output], output);
 }
 for (const [crop, seed] of Object.entries(catalog.seedFor)) {
  assert.equal(catalog.byId[crop].category, 'Crops');
  assert.equal(catalog.byId[seed].category, 'Crops');
 }
 for (const data of [catalog.containers,catalog.qualities,catalog.substrate])
  for (const id of Object.keys(data)) assert.ok(catalog.byId[id], id);

 const reached = new Set();
 while (true) {
  const before = reached.size;
  for (const [id, tech] of Object.entries(catalog.technologies))
   if (tech.requires.every(dependency => reached.has(dependency))) reached.add(id);
  if (reached.size === before) break;
 }
 assert.equal(reached.size, Object.keys(catalog.technologies).length, 'Missing or circular technology prerequisite');
});

test('active simulator recipe definitions are covered and planned manufacturing can bootstrap', () => {
 const ready = new Set(catalog.entries.filter(entry => ['wild','cultivated','harvested','domesticated'].includes(entry.origin)).map(entry => entry.id));
 ready.add('hands');
 ready.add('campfire');
 for (const recipe of Object.values(Crafting.RECIPES)) {
  for (const id of [...Object.keys(recipe.inputs), recipe.output.kind || recipe.output.structure]) assert.ok(catalog.byId[id], id);
  ready.add(recipe.output.kind || recipe.output.structure);
 }
 const pending = new Set(catalog.recipes);
 while (true) {
  const before = pending.size;
  for (const recipe of pending) {
   if (![recipe.station,...recipe.tools,...Object.keys(recipe.inputs)].every(id => ready.has(id))) continue;
   for (const id of Object.keys(recipe.outputs)) ready.add(id);
   pending.delete(recipe);
  }
  if (pending.size === before) break;
 }
 assert.deepEqual([...pending].map(recipe => recipe.id), []);
});

test('map geometry draws only visible physical objects and leaves state unchanged', () => {
 const operations = [];
 const ctx = new Proxy({}, {get(_, method) { return (...args) => operations.push([method,...args]); }});
 const world = {
  width:2, height:1, terrain:['forest','water'],
  nodes:[{kind:'wood',x:0,y:0,stock:1},{kind:'wood',x:7,y:0,stock:1}],
  items:[{kind:'flask',x:1,y:0,z:1}], structures:[]
 };
 const before = JSON.stringify(world);
 art.drawWorld(ctx,world,16);
 art.drawObjects(ctx,world,16,{left:0,right:1,top:0,bottom:0});
 assert.equal(operations.filter(([op]) => op === 'fillRect').length, 2);
 assert.equal(operations.filter(([op]) => op === 'fill').length, 3);
 assert.equal(JSON.stringify(world), before);
});
