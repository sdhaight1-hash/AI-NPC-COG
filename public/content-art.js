// Original 2D silhouettes. The same geometry serves SVG icons and the canvas map.
(function (root) {
 'use strict';
 const shapes = {
  wheel: [['#765942','M11 1H13V23H11ZM1 11H23V13H1ZM4 5 5 4 20 19 19 20ZM19 4 20 5 5 20 4 19Z'],['#c49a66','M12 2A10 10 0 1 1 12 22A10 10 0 1 1 12 2ZM12 5A7 7 0 1 0 12 19A7 7 0 1 0 12 5Z']],
  mill: [['#91734e','M2 12H15V22H2Z'],['#c5a279','M1 12 8 5 16 12Z'],['#766455','M18 9A7 7 0 1 1 18 23A7 7 0 1 1 18 9Z'],['#ddba82','M17 10H19V22H17ZM12 15H24V17H12Z']],
  kiln: [['#806856','M3 13Q4 3 12 3Q20 3 21 13V22H3Z'],['#b4916d','M6 12Q7 5 12 5Q17 5 18 12Z'],['#50433a','M8 22V15Q12 10 16 15V22Z'],['#e7aa6b','M10 21Q10 17 12 16Q15 22 10 21Z']],
  ingot: [['#5b6a70','M3 12 7 6H18L22 12 20 19H4Z'],['#aab8b3','M3 12 7 6H18L22 12Z'],['#839493','M7 8H16L18 10H6Z']],
  fish: [['#658780','M3 12 1 7 7 10Q13 4 21 10L23 12 21 14Q13 20 7 14L1 17Z'],['#b2cac0','M8 12Q13 7 20 11L22 12Q13 17 8 12Z'],['#334840','M18 10H20V12H18Z']],
  bark: [['#75553f','M5 4 16 2 20 6 17 22 7 20 3 16Z'],['#b08962','M8 5 11 4 7 16 5 17ZM14 5 17 6 13 13 10 20 8 19Z']],
  loom: [['#967451','M3 3H6V22H3ZM18 3H21V22H18ZM3 4H21V7H3ZM3 17H21V19H3Z'],['#b1c0a7','M7 7H17V16H7Z'],['#738d87','M7 10H17V11H7ZM7 13H17V14H7Z']],
  cart: [['#a58463','M2 7H19L17 16H4Z'],['#d1ab79','M3 7H19V9H3ZM17 12 24 8 24 11 17 15Z'],['#625444','M7 15A3 3 0 1 1 7 21A3 3 0 1 1 7 15ZM15 15A3 3 0 1 1 15 21A3 3 0 1 1 15 15Z']],
  tile: [['#8da082','M2 9 12 3 22 9 12 15Z'],['#53725d','M2 9 12 15 12 21 2 15Z'],['#6f896a','M12 15 22 9 22 15 12 21Z']],
  soil: [['#9c7755','M2 10 12 5 22 10 20 18 12 22 4 18Z'],['#c99a64','M2 10 12 5 22 10 12 15Z'],['#704f3a','M4 15 12 19 20 15 20 17 12 21 4 17Z']],
  stone: [['#414a51','M2 17 6 9 12 5 19 8 22 16 16 21 6 21Z'],['#a2aca7','M2 17 6 9 12 5 16 12 11 17Z'],['#707e80','M16 12 19 8 22 16 16 21 11 17Z']],
  gem: [['#3d4855','M3 9 7 4H17L21 9 12 22Z'],['#a4cec4','M3 9 7 4H17L21 9Z'],['#62a598','M8 9H16L12 22Z']],
  tower: [['#59483d','M3 10H21V21H3Z'],['#b08362','M3 10 8 7H22L21 13H3Z'],['#d7b083','M7 14H11V19H7Z']],
  tree: [['#73543b','M10 13H14L15 22H9Z'],['#264b3c','M3 15Q0 12 5 8Q4 3 10 4Q14 0 17 6Q23 7 22 14Q19 20 12 18Q5 20 3 15Z'],['#6b9660','M4 12Q5 6 10 6Q13 3 16 8Q14 12 9 11Z']],
  stump: [['#765640','M4 15 8 10H16L20 15 18 20H6Z'],['#b08a5a','M8 10H16L19 14 15 17H9L5 14Z']],
  sprout: [['#668650','M11 21V10Q4 12 3 5Q9 4 12 10Q15 2 21 4Q20 12 13 13V21Z'],['#c1a86a','M6 20H18V23H6Z']],
  reeds: [['#58744b','M5 22 4 8H6L8 22ZM10 22 11 5H13V22ZM16 22 19 10H21L18 22Z'],['#c1a46b','M3 6H7V12H3ZM10 3H14V9H10ZM18 8H22V14H18Z']],
  berries: [['#4e7a51','M2 17Q4 7 11 10Q16 5 22 14L20 20H4Z'],['#d78a82','M9 13A2 2 0 1 1 5 13A2 2 0 1 1 9 13ZM17 12A2 2 0 1 1 13 12A2 2 0 1 1 17 12ZM19 17A2 2 0 1 1 15 17A2 2 0 1 1 19 17Z']],
  fauna: [['#a48061','M2 12 7 9 15 10 18 5 22 7 21 12 17 14 16 22H14V16H8L6 22H4V15Z'],['#e2bf91','M16 8 18 2 19 7 22 4 22 7Z']],
  meal: [['#846851','M3 12H21Q19 21 12 21Q5 21 3 12Z'],['#d5b786','M3 12Q7 6 12 9Q16 5 21 12Q16 16 12 15Q7 16 3 12Z']],
  wood: [['#785137','M2 12 15 6 22 10 21 17 8 22 3 18Z'],['#b98e60','M2 12 15 6 22 10 8 16Z'],['#d6ad79','M8 16 14 13 16 18 8 22Z']],
  gear: [['#bb9b6b','M9 2H15V6L18 7 21 6 23 11 20 13V16L21 18 17 22 14 19H10L7 22 3 18 4 15V13L1 11 3 6 6 7 9 6Z'],['#485754','M12 8A4 4 0 1 1 12 16A4 4 0 1 1 12 8Z']],
  tool: [['#926545','M4 20 7 22 18 9 15 7Z'],['#a2aaab','M9 5 15 2 22 6 18 12 13 10Z']],
  hollowVessel: [
   ['#754831','M3 9 8 5H17L21 9 19 18 15 21H9L5 18Z'],
   ['#cc9a67','M3 9 8 5H17L21 9 17 13H7Z'],
   ['#55382c','M6 9 9 7H16L18 9 16 11H8Z']
  ],
  boundVessel: [
   ['#754831','M4 11 7 6H17L20 11 18 19 15 21H9L6 19Z'],
   ['#bf8b55','M4 11 7 6H17L20 11 17 13H7Z'],
   ['#e2c896','M7 7H9L17 18 16 20H15Z M16 7H18L9 20H7Z']
  ],
  flask: [['#886144','M9 3H15V7L19 11V20L16 22H8L5 20V11L9 7Z'],['#dbad79','M9 3H15V6H9Z'],['#79afb0','M7 13Q12 15 17 12V19H7Z']],
  spring: [['#3f6369','M2 13Q7 6 15 8Q22 8 23 15Q20 21 11 21Q4 21 2 13Z'],['#81bfbf','M5 13Q12 8 20 13Q19 17 13 18Q7 18 5 13Z'],['#c5dad1','M9 13Q14 11 17 13Q12 15 9 13Z']],
  campfire: [['#5e4a3d','M3 19 7 16 21 20 19 23ZM4 21 16 16 21 17 9 23Z'],['#e4a05f','M8 18Q6 13 13 4Q12 10 16 11Q21 16 15 20Z'],['#efd18a','M10 18Q9 15 13 12Q16 16 14 19Z']],
  shelter: [['#624e42','M4 12H20V22H4Z'],['#b4935d','M1 13 12 3 23 13 12 16Z'],['#e1c182','M1 13 12 3 12 16Z'],['#3c3933','M10 16H15V22H10Z']],
  crate: [['#906844','M3 8H21V21H3Z'],['#bf9666','M3 8 7 5H22L21 8Z'],['#d7ab73','M5 11H8V19H5ZM16 11H19V19H16Z']]
 };
 const categories = {
  Tiles:'tile', Soils:'soil', 'Rock and minerals':'stone', Flora:'tree', Crops:'sprout',
  Fauna:'fauna', 'Food and drink':'meal', 'Materials and components':'gear',
  'Tools and containers':'tool', Workstations:'tower'
 };
 const special = {
  water:'spring', water_tile:'spring', spring_tile:'spring', garnet:'gem', amethyst:'gem',
  agate:'gem', cattail:'reeds', berries:'berries', bramble:'berries', wood:'wood',
  campfire:'campfire', shelter:'shelter', flask:'flask', crate:'crate',
  millstone:'stone', waterwheel:'wheel', powered_mill:'mill', kiln:'kiln', smelter:'kiln',
  bloomery:'kiln', forge:'campfire', iron_bar:'ingot', steel_bar:'ingot', tin_ingot:'ingot',
  copper_ingot:'ingot', bronze_ingot:'ingot', trout:'fish', perch:'fish', raw_fish:'fish',
  bark:'bark', loom:'loom', handcart:'cart'
 };
 function icon(entry) {
  return shapes[special[entry.id] || categories[entry.category] || 'gear'];
 }
 const terrain = {
  meadow:['#7d9168','#b0b280'], forest:['#526b54','#87966e'], marsh:['#647967','#91ac8c'],
  ridge:['#848681','#a8a69b'], sand:['#b4a07b','#ded0a3'], water:['#527783','#83a8ac']
 };
 const available = typeof root.Path2D === 'function';
 const paths = available ? Object.fromEntries(Object.entries(shapes).map(([key, layers]) =>
  [key, layers.map(([color, d]) => [color, new root.Path2D(d)])])) : {};
 function stamp(ctx, type, x, y, size) {
  const layers = paths[type];
  if (!layers) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  for (const [color, shape] of layers) {
   ctx.fillStyle = color;
   ctx.fill(shape);
  }
  ctx.restore();
 }
 function drawWorld(ctx, world, tile) {
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
   const biome = world.terrain[y * world.width + x];
   const [base, detail] = terrain[biome] || terrain.meadow;
   const lx = x * tile, ly = y * tile;
   ctx.fillStyle = base;
   ctx.fillRect(lx, ly, tile, tile);
   if (((x * 19 ^ y * 31) & 7) > 2) continue;
   ctx.save();
   ctx.translate(lx, ly);
   ctx.scale(tile / 16, tile / 16);
   ctx.globalAlpha = .35;
   ctx.strokeStyle = detail;
   ctx.beginPath();
   if (biome === 'water') {
    ctx.moveTo(2, 9); ctx.quadraticCurveTo(6, 7, 10, 9);
   } else {
    ctx.moveTo(3, 11); ctx.quadraticCurveTo(5, 7, 8, 7);
   }
   ctx.stroke();
   ctx.restore();
  }
 }
 function drawObjects(ctx, world, tile, view) {
  const near = p => p.x >= view.left && p.x <= view.right && p.y >= view.top && p.y <= view.bottom;
  for (const node of world.nodes) {
   if (!near(node) || node.z) continue;
   const type = {food:node.stock > 0 ? 'berries' : 'sprout', wood:node.stock > 0 ? 'tree' : 'stump',
    fiber:'reeds', water:'spring', stone:'stone'}[node.kind];
   if (type) stamp(ctx, type, node.x * tile, node.y * tile, tile);
  }
  for (const item of world.items) {
   if (!near(item) || item.z) continue;
   const type = special[item.kind] || ({stone:'stone', fiber:'reeds'}[item.kind]) || 'tool';
   stamp(ctx, type, (item.x + .18) * tile, (item.y + .18) * tile, tile * .64);
  }
  for (const site of world.structures) {
   if (!near(site) || site.z) continue;
   stamp(ctx, special[site.type] || 'tower', (site.x - .2) * tile, (site.y - .2) * tile, tile * 1.4);
  }
 }
 function drawVesselWorkpiece(ctx, workpiece, x, y, tile) {
  const recipe = workpiece?.recipe;
  if (recipe !== 'hollow_wood_trial' && recipe !== 'flask') return;
  const stage = workpiece.stage;
  const shape = stage === 2 ? 'boundVessel' :
   stage === 1 && recipe === 'flask' ? 'hollowVessel' : 'wood';
  stamp(ctx, shape, x + tile * .67, y + tile * .41, tile * .58);
 }
 root.ContentArt = {available, icon, drawWorld, drawObjects, drawVesselWorkpiece};
})(globalThis);
