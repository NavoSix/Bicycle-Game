import { RNG, hash } from './rng.js';

// Region "types" decide what the trail looks like; region names are real
// central Florida places so the ride reads like a trip across Orange,
// Seminole and Volusia counties.
//
//   street      – residential street (on-road connector), houses facing you
//   suburbTrail – paved trail behind backyard fences, pool cages, crossings
//   town        – trail beside a four-lane road with plazas and parking lots
//   hammock     – live oaks dripping with Spanish moss, cabbage palms
//   flatwoods   – tall slash pines over saw palmetto and sand
//   wetland     – boardwalks over cypress swamp and creek
//   lake        – open lakeshore on one side
//   grove       – rows of citrus trees
//   lakeloop    – a concrete path hugging an urban lake, under an expressway
//                 (Lake Underhill and the 408)
//   corridor    – a greenway down a power-line corridor (Cady Way, Little Econ)
//   railtrail   – an arrow-straight old rail bed with ditches and trestles
//                 (Cross Seminole, Flagler, West Orange)
//   foottrail   – sand singletrack with orange blazes (Florida National Scenic Trail)

export const DEVELOPED = ['street', 'suburbTrail', 'town', 'lakeloop', 'corridor'];
export const NATURAL = ['hammock', 'flatwoods', 'wetland', 'lake', 'grove', 'railtrail', 'foottrail'];

const TOWNS = [
  ['Winter Park', 'Orange County'],
  ['Maitland', 'Orange County'],
  ['Altamonte Springs', 'Seminole County'],
  ['Casselberry', 'Seminole County'],
  ['Winter Springs', 'Seminole County'],
  ['Oviedo', 'Seminole County'],
  ['Longwood', 'Seminole County'],
  ['Lake Mary', 'Seminole County'],
  ['Sanford', 'Seminole County'],
  ['Goldenrod', 'Orange County'],
  ['Fern Park', 'Seminole County'],
  ['Chuluota', 'Seminole County'],
  ['Geneva', 'Seminole County'],
  ['Apopka', 'Orange County'],
  ['Eatonville', 'Orange County'],
  ['Baldwin Park', 'Orlando'],
  ['College Park', 'Orlando'],
  ['Audubon Park', 'Orlando'],
  ['Union Park', 'Orange County'],
  ['Tuskawilla', 'Winter Springs'],
  ['Heathrow', 'Lake Mary'],
  ['DeBary', 'Volusia County'],
  ['Winter Garden', 'Orange County'],
  ['Conway', 'Orlando'],
];

const NEIGHBORHOODS = [
  'Hidden Lake', 'Tuscawilla Oaks', 'Deer Run', 'Sweetwater Oaks', 'Wekiva Hunt Club',
  'Twin Rivers', 'Alafaya Woods', 'Kingsbridge', 'Live Oak Reserve', 'Chapman Groves',
  'Stonehurst', 'Magnolia Plantation', 'Ravenna Park', 'Oak Forest', 'Howell Branch Cove',
  'Sabal Point', 'Lake Kathryn Estates', 'Eagle Watch', 'Wildwood', 'Bear Gully',
];

const NATURE = {
  hammock: [
    'Spring Hammock Preserve', 'Black Hammock', 'Big Tree Park', 'Lake Proctor Wilderness',
    'Geneva Wilderness Area', 'Soldiers Creek Park', 'Wekiwa Springs', 'Sanlando Park',
    'Mead Botanical Garden', 'Kewannee Hammock',
  ],
  flatwoods: [
    'Little Big Econ State Forest', 'Charles H. Bronson State Forest', 'Lower Wekiva River Preserve',
    'Seminole State Forest', 'Econ River Wilderness', 'Hal Scott Preserve', 'Lake Jesup Conservation Area',
    'Chuluota Wilderness',
  ],
  wetland: [
    'Econlockhatchee River', 'Gee Creek', 'Howell Creek', 'Lake Jesup Marsh', 'Soldiers Creek',
    'Little Wekiva River', 'Deep Creek', 'St. Johns River', 'Mill Creek', 'Bear Creek',
    'Gee Creek Wetlands', 'Sweetwater Creek',
  ],
  lake: [
    'Lake Jesup', 'Lake Howell', 'Lake Mills', 'Lake Charm', 'Lake Monroe', 'Lake Harney',
    'Lake Maitland', 'Lake Virginia', 'Lake Baldwin', 'Lake Underhill', 'Lake Lotus',
    'Lake Brantley', 'Lake Kathryn', 'Red Bug Lake', 'Lake Orienta', 'Lake Hodge',
  ],
  lakeloop: [
    'Lake Underhill', 'Lake Baldwin', 'Lake Davis', 'Lake Lawsona', 'Lake Formosa', 'Lake Cherokee',
    'Lake Druid', 'Lake Susannah', 'Lake Barton', 'Lake Como', 'Lake Copeland', 'Lake Rowena',
  ],
  corridor: [
    'Cady Way Trail', 'Baldwin Park', 'Little Econ Greenway', 'Seminole Wekiva Trail', 'Shingle Creek Trail',
    'Orlando Urban Trail', 'Gaston Edwards Trail', 'Cady Way Trail · Winter Park', 'Dinky Line',
  ],
  railtrail: [
    'Cross Seminole Trail', 'Black Hammock', 'Flagler Trail', 'West Orange Trail', 'Old Orange Belt Line',
    'Seminole Wekiva Trail', 'Oviedo Rail Bed', 'Lake Jesup Rail Bed', 'Sanford Spur',
  ],
  foottrail: [
    'Florida National Scenic Trail', 'Florida Trail · Econ River', 'Kolokee Loop', 'Florida Trail · Bronson Forest',
    'Florida Trail · Tosohatchee', 'Florida Trail · Seminole Ranch', 'Florida Trail · Wekiva', 'Florida Trail · Chuluota',
  ],
  grove: [
    'Slavia Groves', 'Geneva Groves', 'Chuluota Groves', 'Black Hammock Groves',
    'Old Celery Fields', 'Plymouth Groves', 'Lukas Grove', 'Snow Hill Groves',
  ],
};

