// Versioned design catalog for the observatory. Stable IDs join entries and recipes.
(function (root) {
 'use strict';

 const entries = [];
 function group(category, rows) {
  for (const line of rows.trim().split('\n')) {
   const [id, name, origin, use] = line.split('|');
   entries.push({id, name, category, origin, use});
  }
 }

 group('Tiles', `
meadow|Meadow|wild|Forage, graze and establish plots
forest|Forest floor|wild|Timber, litter and shade flora
marsh|Marsh|wild|Reeds, shallow water and waterlogged soil
ridge|Exposed ridge|wild|Stone and shallow mineral exploration
sand|Sand|wild|Loose footing, drainage and glass feedstock
water_tile|Open water|wild|Swimming, boats and fishing
spring_tile|Freshwater spring|wild|Freshwater with finite local stock
cliff|Cliff face|wild|Solid change in elevation
bedrock|Bedrock|wild|Structural substrate and rock strata
air|Open air|wild|Empty volume above terrain or inside shafts
cave|Cave passage|wild|Walkable void within a rock stratum
mud|Mud|wild|Poor drainage and slow footing
snow_cover|Snow cover|wild|Seasonal surface layer
ice_cover|Ice cover|wild|Seasonal surface layer with load-dependent safety
tilled_plot|Tilled plot|built|Root zone prepared for sowing
dirt_track|Dirt track|built|Low-cost foot route
gravel_road|Gravel road|built|Drained route for carts
wood_floor|Board floor|built|Walkable constructed surface
stone_wall|Stone wall|built|Solid support and enclosure
wood_door|Wooden door|built|Traversable opening when open
thatch_roof|Thatched roof|built|Overhead shelter requiring support
stairs|Stairs|built|Movement between elevations
bridge_deck|Bridge deck|built|Supported crossing over a gap
`);
 group('Soils', `
loam|Loam|wild|Balanced water retention and aeration for plots
sandy_soil|Sandy soil|wild|Rapid drainage and low nutrient retention
clay_soil|Clay soil|wild|Slow drainage and fine substrate
silt_soil|Silt soil|wild|Moist fertile substrate prone to erosion
peat|Peat|wild|Wet organic substrate, with fuel use after drying
topsoil|Topsoil|wild|Organic surface horizon
clay|Pottery clay|wild|Plastic feedstock for vessels, bricks and molds
gravel|Gravel|wild|Drainage, surfacing and road beds
compost|Compost|crafted|Return organic waste to plots
`);
 group('Rock and minerals', `
stone|Unsorted stone|wild|Legacy stone stock for early work
flint|Flint|wild|Sharp flakes and knapping
obsidian|Obsidian|wild|Sharp but brittle edges
granite|Granite|wild|Hard masonry and grinding surfaces
basalt|Basalt|wild|Dense paving and aggregate
limestone|Limestone|wild|Masonry and lime feedstock
sandstone|Sandstone|wild|Cut stone and abrasives
slate|Slate|wild|Naturally split roofing and tiles
marble|Marble|wild|Carving and finished masonry
quartz|Quartz|wild|Abrasive and silica feedstock
gypsum|Gypsum|wild|Plaster feedstock
rock_salt|Rock salt|wild|Seasoning and preservation
malachite|Malachite ore|wild|Copper-bearing deposit
cassiterite|Cassiterite ore|wild|Tin-bearing deposit
hematite|Hematite ore|wild|Iron-bearing deposit
galena|Galena ore|wild|Lead-bearing deposit for later processing
sphalerite|Sphalerite ore|wild|Zinc-bearing deposit for brass
native_gold|Native gold|wild|Jewelry and exchange
silver_ore|Silver ore|wild|Refining and specialized goods
bituminous_coal|Bituminous coal|wild|Mineral fuel and coke feedstock
garnet|Garnet|wild|Abrasive or lapidary material
amethyst|Amethyst|wild|Lapidary material
agate|Agate|wild|Lapidary material
`);
 group('Flora', `
oak|Oak|wild|Durable timber, acorns and tannin-bearing bark
pine|Pine|wild|Softwood, resin and fuel
birch|Birch|wild|Timber, bark and tinder
willow|Willow|wild|Flexible rods and riparian habitat
cattail|Cattail|wild|Wetland fiber and edible seasonal shoots
bramble|Bramble|wild|Seasonal berries and wildlife cover
hazel|Hazel|wild|Nuts and flexible stems
wild_allium|Wild allium|wild|Seasonal greens once identified
yarrow|Yarrow|wild|Identifiable garden herb for apothecary trials
mint|Mint|wild|Fragrant wet-ground herb for cooking and teas
oyster_mushroom|Oyster mushroom|wild|Decomposer and food once identified
orchard_apple|Apple tree|cultivated|Perennial fruit with seasonal harvest
`);
 group('Crops', `
barley_seed|Barley seed|wild|Sowing stock for barley
barley|Barley|cultivated|Grain crop for milling and storage
emmer_seed|Emmer seed|wild|Sowing stock for emmer
emmer|Emmer wheat|cultivated|Grain crop with processing requirements
bean_seed|Bean seed|wild|Sowing stock for beans
bean|Beans|cultivated|Dry pulse and crop-rotation candidate
flax_seed|Flax seed|wild|Sowing stock for flax
flax|Flax|cultivated|Fiber crop for textiles and rope
turnip_seed|Turnip seed|wild|Sowing stock for turnips
turnip|Turnip|cultivated|Root crop and winter stores
`);
 group('Fauna', `
hare|Hare|wild|Small prey, browsing and rapid reproduction
deer|Deer|wild|Large browser and seasonal herd movement
boar|Wild boar|wild|Omnivore, rooting and defensive behavior
wolf|Wolf|wild|Pack predator and competition for prey
fox|Fox|wild|Small predator and scavenger
duck|Duck|wild|Wetlands, eggs and small game
trout|Trout|wild|Cold freshwater fish
perch|Perch|wild|Freshwater fish
honeybee|Honeybee|wild|Pollination and hive products
goat|Goat|domesticated|Browse, milk and manure
pack_goat|Pack goat|domesticated|Small pack loads on narrow steep routes
sheep|Sheep|domesticated|Grazing, wool and manure
chicken|Chicken|domesticated|Eggs and small livestock
`);
 group('Food and drink', `
food|Mixed forage|wild|Existing aggregate food supply
water|Fresh water|wild|Drink directly at a source or transport in a vessel
berries|Berries|wild|Perishable gathered fruit
nuts|Nuts|wild|Seasonal storable calories
apple|Apple|harvested|Fresh or dried orchard fruit
grain|Dry grain|harvested|Store, sow or mill
flour|Flour|crafted|Milled grain for cooking
raw_meat|Raw meat|harvested|Perishable carcass yield
raw_fish|Raw fish|harvested|Perishable fish yield
cooked_meat|Cooked meat|crafted|Meal cooked at a fire
dried_meat|Dried meat|crafted|Preserved portable ration
bean_stew|Bean stew|crafted|Cooked pulse and water meal
flatbread|Flatbread|crafted|Cooked flour dough
milk|Milk|harvested|Perishable livestock yield
egg|Egg|harvested|Perishable nest or livestock yield
honey|Honey|harvested|Stored hive product
`);
 group('Materials and components', `
wood|Rough timber|wild|Fuel and early structural stock
fiber|Plant fiber|wild|Bindings, textiles and thatch
resin|Resin|harvested|Sealant, adhesive and pitch feedstock
bark|Bark|harvested|Tinder and tannin feedstock
raw_hide|Raw hide|harvested|Perishable tanning feedstock
bone|Bone|harvested|Small hard parts
sinew|Sinew|harvested|Fine bindings
wool|Wool|harvested|Spun textile feedstock
plant_waste|Plant residue|harvested|Compost and dry fuel feedstock
charcoal|Charcoal|crafted|Carbon-rich process fuel
ash|Ash|crafted|Fire residue
slag|Slag|crafted|Separable smelting residue
cord|Twisted cord|crafted|Bindings and small mechanisms
plank|Board|crafted|Joinery and structural stock
beam|Beam|crafted|Structural framing
leather|Leather|crafted|Flexible durable straps and clothing
linen|Linen|crafted|Woven cloth
unfired_pot|Unfired pot|crafted|Fragile ceramic workpiece
brick|Fired brick|crafted|Masonry and refractory construction
lime|Lime|crafted|Mortar and finishing feedstock
mortar|Mortar|crafted|Masonry binder
copper_ingot|Copper ingot|crafted|Casting stock
tin_ingot|Tin ingot|crafted|Alloy stock
bronze_ingot|Bronze ingot|crafted|Cast tool stock
iron_bloom|Iron bloom|crafted|Intermediate metal and slag body
iron_bar|Wrought iron bar|crafted|Forging stock
steel_bar|Steel bar|crafted|Hard tool stock
metal_plate|Iron plate|crafted|Structural and machine sheet stock
iron_nail|Iron nails|crafted|Fasteners
axle|Wooden axle|crafted|Transmit rotation
gear|Gear wheel|crafted|Change axis or ratio
bearing|Plain bearing|crafted|Support a rotating shaft
pulley|Pulley|crafted|Redirect a rope drive
belt|Leather drive belt|crafted|Transmit motion between shafts
millstone|Millstone|crafted|Grinding surface
waterwheel|Waterwheel|crafted|Mechanical prime mover at a current
`);
 group('Tools and containers', `
blade|Knapped blade|crafted|Cutting stone edge
hatchet|Hafted hatchet|crafted|Cut and split timber
flask|Wooden flask|crafted|Carry individual freshwater units
crate|Timber crate|crafted|Store and transfer local materials
hammerstone|Hammerstone|crafted|Percussion tool
stone_hoe|Stone hoe|crafted|Prepare soil
stone_spear|Stone-tipped spear|crafted|Hunting implement
snare|Cord snare|crafted|Passive small-game trapping
fishing_line|Fishing line|crafted|Angling gear
basket|Woven basket|crafted|Light bulk transport
pot|Ceramic cooking pot|crafted|Cook and contain liquids
tongs|Forged tongs|crafted|Handle hot workpieces
smith_hammer|Smithing hammer|crafted|Forge iron workpieces
bronze_pick|Bronze pick|crafted|Excavate suitable rock
iron_pick|Iron pick|crafted|Excavate harder rock
handcart|Handcart|crafted|Move bulky loads by route
`);
 group('Workstations', `
hands|Hand work|built|Portable working capability
campfire|Campfire|built|Cook food and warm nearby space
shelter|Timber shelter|built|Existing staged primitive shelter
workbench|Woodworking bench|built|Cutting and joinery
stockpile|Stockpile|built|Reserved staging and delivery endpoint
drying_rack|Drying rack|built|Air-dry food and hides
butcher_block|Butcher block|built|Process carcasses and separate yields
tanning_vat|Tanning vat|built|Cure hides using tannins
loom|Loom|built|Weave spun plant fiber
clay_bench|Clay-forming bench|built|Shape clay workpieces
kiln|Kiln|built|Fire ceramics and process lime
charcoal_pit|Charcoal pit|built|Low-oxygen conversion of timber
smelter|Crucible hearth|built|Heat and refine suitable ores
bloomery|Bloomery|built|Reduce iron ore to bloom
forge|Forge and anvil|built|Heat, consolidate and shape metal
cementation_furnace|Cementation furnace|built|Carburize prepared iron
quern|Hand quern|built|Mill grain with human effort
powered_mill|Powered mill|built|Mill grain with shaft power
market_stall|Market stall|built|Public point for delivering and exchanging goods
apothecary_bench|Apothecary bench|built|Prepare and record identified plant ingredients
research_desk|Research desk|built|Record trials and compare results
`);
 const technologies = {
  handwork: {name:'Hand work', requires:[]},
  husbandry: {name:'Cultivation and husbandry', requires:['handwork']},
  preservation: {name:'Food preservation', requires:['handwork']},
  ceramics: {name:'Ceramics', requires:['handwork']},
  copper_work: {name:'Copper metallurgy', requires:['ceramics']},
  bronze_work: {name:'Bronze alloying', requires:['copper_work']},
  iron_work: {name:'Iron reduction and forging', requires:['ceramics']},
  steel_work: {name:'Steel treatment', requires:['iron_work']},
  mechanics: {name:'Mechanical transmission', requires:['handwork']},
  power: {name:'Water power', requires:['mechanics']}
 };

 const recipes = [];
 function amounts(text) {
  return Object.fromEntries(text.split(',').map(pair => {
   const [id, quantity] = pair.split(':');
   return [id, Number(quantity)];
  }));
 }
 for (const line of `
hammerstone|stone:1|hammerstone:1|hands|handwork|6
stone_hoe|blade:1,wood:1,cord:1|stone_hoe:1|hands|handwork|18
stone_spear|blade:1,wood:1,cord:1|stone_spear:1|hands|handwork|15
snare|cord:2,wood:1|snare:1|hands|handwork|12
fishing_line|cord:1,bone:1|fishing_line:1|hands|handwork|17
basket|fiber:4,cord:1|basket:1|hands|handwork|24
beam|wood:2|beam:1|workbench|handwork|22
stockpile|wood:1|stockpile:1|hands|handwork|8
wood_floor|plank:3,iron_nail:2|wood_floor:1|workbench|iron_work|24
stone_wall|stone:4,mortar:1|stone_wall:1|hands|ceramics|35
wood_door|plank:3,iron_nail:2|wood_door:1|workbench|iron_work|32
thatch_roof|beam:1,fiber:4,cord:2|thatch_roof:1|hands|handwork|32
gravel_road|gravel:4|gravel_road:1|hands|handwork|30
stairs|plank:4,iron_nail:3|stairs:1|workbench|iron_work|40
bridge_deck|beam:2,plank:4,iron_nail:3|bridge_deck:1|workbench|iron_work|60
drying_rack|wood:2,cord:1|drying_rack:1|hands|preservation|20
butcher_block|wood:2|butcher_block:1|workbench|handwork|18
tanning_vat|plank:4,cord:2|tanning_vat:1|workbench|preservation|30
loom|plank:3,cord:2|loom:1|workbench|husbandry|38
clay_bench|wood:2,clay:1|clay_bench:1|hands|ceramics|16
kiln|clay:6,stone:3|kiln:1|hands|ceramics|80
charcoal_pit|stone:3,clay:2|charcoal_pit:1|hands|ceramics|45
smelter|clay:4,brick:4|smelter:1|clay_bench|copper_work|65
bloomery|brick:8,clay:3|bloomery:1|clay_bench|iron_work|90
forge|stone:4,brick:4|forge:1|workbench|iron_work|85
cementation_furnace|brick:12,clay:3|cementation_furnace:1|clay_bench|steel_work|110
quern|granite:2,wood:1|quern:1|workbench|handwork|50
market_stall|plank:4,cord:1|market_stall:1|workbench|handwork|32
apothecary_bench|plank:3,pot:1|apothecary_bench:1|workbench|ceramics|30
research_desk|plank:3,cord:1|research_desk:1|workbench|handwork|30
compost|plant_waste:3,water:1|compost:2|stockpile|husbandry|240
cook_meat|raw_meat:1,wood:1|cooked_meat:1,ash:1|campfire|handwork|25
dry_meat|raw_meat:2,rock_salt:1|dried_meat:2|drying_rack|preservation|180
bean_stew|bean:2,water:2,wood:1|bean_stew:2|campfire|preservation|28|pot
flatbread|flour:2,water:1,wood:1|flatbread:2|campfire|preservation|28
hand_mill|grain:2|flour:1|quern|preservation|18
tan_hide|raw_hide:1,bark:2,water:2|leather:1|tanning_vat|preservation|240
linen|flax:3|linen:1|loom|husbandry|40
form_pot|clay:2,water:1|unfired_pot:1|clay_bench|ceramics|20
fire_pot|unfired_pot:1,wood:2|pot:1,ash:1|kiln|ceramics|90
fire_brick|clay:4,wood:2|brick:4,ash:1|kiln|ceramics|110
burn_lime|limestone:2,charcoal:1|lime:1|kiln|ceramics|110
mix_mortar|lime:1,sand:2,water:1|mortar:3|hands|ceramics|12
make_charcoal|wood:5|charcoal:3|charcoal_pit|ceramics|240
refine_copper|malachite:3,charcoal:2|copper_ingot:1,slag:1|smelter|copper_work|90
refine_tin|cassiterite:3,charcoal:2|tin_ingot:1,slag:1|smelter|bronze_work|90
alloy_bronze|copper_ingot:8,tin_ingot:1,charcoal:2|bronze_ingot:9|smelter|bronze_work|70
reduce_iron|hematite:4,charcoal:5|iron_bloom:1,slag:2|bloomery|iron_work|180
consolidate_bloom|iron_bloom:1,charcoal:1|iron_bar:1,slag:1|forge|iron_work|70
carburize_iron|iron_bar:1,charcoal:3|steel_bar:1|cementation_furnace|steel_work|240
bronze_pick|bronze_ingot:2,wood:1|bronze_pick:1|smelter|bronze_work|45
smith_hammer|iron_bar:1,wood:1,charcoal:1|smith_hammer:1|forge|iron_work|35
tongs|iron_bar:1,charcoal:1|tongs:1|forge|iron_work|32
iron_pick|iron_bar:2,wood:1,charcoal:1|iron_pick:1|forge|iron_work|45|smith_hammer,tongs
iron_nail|iron_bar:1,charcoal:1|iron_nail:8|forge|iron_work|35|smith_hammer
metal_plate|iron_bar:2,charcoal:1|metal_plate:1|forge|iron_work|50|smith_hammer
axle|beam:1|axle:1|workbench|mechanics|25|hatchet
gear|plank:2,axle:1|gear:1|workbench|mechanics|40|blade
bearing|wood:1,leather:1|bearing:1|workbench|mechanics|30
pulley|plank:1,cord:2|pulley:1|workbench|mechanics|30
belt|leather:2,cord:1|belt:1|workbench|mechanics|25
millstone|granite:2|millstone:1|workbench|mechanics|60
waterwheel|beam:3,plank:8,axle:1,bearing:2|waterwheel:1|workbench|power|125
powered_mill|millstone:1,gear:2,bearing:2,beam:2|powered_mill:1|workbench|power|130
mill_with_power|grain:4|flour:3|powered_mill|power|18
handcart|plank:5,axle:1,gear:2,cord:2|handcart:1|workbench|mechanics|90
`.trim().split('\n')) {
  const [id, inputs, outputs, station, tech, minutes, tools = ''] = line.split('|');
  recipes.push({id, inputs: amounts(inputs), outputs: amounts(outputs), station, tech,
   minutes: Number(minutes), tools: tools ? tools.split(',') : [],
   ...(id === 'mill_with_power' ? {power: 'shaft rotation'} : {})});
 }
 const qualities = {
  blade: {cutting:1}, hatchet: {woodcutting:1}, hammerstone: {percussion:1},
  stone_hoe: {tilling:1}, tongs: {hotHandling:1}, smith_hammer: {smithing:1},
  bronze_pick: {excavation:1}, iron_pick: {excavation:2}
 };
 const containers = {
  flask: {accepted:['liquid'], capacity:2, unit:'water units'},
  pot: {accepted:['liquid','meal'], capacity:2, unit:'litres'},
  basket: {accepted:['dry goods'], capacity:12, unit:'litres'},
  crate: {accepted:['dry goods'], capacity:null, unit:'quality-dependent'},
  handcart: {accepted:['bulk cargo'], capacity:80, unit:'litres'}
 };
 const yields = {
  oak:['wood','nuts','bark'], pine:['wood','resin'], birch:['wood','bark'],
  willow:['wood','fiber'], cattail:['fiber'], bramble:['berries'], hazel:['nuts'],
  orchard_apple:['apple'], barley:['grain','plant_waste'], emmer:['grain','plant_waste'],
  bean:['plant_waste'], flax:['plant_waste'], turnip:['plant_waste'],
  hare:['raw_meat','raw_hide','bone'], deer:['raw_meat','raw_hide','bone','sinew'],
  boar:['raw_meat','raw_hide','bone'], duck:['raw_meat','egg'], trout:['raw_fish'],
  perch:['raw_fish'], honeybee:['honey'], goat:['milk','raw_meat','raw_hide'],
  sheep:['wool','milk','raw_meat'], chicken:['egg','raw_meat']
 };
 const substrate = {
  loam:{drainage:'moderate', fertility:'moderate'}, sandy_soil:{drainage:'fast',fertility:'low'},
  clay_soil:{drainage:'slow',fertility:'moderate'}, silt_soil:{drainage:'moderate',fertility:'high'},
  peat:{drainage:'slow',fertility:'low'}, topsoil:{drainage:'moderate',fertility:'high'}
 };
 const seedFor = {barley:'barley_seed',emmer:'emmer_seed',bean:'bean_seed',flax:'flax_seed',turnip:'turnip_seed'};
 const byId = Object.fromEntries(entries.map(entry => [entry.id, entry]));
 const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
   Object.values(value).forEach(freeze);
   Object.freeze(value);
  }
  return value;
 };
 root.ContentCatalog = freeze({version: 1, entries, byId, technologies, recipes, qualities, containers, yields, substrate, seedFor});
})(globalThis);