const SUBTITLE = {
  hammock: 'Oak hammock',
  flatwoods: 'Pine flatwoods',
  wetland: 'Boardwalk',
  lake: 'Lakeshore',
  grove: 'Citrus grove',
  lakeloop: 'Lake loop · under the 408',
  corridor: 'Greenway',
  railtrail: 'Old rail bed',
  foottrail: 'Orange blazes',
};

const LENGTH = {
  street: [500, 1000],
  suburbTrail: [1200, 2600],
  town: [900, 1800],
  hammock: [1200, 2600],
  flatwoods: [1500, 3000],
  wetland: [700, 1500],
  lake: [900, 2000],
  grove: [800, 1600],
  lakeloop: [1200, 2200],
  corridor: [1400, 3000],
  railtrail: [1600, 3400],
  foottrail: [800, 1700],
};

export class RegionPlan {
  constructor(seed) {
    this.rng = new RNG(hash(seed, 1234));
    this.list = [];
    this.recent = [];
    this.cache = 0;
    // The ride always begins at home on an Orlando cul-de-sac and joins the
    // trail at a trailhead a few blocks away.
    this.push({ name: 'Orlando', sub: 'Home', type: 'street', len: 640, sign: null });
    this.push({ name: 'Cross Seminole Trail', sub: 'Trailhead', type: 'suburbTrail', len: 1400, sign: 'trailhead' });
  }

  push(r) {
    const start = this.list.length ? this.list[this.list.length - 1].end : 0;
    r.index = this.list.length;
    if (!r.surf) {
      // pavement varies: fresh asphalt with a centre line, older unstriped asphalt, concrete
      const k = this.rng.next();
      r.surf = { street: 'road', lakeloop: 'concrete', railtrail: 'trailw', foottrail: 'dirt', corridor: 'trail' }[r.type]
        || (r.type === 'town' ? (k < 0.5 ? 'concrete' : 'trail') : k < 0.3 ? 'trailw' : 'trail');
    }
    r.start = start;
    r.end = start + r.len;
    this.list.push(r);
    this.recent.push(r.name);
    if (this.recent.length > 10) this.recent.shift();
  }

  generate() {
    const rng = this.rng;
    const prev = this.list[this.list.length - 1];
    const wasDeveloped = DEVELOPED.includes(prev.type);
    let type;
    for (let tries = 0; tries < 10; tries++) {
      const pool = rng.chance(wasDeveloped ? 0.75 : 0.35) ? (wasDeveloped ? NATURAL : DEVELOPED) : wasDeveloped ? DEVELOPED : NATURAL;
      type = pool === DEVELOPED ? rng.pick(['suburbTrail', 'suburbTrail', 'town', 'street', 'lakeloop', 'corridor', 'corridor']) : rng.pick(NATURAL);
      if (type !== prev.type) break;
    }
    const len = rng.range(...LENGTH[type]);
    let name, sub, sign;
    if (DEVELOPED.includes(type) && NATURE[type] === undefined) {
      let t;
      for (let i = 0; i < 12; i++) {
        t = rng.pick(TOWNS);
        if (!this.recent.includes(t[0])) break;
      }
      if (type === 'street') {
        name = rng.pick(NEIGHBORHOODS);
        sub = t[0];
        sign = 'neighborhood';
      } else {
        name = t[0];
        sub = t[1];
        sign = 'city';
      }
    } else {
      for (let i = 0; i < 12; i++) {
        name = rng.pick(NATURE[type]);
        if (!this.recent.includes(name)) break;
      }
      sub = SUBTITLE[type];
      sign = 'park';
    }
    this.push({ name, sub, type, len, sign });
  }

  at(d) {
    while (this.list[this.list.length - 1].end <= d) this.generate();
    let i = Math.min(this.cache, this.list.length - 1);
    while (i > 0 && this.list[i].start > d) i--;
    while (this.list[i].end <= d) i++;
    this.cache = i;
    return this.list[i];
  }
}
