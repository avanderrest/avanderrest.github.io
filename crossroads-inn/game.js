(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const W = 8;
  const H = 8;
  const SAVE_KEY = 'crossroads-keep-v1';
  const CASTLE_HP = 20;
  const START_GOLD = 80;
  const SUBSTEP = 0.05;      // simulation step in seconds
  const BATTER = 3;          // building damage per second per point of monster strength
  const LOG_MAX = 40;

  function idx(x, y) { return y * W + x; }
  const CASTLE = idx(W - 1, H - 1);
  const GATES = [idx(0, 0), idx(W - 1, 0), idx(0, H - 1)];
  const GATE_NAMES = { [idx(0, 0)]: 'the old road', [idx(W - 1, 0)]: 'the north road', [idx(0, H - 1)]: 'the west road' };

  // ---------------------------------------------------------------------------
  // Tile art. Emoji dragged the board towards the modern high street — the market
  // read as a corner shop — so every building is drawn instead: thatch, timber,
  // stone and steel in one palette. Inline SVG, no ids, sized in em by the CSS.
  // ---------------------------------------------------------------------------
  const ART = {
    wall: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#c3bcae"><rect x="1" y="8" width="22" height="12" rx="1"/>
      <rect x="1" y="5" width="4" height="4"/><rect x="7" y="5" width="4" height="4"/>
      <rect x="13" y="5" width="4" height="4"/><rect x="19" y="5" width="4" height="4"/></g>
      <g fill="#8b8376"><rect x="1" y="11.6" width="22" height="1"/><rect x="1" y="15.6" width="22" height="1"/>
      <rect x="8" y="8" width="1" height="3.6"/><rect x="16" y="8" width="1" height="3.6"/>
      <rect x="4.5" y="12.6" width="1" height="3"/><rect x="12" y="12.6" width="1" height="3"/><rect x="19" y="12.6" width="1" height="3"/>
      <rect x="8" y="16.6" width="1" height="3.4"/><rect x="16" y="16.6" width="1" height="3.4"/></g></svg>`,

    tower: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#c3bcae"><rect x="5" y="3" width="3.4" height="4"/><rect x="10.3" y="3" width="3.4" height="4"/><rect x="15.6" y="3" width="3.4" height="4"/>
      <rect x="4" y="6.4" width="16" height="2.6" rx="0.8"/><path d="M6.2 9h11.6l1.1 12H5.1z"/></g>
      <g fill="#4a3f34"><rect x="11.2" y="11" width="1.6" height="4.4"/><rect x="9.8" y="12" width="4.4" height="1.5"/></g>
      <path d="M9.4 21v-3.1a2.6 2.6 0 0 1 5.2 0V21z" fill="#6d4a2c"/>
      <g fill="#8b8376"><rect x="5.6" y="13.6" width="12.8" height="0.9"/><rect x="5.3" y="17.2" width="13.4" height="0.9"/></g></svg>`,

    barracks: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="#dfe6ee" stroke-width="2.1" stroke-linecap="round"><path d="M4.8 19.6 19 4.4"/><path d="M19.2 19.6 5 4.4"/></g>
      <g stroke="#8a939f" stroke-width="1.8" stroke-linecap="round"><path d="M6.2 16.2 9.6 19.4"/><path d="M17.8 16.2 14.4 19.4"/></g>
      <g fill="#8a939f"><circle cx="4.6" cy="20" r="1.5"/><circle cx="19.4" cy="20" r="1.5"/></g>
      <path d="M12 5.4 18.4 7.4v4.9c0 3.2-3 5.3-6.4 6.5-3.4-1.2-6.4-3.3-6.4-6.5V7.4z" fill="#7fa6d8" stroke="#3f5a80" stroke-width="1.1"/>
      <path d="M12 8.4 16.4 9.8v1.9L12 10.3l-4.4 1.4V9.8z" fill="#f0b35a"/>
      <path d="M12 12.4 16.4 13.8v1.9L12 14.3l-4.4 1.4v-1.9z" fill="#f0b35a"/></svg>`,

    smithy: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#e8823a"><circle cx="18" cy="6.4" r="1.2"/><circle cx="21" cy="4.2" r=".85"/><circle cx="15.4" cy="4.8" r=".7"/></g>
      <g fill="#98a1ad"><path d="M3 8.8h13l5.4 1.7-5.4 2.2H3z"/>
      <rect x="7.6" y="12.7" width="4.8" height="3.4"/>
      <rect x="4.4" y="16.1" width="11.2" height="2.9" rx="0.8"/></g>
      <rect x="5.2" y="19" width="9.6" height="2.6" rx="0.5" fill="#6d4a2c"/></svg>`,

    tavern: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16.4 10.4h2.2a3.1 3.1 0 0 1 0 6.2h-2.2" fill="none" stroke="#c98a4b" stroke-width="2.2"/>
      <path d="M5 8h11.4v11a2.2 2.2 0 0 1-2.2 2.2H7.2A2.2 2.2 0 0 1 5 19z" fill="#c98a4b"/>
      <g fill="#7d8792"><rect x="5" y="11.2" width="11.4" height="1.5"/><rect x="5" y="16.4" width="11.4" height="1.5"/></g>
      <path d="M4.4 8.2c-.2-1.7 1.1-2.9 2.5-2.5.3-1.5 2.1-2.1 3.1-1 .9-1.4 3-1.1 3.5.5 1.5-.2 2.7 1 2.5 3z" fill="#f4ecd8"/></svg>`,

    farm: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="#9c7c33" stroke-width="1.3" stroke-linecap="round" fill="none">
      <path d="M6 18.5V8.6"/><path d="M12 19V6.6"/><path d="M18 18.5V8.6"/></g>
      <g fill="#e6bb5b"><ellipse cx="6" cy="8" rx="1" ry="1.7"/><ellipse cx="4.5" cy="10.4" rx=".9" ry="1.5" transform="rotate(-28 4.5 10.4)"/><ellipse cx="7.5" cy="10.4" rx=".9" ry="1.5" transform="rotate(28 7.5 10.4)"/>
      <ellipse cx="12" cy="6" rx="1.1" ry="1.9"/><ellipse cx="10.3" cy="8.6" rx="1" ry="1.7" transform="rotate(-28 10.3 8.6)"/><ellipse cx="13.7" cy="8.6" rx="1" ry="1.7" transform="rotate(28 13.7 8.6)"/>
      <ellipse cx="10.4" cy="11.8" rx="1" ry="1.6" transform="rotate(-28 10.4 11.8)"/><ellipse cx="13.6" cy="11.8" rx="1" ry="1.6" transform="rotate(28 13.6 11.8)"/>
      <ellipse cx="18" cy="8" rx="1" ry="1.7"/><ellipse cx="16.5" cy="10.4" rx=".9" ry="1.5" transform="rotate(-28 16.5 10.4)"/><ellipse cx="19.5" cy="10.4" rx=".9" ry="1.5" transform="rotate(28 19.5 10.4)"/></g>
      <rect x="1.5" y="17.6" width="21" height="4.2" fill="#6d4a2c"/>
      <g stroke="#4e341f" stroke-width="0.9"><path d="M1.5 19.4h21"/><path d="M1.5 21h21"/></g></svg>`,

    house: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4.2" y="12.2" width="15.6" height="8.6" fill="#e6d9bd"/>
      <path d="M12 2.2 23.2 11.5c.5.5.2 1.4-.6 1.4H1.4c-.8 0-1.1-.9-.6-1.4z" fill="#d3a94e"/>
      <g stroke="#a97f31" stroke-width="1" fill="none"><path d="M12 4.6 6.2 11.6"/><path d="M12 4.6 17.8 11.6"/></g>
      <g fill="#6d4a2c"><rect x="4.2" y="12.9" width="15.6" height="1.2"/><rect x="4.2" y="19.6" width="15.6" height="1.2"/>
      <rect x="8.8" y="13.8" width="1.2" height="6"/><rect x="14" y="13.8" width="1.2" height="6"/></g>
      <path d="M10 20.8v-2.9a2 2 0 0 1 4 0v2.9z" fill="#7a5433"/>
      <rect x="5.6" y="15" width="2.6" height="2.6" fill="#f0b35a"/>
      <rect x="15.8" y="15" width="2.6" height="2.6" fill="#f0b35a"/></svg>`,

    market: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#7a5433"><rect x="2.6" y="8" width="1.7" height="13"/><rect x="19.7" y="8" width="1.7" height="13"/></g>
      <polygon fill="#ece0c6" points="2,3.4 22,3.4 22,9 20.75,11.4 19.5,9 18.25,11.4 17,9 15.75,11.4 14.5,9 13.25,11.4 12,9 10.75,11.4 9.5,9 8.25,11.4 7,9 5.75,11.4 4.5,9 3.25,11.4 2,9"/>
      <g fill="#b5453c"><polygon points="4.5,3.4 7,3.4 7,9 5.75,11.4 4.5,9"/><polygon points="9.5,3.4 12,3.4 12,9 10.75,11.4 9.5,9"/>
      <polygon points="14.5,3.4 17,3.4 17,9 15.75,11.4 14.5,9"/><polygon points="19.5,3.4 22,3.4 22,9 20.75,11.4 19.5,9"/></g>
      <g fill="#c0432f"><circle cx="7.8" cy="14.4" r="1.5"/><circle cx="10.9" cy="14.4" r="1.5"/></g>
      <path d="M14 12.8h3.8l-.6 3.2h-2.6z" fill="#d3a94e"/>
      <rect x="3.6" y="16" width="16.8" height="1.8" rx="0.5" fill="#8a5f38"/>
      <g fill="#6d4a2c"><rect x="5" y="17.8" width="1.4" height="3.2"/><rect x="17.6" y="17.8" width="1.4" height="3.2"/></g></svg>`,

    well: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.4 21.6 7.4H2.4z" fill="#8a5f38"/>
      <path d="M12 3.6 18 7.4H6z" fill="#a06d40"/>
      <g fill="#6d4a2c"><rect x="4.6" y="7.4" width="1.8" height="9"/><rect x="17.6" y="7.4" width="1.8" height="9"/>
      <rect x="5.4" y="9.2" width="13.2" height="1.6" rx="0.8"/></g>
      <rect x="11.6" y="10.8" width="0.9" height="3" fill="#e6d9bd"/>
      <path d="M9.9 13.4h4.2l-.6 3.2h-3z" fill="#8a5f38"/>
      <path d="M3.6 15.8h16.8v4.6a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2z" fill="#c3bcae"/>
      <g fill="#8b8376"><rect x="3.6" y="18.1" width="16.8" height="0.9"/><rect x="8" y="15.8" width="0.9" height="2.3"/><rect x="15.1" y="15.8" width="0.9" height="2.3"/>
      <rect x="11.6" y="19" width="0.9" height="2.6"/></g></svg>`,

    castle: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="11.4" y="0.6" width="1" height="5" fill="#6e6659"/>
      <path d="M12.4 1h5.2l-1.7 1.7 1.7 1.7h-5.2z" fill="#f0b35a"/>
      <g fill="#c3bcae">
      <rect x="0.8" y="8" width="6.4" height="13"/><rect x="16.8" y="8" width="6.4" height="13"/><rect x="6.6" y="11" width="10.8" height="10"/>
      <rect x="0.8" y="5.6" width="1.9" height="2.8"/><rect x="3.05" y="5.6" width="1.9" height="2.8"/><rect x="5.3" y="5.6" width="1.9" height="2.8"/>
      <rect x="16.8" y="5.6" width="1.9" height="2.8"/><rect x="19.05" y="5.6" width="1.9" height="2.8"/><rect x="21.3" y="5.6" width="1.9" height="2.8"/>
      <rect x="6.6" y="8.8" width="1.9" height="2.6"/><rect x="11.05" y="8.8" width="1.9" height="2.6"/><rect x="15.5" y="8.8" width="1.9" height="2.6"/></g>
      <g fill="#4a3f34"><rect x="3.5" y="10.6" width="1.1" height="3.4"/><rect x="19.4" y="10.6" width="1.1" height="3.4"/></g>
      <path d="M9.4 21v-4a2.6 2.6 0 0 1 5.2 0v4z" fill="#4a3a2a"/>
      <g stroke="#8b8376" stroke-width="0.8"><path d="M9.4 18.4h5.2"/><path d="M12 15v6"/></g></svg>`,

    gate: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="10.6" y="2.6" width="2.6" height="18.6" rx="0.6" fill="#6d4a2c"/>
      <path d="M13.2 4.4h7.2l2.4 2.3-2.4 2.3h-7.2z" fill="#a06d40"/>
      <path d="M10.6 10.6H3.6L1.2 12.9l2.4 2.3h7z" fill="#8a5f38"/>
      <g fill="#6f8f3a"><ellipse cx="6.4" cy="20.6" rx="3.2" ry="1.5"/><ellipse cx="17.6" cy="21" rx="3.6" ry="1.6"/></g></svg>`,

    ballista: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="#8a5f38"><path d="M11 12.6h2v8.4h-2z"/><path d="M6.2 21h11.6l-1 1.4H7.2z"/>
      <path d="M7.4 14.6h9.2l-1.1 2.4H8.5z"/></g>
      <g fill="none" stroke="#6d4a2c" stroke-width="1.8" stroke-linecap="round"><path d="M3.4 4.2c4 3.2 13.2 3.2 17.2 0"/></g>
      <g stroke="#c3bcae" stroke-width="1" stroke-linecap="round"><path d="M3.4 4.2 12 9.4"/><path d="M20.6 4.2 12 9.4"/></g>
      <g fill="#98a1ad"><path d="M12 2.2 13.3 6 12 12.4 10.7 6z"/></g>
      <g fill="#4a3f34"><rect x="2.6" y="3" width="1.6" height="2.6" rx="0.5"/><rect x="19.8" y="3" width="1.6" height="2.6" rx="0.5"/></g></svg>`,

    mage: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.6 21 9.8 9.8h4.4L15.4 21z" fill="#7d6ea8"/>
      <path d="M12 1.8 15.8 9.8H8.2z" fill="#5c4e82"/>
      <g fill="#c9bde8"><rect x="9.8" y="12.6" width="4.4" height="0.9"/><rect x="9.4" y="16.4" width="5.2" height="0.9"/></g>
      <path d="M12 12.4 13 15l2.6 1-2.6 1L12 19.6 11 17l-2.6-1L11 15z" fill="#f0e6a8"/>
      <g fill="#f0e6a8"><circle cx="12" cy="4.2" r="1.2"/><circle cx="5.4" cy="7.4" r=".8"/><circle cx="18.6" cy="7.4" r=".8"/></g>
      <rect x="6.6" y="21" width="10.8" height="1.6" rx="0.5" fill="#4a3f34"/></svg>`,

    chapel: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="11.4" y="0.6" width="1.2" height="4.4" fill="#e6d9bd"/>
      <rect x="9.8" y="2" width="4.4" height="1.2" fill="#e6d9bd"/>
      <path d="M12 4.8 19.4 11H4.6z" fill="#b5453c"/>
      <rect x="5.4" y="11" width="13.2" height="10" fill="#e6d9bd"/>
      <path d="M12 12.6a2.6 2.6 0 0 1 2.6 2.6V19h-5.2v-3.8A2.6 2.6 0 0 1 12 12.6z" fill="#7fa6d8"/>
      <g fill="#6d4a2c"><rect x="5.4" y="19.4" width="13.2" height="1.6"/><rect x="7" y="14" width="1.6" height="3.4" rx="0.6"/>
      <rect x="15.4" y="14" width="1.6" height="3.4" rx="0.6"/></g>
      <g fill="#8b8376"><rect x="4.2" y="21" width="15.6" height="1.4" rx="0.4"/></g></svg>`,

    demolish: `<svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform="rotate(-38 12 11)"><rect x="11" y="4" width="2.1" height="13" rx="1" fill="#8a5f38"/>
      <rect x="6.4" y="2.2" width="11.2" height="5" rx="1" fill="#8f98a4"/>
      <rect x="6.4" y="2.2" width="2.6" height="5" rx="1" fill="#6f7883"/></g>
      <g fill="#9d9587"><rect x="2.4" y="18.6" width="6" height="3.2" rx="0.8"/><rect x="9.6" y="19.8" width="4.6" height="2" rx="0.6"/>
      <rect x="15.4" y="18.8" width="3.4" height="3" rx="0.7"/></g></svg>`,
  };

  // Buildable tiles. `kind` decides behaviour: wall (obstacle), defence (shoots),
  // barracks (trains knights), village (earns gold), buff (only boosts neighbours).
  const BUILD = {
    wall:     { name: 'Wall',         icon: ART.wall, cost: 8,  hp: 120, kind: 'wall',
                desc: 'Cheap and stout. The horde walks around it, or batters it down if you seal every road. Wraiths float over.' },
    tower:    { name: 'Archer Tower', icon: ART.tower, cost: 40, hp: 40,  kind: 'defence', range: 2.6, dmg: 5, rate: 0.6,
                desc: 'Shoots whatever is nearest the keep within 2½ tiles, in the air or on the ground. Towers spot for each other: each one beside another sees ⅖ of a tile further, and a ballista beside one sees further still.' },
    barracks: { name: 'Barracks',     icon: ART.barracks, cost: 50, hp: 60,  kind: 'barracks',
                desc: 'Trains 2 knights who march out to meet anything within 2½ tiles and hold it there while they fight. Click a built barracks with this tool to upgrade it (3, then 4 knights).' },
    smithy:   { name: 'Smithy',       icon: ART.smithy, cost: 45, hp: 40,  kind: 'buff',
                desc: 'Sharpens the blades: each tower, barracks or keep beside it deals +50% damage, a ballista +40%. A well beside the smithy is a quenching trough — it works 20% faster.' },
    tavern:   { name: 'Tavern',       icon: ART.tavern, cost: 35, hp: 40,  kind: 'village', gold: 1,
                desc: 'Ale and song. Knights from a barracks beside it fight 30% faster; houses beside it pay +2g and markets +2g. It drinks well water and buys the farm’s barley, so it earns more with either beside it.' },
    farm:     { name: 'Farm',         icon: ART.farm, cost: 20, hp: 40,  kind: 'village', gold: 5,
                desc: 'Earns 5g a wave. Each well beside it adds +3g, each market +2g. It pays back what it is given: a market beside a farm earns +2g and a tavern +1g.' },
    house:    { name: 'House',        icon: ART.house, cost: 25, hp: 40,  kind: 'village', gold: 3,
                desc: 'Earns 3g a wave. A market, tavern, chapel or well beside it adds more, and the people in it shop: a market beside a house earns +1g.' },
    market:   { name: 'Market',       icon: ART.market, cost: 40, hp: 40,  kind: 'village', gold: 2,
                desc: 'Earns 2g, and every farm, house or tavern beside it earns more. It only earns anything itself if there is a farm, a house or a tavern beside it to trade with.' },
    well:     { name: 'Well',         icon: ART.well, cost: 20, hp: 40,  kind: 'buff',
                desc: 'Farms beside it earn +3g, houses +1g, taverns +2g, and a smithy beside it works 20% faster. Earns nothing itself.' },
    ballista: { name: 'Ballista',     icon: ART.ballista, cost: 70, hp: 40, kind: 'defence', range: 4.6, dmg: 30, rate: 2.2, noAir: true,
                desc: 'Sees half the board and hits like a falling tree, once every couple of seconds. Cannot be brought to bear on anything in the air.' },
    mage:     { name: 'Mage Tower',   icon: ART.mage, cost: 60, hp: 40, kind: 'defence', range: 3.0, dmg: 3, rate: 1.2, slow: 0.45,
                desc: 'Little damage, but whatever it touches wades for three seconds afterwards. Works on wraiths and dragons.' },
    chapel:   { name: 'Chapel',       icon: ART.chapel, cost: 45, hp: 40, kind: 'buff',
                desc: 'Knights from a barracks beside it fight for something: +25% damage, and back on their feet in half the time. Houses beside it pay +2g.' },
    demolish: { name: 'Demolish',     icon: ART.demolish, cost: 0,
                desc: 'Clear a tile. Refunds half the build cost.' },
  };
  const FIXED = {
    castle: { name: 'The Keep', icon: ART.castle, kind: 'defence', range: 2.5, dmg: 4, rate: 0.8 },
    gate:   { name: 'Road',     icon: ART.gate },
  };
  const info = t => BUILD[t] || FIXED[t];

  // Adjacency buffs: a tile of type `from` boosts every neighbouring tile whose
  // type is in `to`. Buffs stack per neighbour.
  const BUFFS = [
    // the village pays the village
    { from: 'well',     to: ['farm'],                          gold: 3 },
    { from: 'well',     to: ['house'],                         gold: 1 },
    { from: 'well',     to: ['tavern'],                        gold: 2 },
    { from: 'market',   to: ['farm', 'house'],                 gold: 2 },
    { from: 'market',   to: ['tavern'],                        gold: 3 },
    { from: 'tavern',   to: ['house'],                         gold: 2 },
    { from: 'tavern',   to: ['market'],                        gold: 2 },
    { from: 'farm',     to: ['market'],                        gold: 2 },
    { from: 'farm',     to: ['tavern'],                        gold: 1 },
    { from: 'house',    to: ['market'],                        gold: 1 },
    { from: 'chapel',   to: ['house'],                         gold: 2 },
    // the smithy sharpens, the well quenches
    { from: 'smithy',   to: ['tower', 'barracks', 'castle'],   power: 0.5 },
    { from: 'smithy',   to: ['ballista'],                      power: 0.4 },
    { from: 'well',     to: ['smithy'],                        haste: 0.2 },
    // and the chapel is what the knights are for
    { from: 'chapel',   to: ['barracks'],                      power: 0.25, revive: 0.5 },
    { from: 'chapel',   to: ['castle'],                        power: 0.25 },
    { from: 'tavern',   to: ['barracks'],                      haste: 0.3 },
    // towers spot for each other, and the mage tower speeds the loosing
    { from: 'tower',    to: ['tower'],                         range: 0.4 },
    { from: 'tower',    to: ['ballista'],                      range: 0.6 },
    { from: 'mage',     to: ['tower', 'ballista'],             haste: 0.25 },
    { from: 'mage',     to: ['castle'],                        haste: 0.2 },
  ];

  // Knights: trained by a barracks, march to anything within `rally` tiles of
  // home, hold it in place while they fight, retreat when hurt, respawn when killed.
  const KNIGHT = { hp: 45, hpPerLevel: 15, dmg: 6, dmgPerLevel: 2, rate: 0.7, speed: 1.7, rally: 2.5, leash: 3.3,
                   respawn: 7, heal: 6, retreatAt: 0.2, engage: 0.42, maxPer: 3 };
  const SQUAD = [0, 2, 3, 4];          // knights per barracks level
  const UPGRADE_COST = [0, 40, 60];    // cost to reach level 2, level 3
  const MAX_LEVEL = 3;
  const SLOTS = [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.22], [0.24, 0.22]];

  const ENEMIES = {
    goblin:   { name: 'Goblin',    icon: '👺', hp: 14,  speed: 1.9,  dmg: 1,  bounty: 3,  pack: 3, note: 'fast and weak, comes in packs of 3' },
    orc:      { name: 'Orc',       icon: '🧌', hp: 48,  speed: 0.85, dmg: 2,  bounty: 6,  note: 'slow and tough' },
    skeleton: { name: 'Skeleton',  icon: '💀', hp: 30,  speed: 1.0,  dmg: 1,  bounty: 5,  reassemble: true, note: 'gets back up once when cut down' },
    troll:    { name: 'Troll',     icon: '👹', hp: 120, speed: 0.6,  dmg: 3,  bounty: 14, regen: 2, batter: 3, note: 'regenerates, batters walls hard' },
    wraith:   { name: 'Wraith',    icon: '👻', hp: 40,  speed: 1.3,  dmg: 2,  bounty: 12, flying: true, note: 'floats over walls; only arrows touch it' },
    ogre:     { name: 'Ogre Lord', icon: '👿', hp: 200, speed: 0.55, dmg: 6,  bounty: 60, batter: 3, boss: true, note: 'the boss: huge, slow, smashes walls' },
    dragon:   { name: 'Dragon',    icon: '🐉', hp: 160, speed: 0.5,  dmg: 8, bounty: 70, flying: true, boss: true, note: 'the boss: flies over everything; only arrows touch it' },
    wolf:     { name: 'Wolf',      icon: '🐺', hp: 18,  speed: 2.4,  dmg: 1,  bounty: 4,  pack: 5, note: 'very fast, comes in fives, does not stop for walls it can run round' },
    sapper:   { name: 'Sapper',    icon: '⛏️', hp: 55,  speed: 1.1,  dmg: 2,  bounty: 16, batter: 8, sapper: true, note: 'ignores the long way round: walks at your walls and takes them apart' },
    shaman:   { name: 'Shaman',    icon: '🧙', hp: 45,  speed: 1.0,  dmg: 1,  bounty: 20, healAura: 7, note: 'heals everything within two tiles of it; kill it first' },
    siege:    { name: 'Siege Ram', icon: '🛞', hp: 150, speed: 0.45, dmg: 3,  bounty: 34, batter: 2, reach: 3.2, note: 'stands off and pounds your buildings from further than a tower can shoot' },
  };

  const VILLAGERS = ['Old Tam', 'Wren the Tinker', 'Brother Aldous', 'Pip Hollowell', 'Marta Cobb', 'Dunstan the Drover',
    'Nell Ashby', 'Sister Ysolde', 'Barnaby Quill', 'Hob Thatcher', 'Ida Fernsby', 'Corin the Piper', 'Gudrun Pell',
    'Tobin Marsh', 'Lark Dunmore', 'Edda Greenhollow'];
  const TRADES = ['farmer', 'miller', 'cooper', 'ostler', 'brewer', 'shepherd', 'weaver', 'reeve', 'smith\'s boy', 'goose girl'];

  const LINES = {
    flawless: ['Not one of them reached the gate. The tavern sang till dawn.',
               'We watched from the walls with our arms folded.',
               'Arrows in the morning mist, and then quiet.',
               'The children counted the goblins from the well. Nobody counted ours.'],
    held:     ['They got close enough to smell the bread.',
               'A few reached the gate. The gate held.',
               'We put out the fires and counted heads. All present.'],
    costly:   ['They tore down the {lost}. We will build it back.',
               'Lost the {lost} to the trolls. Rebuilt it by noon, mostly.',
               'The {lost} is kindling. The keep still stands.'],
    bloody:   ['The keep shook. We are still here.',
               'Half the village hid in the cellar. The other half threw stones.',
               'There is blood on the keep\'s door. Not all of it ours.'],
    knights:  ['The knights held the road until the arrows finished it.',
               'Sir Somebody went down twice and got up twice. The barracks cook is furious.'],
    boss:     ['The {boss} fell within sight of the walls.',
               'They say the {boss}\'s roar cracked the chapel bell.'],
  };

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let state = null;     // persistent: grid, hp, lvl, gold, wave, castle hp, chronicle
  let sim = null;       // live wave: enemies, shots, spawn queue
  let flow = null;      // path flow field towards the keep (respects buildings)
  let flowAir = null;   // flow field for fliers (ignores buildings)
  let flowSap = null;   // flow field for sappers (walls are a small detour, not a wall)
  let knights = [];     // knight squads, kept between waves
  let tool = 'wall';
  let speed = 1;

  function freshState() {
    const grid = new Array(W * H).fill(null);
    const hp = new Array(W * H).fill(0);
    const lvl = new Array(W * H).fill(0);
    grid[CASTLE] = 'castle';
    for (const g of GATES) grid[g] = 'gate';
    const put = (x, y, t) => { grid[idx(x, y)] = t; hp[idx(x, y)] = BUILD[t].hp; if (t === 'barracks') lvl[idx(x, y)] = 1; };
    put(5, 5, 'tower');
    put(4, 7, 'farm');
    return { wave: 1, gold: START_GOLD, grid, hp, lvl, castleHp: CASTLE_HP, log: [], best: 0, fallen: false };
  }

  function neighbours(i) {
    const x = i % W;
    const y = Math.floor(i / W);
    const out = [];
    if (x > 0) out.push(i - 1);
    if (x < W - 1) out.push(i + 1);
    if (y > 0) out.push(i - W);
    if (y < H - 1) out.push(i + W);
    return out;
  }
  const coords = i => [i % W, Math.floor(i / W)];
  const isFixed = t => t === 'castle' || t === 'gate';
  const isBuilding = t => !!t && !isFixed(t);
  const dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  const rand = a => a[Math.floor(Math.random() * a.length)];

  // Stats of the tile at i (or of `type` placed at i) after adjacency buffs.
  function tileStats(s, i, type) {
    const t = type || s.grid[i];
    if (!t) return null;
    const b = info(t);
    const lvl = t === 'barracks' ? Math.max(1, s.lvl[i] || 1) : 0;
    const st = { type: t, gold: b.gold || 0, dmg: b.dmg || 0, rate: b.rate || 0, range: b.range || 0, slow: b.slow || 0, noAir: !!b.noAir, power: 0, haste: 0, revive: 0, got: [], lvl };
    if (t === 'barracks') {
      st.dmg = KNIGHT.dmg + (lvl - 1) * KNIGHT.dmgPerLevel;
      st.rate = KNIGHT.rate;
      st.range = KNIGHT.rally;
      st.hp = KNIGHT.hp + (lvl - 1) * KNIGHT.hpPerLevel;
      st.squad = SQUAD[lvl];
    }
    for (const j of neighbours(i)) {
      const g = s.grid[j];
      if (!g) continue;
      for (const bf of BUFFS) {
        if (bf.from !== g || !bf.to.includes(t)) continue;
        if (bf.gold) { st.gold += bf.gold; st.got.push(`+${bf.gold}g from ${info(g).name.toLowerCase()}`); }
        if (bf.power) { st.power += bf.power; st.got.push(`+${Math.round(bf.power * 100)}% damage from ${info(g).name.toLowerCase()}`); }
        if (bf.haste) { st.haste += bf.haste; st.got.push(`+${Math.round(bf.haste * 100)}% speed from ${info(g).name.toLowerCase()}`); }
        if (bf.range) { st.range += bf.range; st.got.push(`+${bf.range} tiles of range from ${info(g).name.toLowerCase()}`); }
        if (bf.revive) { st.revive += bf.revive; st.got.push(`fallen knights back in half the time, from ${info(g).name.toLowerCase()}`); }
      }
    }
    st.dmg = st.dmg * (1 + st.power);
    st.rate = st.rate / (1 + st.haste);
    return st;
  }

  // Which neighbours a tile of `type` at i would boost.
  function givesTo(s, i, type) {
    const names = [];
    for (const j of neighbours(i)) {
      const g = s.grid[j];
      if (g && BUFFS.some(bf => bf.from === type && bf.to.includes(g))) names.push(info(g).name.toLowerCase());
    }
    return names;
  }

  function income(s) {
    let total = 0;
    const from = {};
    for (let i = 0; i < W * H; i++) {
      const st = tileStats(s, i);
      if (st && st.gold) { total += st.gold; from[st.type] = (from[st.type] || 0) + st.gold; }
    }
    return { total, from };
  }

  // ---------------------------------------------------------------------------
  // Pathing: a Dijkstra flow field towards the keep. Empty tiles cost 1, a
  // building costs 1 + hp/2 (a wall is dearer than any detour on this board),
  // so the horde walks around unless every road is sealed, then batters through.
  // Fliers use a second field where everything costs 1.
  // ---------------------------------------------------------------------------
  function cellCost(s, i) {
    const t = s.grid[i];
    if (!isBuilding(t)) return 1;
    return 1 + Math.ceil(Math.max(0, s.hp[i]) / 2);
  }

  function computeFlow(s, costFn) {
    const dist = new Array(W * H).fill(Infinity);
    const next = new Array(W * H).fill(-1);
    const done = new Array(W * H).fill(false);
    dist[CASTLE] = 0;
    const open = [CASTLE];
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (dist[open[k]] < dist[open[bi]]) bi = k;
      const u = open.splice(bi, 1)[0];
      if (done[u]) continue;
      done[u] = true;
      const stepCost = costFn(s, u);
      for (const n of neighbours(u)) {
        const cand = dist[u] + stepCost;
        if (cand < dist[n]) { dist[n] = cand; next[n] = u; if (!done[n]) open.push(n); }
      }
    }
    return { dist, next };
  }

  // The nearest tile of yours within r of a point, or -1. Used by anything that shoots back.
  function nearestBuilding(s, x, y, r) {
    let best = -1, bd = r;
    for (let i = 0; i < W * H; i++) {
      if (!isBuilding(s.grid[i])) continue;   // the keep is not a target: it still has to walk there
      const [bx, by] = coords(i);
      const d = Math.hypot(bx - x, by - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function pathCells() {
    const on = new Set();
    for (const g of GATES) {
      let c = g;
      let guard = 0;
      while (c >= 0 && c !== CASTLE && guard++ < W * H) { on.add(c); c = flow.next[c]; }
    }
    return on;
  }

  function reflow() {
    flow = computeFlow(state, cellCost);
    // A sapper does not detour. Walls cost it a little more than open ground and nothing like
    // the full hp penalty, so it walks at the shortest line and takes apart whatever is on it.
    flowSap = computeFlow(state, (s, i) => (isBuilding(s.grid[i]) ? 3 : 1));
    if (!flowAir) flowAir = computeFlow(state, () => 1);
    if (sim) {
      for (const e of sim.enemies) e.next = -1;
      refreshDefenders();
    }
    refreshKnights();
  }

  // ---------------------------------------------------------------------------
  // Waves
  // ---------------------------------------------------------------------------
  function waveComposition(n) {
    const groups = [];
    const packs = 1 + Math.floor(n * 0.5);
    for (let i = 0; i < packs; i++) groups.push(['goblin', 'goblin', 'goblin']);
    const add = (type, k) => { for (let i = 0; i < k; i++) groups.push([type]); };
    if (n >= 2) add('orc', 1 + Math.floor(n / 2));
    if (n >= 3) for (let i = 0; i < Math.ceil(n / 6); i++) groups.push(['wolf', 'wolf', 'wolf', 'wolf', 'wolf']);
    if (n >= 4) add('skeleton', Math.floor((n - 2) / 2));
    if (n >= 6) add('troll', Math.floor((n - 4) / 3));
    if (n >= 6) add('sapper', Math.floor((n - 4) / 3));
    if (n >= 7) add('wraith', Math.floor((n - 5) / 3));
    if (n >= 9) add('shaman', Math.ceil((n - 7) / 5));
    if (n >= 12) add('siege', Math.floor((n - 9) / 4));
    for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
    if (n % 10 === 0) add('dragon', n / 10);
    else if (n % 5 === 0) add('ogre', 1 + Math.floor(n / 10));
    const gap = spawnGap(n);
    const list = [];
    for (const g of groups) g.forEach((type, k) => list.push({ type, gap: k < g.length - 1 ? 0.25 : gap }));
    return list;
  }
  const hpScale = n => 1 + 0.1 * (n - 1);
  const spawnGap = n => Math.max(0.5, 1.8 - n * 0.08);

  function waveSummary(n) {
    const counts = {};
    for (const e of waveComposition(n)) counts[e.type] = (counts[e.type] || 0) + 1;
    return Object.entries(counts).map(([t, k]) => ({ type: t, count: k, hp: Math.round(ENEMIES[t].hp * hpScale(n)) }));
  }

  function startWave() {
    if (sim || state.fallen) return;
    const n = state.wave;
    sim = {
      queue: waveComposition(n), spawnT: 0.3, nextId: 1, time: 0,
      enemies: [], shots: [], defenders: [], slain: 0, leaked: 0, bounty: 0, lost: [], bossSlain: null, knightsFallen: 0,
      castleAtStart: state.castleHp, preview: null,
    };
    sim.preview = waveSummary(n);
    refreshDefenders();
    renderAll();
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function spawnEnemy(type) {
    const base = ENEMIES[type];
    const gate = rand(GATES);
    const [x, y] = coords(gate);
    const hp = Math.round(base.hp * hpScale(state.wave));
    sim.enemies.push({
      id: sim.nextId++, type, hp, maxHp: hp, x, y, cell: gate, next: -1, speed: base.speed, dmg: base.dmg, bounty: base.bounty,
      flying: !!base.flying, regen: base.regen || 0, batter: base.batter || 1, reassemble: !!base.reassemble, reassembled: false,
      sapper: !!base.sapper, healAura: base.healAura || 0, reach: base.reach || 0, slowT: 0, slowK: 0,
      pile: 0, swingT: 0.4, attacking: false, blocked: false, blockers: [], dead: false, el: null,
    });
  }

  function refreshDefenders() {
    const old = {};
    for (const d of sim.defenders) old[d.i] = d.cd;
    sim.defenders = [];
    for (let i = 0; i < W * H; i++) {
      const t = state.grid[i];
      if (!t || info(t).kind !== 'defence') continue;
      const st = tileStats(state, i);
      sim.defenders.push({ i, type: t, dmg: st.dmg, rate: st.rate, range: st.range, slow: st.slow, noAir: st.noAir, cd: old[i] || 0 });
    }
  }

  // Make the knight roster match the barracks on the board (count and stats).
  let knightId = 1;
  function refreshKnights() {
    const keep = [];
    for (let i = 0; i < W * H; i++) {
      if (state.grid[i] !== 'barracks') continue;
      const st = tileStats(state, i);
      const [hx, hy] = coords(i);
      const mine = knights.filter(k => k.home === i);
      while (mine.length < st.squad) {
        const slot = mine.length;
        mine.push({ id: knightId++, home: i, hx, hy, slot, x: hx + SLOTS[slot][0], y: hy + SLOTS[slot][1], hp: st.hp, maxHp: st.hp,
          dmg: st.dmg, rate: st.rate, cd: 0, state: 'idle', target: null, respawnT: 0, facing: 1, swing: 0, el: null,
          respawn: KNIGHT.respawn * (1 - Math.min(0.6, st.revive)) });
      }
      mine.length = Math.min(mine.length, st.squad);
      for (const k of mine) {
        const frac = k.maxHp ? k.hp / k.maxHp : 1;
        k.maxHp = st.hp; k.hp = Math.min(st.hp, Math.max(k.hp, Math.round(frac * st.hp)));
        k.dmg = st.dmg; k.rate = st.rate;
        k.respawn = KNIGHT.respawn * (1 - Math.min(0.6, st.revive));
      }
      keep.push(...mine);
    }
    for (const k of knights) if (!keep.includes(k) && k.el) { k.el.remove(); k.el = null; }
    knights = keep;
  }

  function restKnights() {
    for (const k of knights) {
      k.state = 'idle'; k.target = null; k.hp = k.maxHp; k.cd = 0; k.swing = 0;
      k.x = k.hx + SLOTS[k.slot][0]; k.y = k.hy + SLOTS[k.slot][1];
    }
  }

  function enemyOn(i) {
    if (!sim) return false;
    return sim.enemies.some(e => !e.dead && !e.flying && (e.cell === i || e.next === i));
  }

  function destroyTile(i) {
    const t = state.grid[i];
    state.grid[i] = null;
    state.hp[i] = 0;
    state.lvl[i] = 0;
    sim.lost.push(BUILD[t].name);
    reflow();
    renderGrid();
  }

  const targetable = e => !e.dead && e.pile <= 0;

  function enemyDown(e) {
    if (e.reassemble && !e.reassembled) {
      e.reassembled = true;
      e.pile = 2.5;
      e.hp = 0;
      return;
    }
    e.dead = true;
    state.gold += e.bounty;
    sim.bounty += e.bounty;
    sim.slain += 1;
    if (ENEMIES[e.type].boss) sim.bossSlain = ENEMIES[e.type].name.toLowerCase();
  }

  function stepKnights(dt) {
    const sm = sim;
    const byId = {};
    const engaged = {};
    if (sm) for (const e of sm.enemies) if (targetable(e) && !e.flying) byId[e.id] = e;
    for (const k of knights) if (k.target !== null && (k.state === 'march' || k.state === 'fight')) engaged[k.target] = (engaged[k.target] || 0) + 1;

    const moveTo = (k, tx, ty, stopAt) => {
      const dx = tx - k.x;
      const dy = ty - k.y;
      const d = Math.hypot(dx, dy);
      if (d <= stopAt) return true;
      const step = Math.min(KNIGHT.speed * dt, d - stopAt);
      k.x += dx / d * step;
      k.y += dy / d * step;
      if (Math.abs(dx) > 0.05) k.facing = dx < 0 ? -1 : 1;
      return d - step <= stopAt + 0.001;
    };

    for (const k of knights) {
      k.swing = Math.max(0, k.swing - dt);
      if (k.state === 'dead') {
        k.respawnT -= dt;
        if (k.respawnT <= 0) { k.state = 'idle'; k.hp = k.maxHp; k.x = k.hx + SLOTS[k.slot][0]; k.y = k.hy + SLOTS[k.slot][1]; }
        continue;
      }
      if (k.state === 'idle' || k.state === 'return') {
        const homeX = k.hx + SLOTS[k.slot][0];
        const homeY = k.hy + SLOTS[k.slot][1];
        if (moveTo(k, homeX, homeY, 0.02)) {
          k.state = 'idle';
          k.hp = Math.min(k.maxHp, k.hp + KNIGHT.heal * dt);
        }
        if (k.state === 'idle' && sm && k.hp >= k.maxHp * 0.5) {
          let best = null;
          let bestScore = Infinity;
          for (const e of Object.values(byId)) {
            if (dist2(e.x, e.y, k.hx, k.hy) > KNIGHT.rally) continue;
            const n = engaged[e.id] || 0;
            if (n >= KNIGHT.maxPer) continue;
            const rem = e.next >= 0 ? flow.dist[e.next] : flow.dist[e.cell];
            const score = n * 10 + rem;
            if (score < bestScore) { bestScore = score; best = e; }
          }
          if (best) { k.target = best.id; k.state = 'march'; engaged[best.id] = (engaged[best.id] || 0) + 1; }
        }
        continue;
      }
      const e = byId[k.target];
      if (!e || dist2(e.x, e.y, k.hx, k.hy) > KNIGHT.leash) { k.state = 'return'; k.target = null; continue; }
      if (k.state === 'march') {
        if (moveTo(k, e.x, e.y, KNIGHT.engage)) k.state = 'fight';
        continue;
      }
      // fight
      if (dist2(e.x, e.y, k.x, k.y) > KNIGHT.engage + 0.35) { k.state = 'march'; continue; }
      if (Math.abs(e.x - k.x) > 0.05) k.facing = e.x < k.x ? -1 : 1;
      e.blocked = true;
      e.blockers.push(k);
      k.cd -= dt;
      if (k.cd <= 0) {
        k.cd = k.rate;
        k.swing = 0.25;
        e.hp -= k.dmg;
        if (e.hp <= 0) enemyDown(e);
      }
      if (k.hp < k.maxHp * KNIGHT.retreatAt) { k.state = 'return'; k.target = null; }
    }
  }

  function stepSim(dt) {
    const s = state;
    const sm = sim;
    sm.time += dt;

    if (sm.queue.length) {
      sm.spawnT -= dt;
      if (sm.spawnT <= 0) { const q = sm.queue.shift(); spawnEnemy(q.type); sm.spawnT = q.gap; }
    }

    for (const e of sm.enemies) { e.blocked = false; e.blockers = []; }
    stepKnights(dt);

    for (const e of sm.enemies) {
      if (e.dead) continue;
      if (e.pile > 0) {
        e.pile -= dt;
        if (e.pile <= 0) { e.pile = 0; e.hp = Math.round(e.maxHp * 0.5); }
        e.attacking = false;
        continue;
      }
      if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
      if (e.slowT > 0) e.slowT -= dt;
      if (e.blocked) {
        // Held by knights: fight them instead of moving on. Heavy blows every 0.8s.
        e.attacking = true;
        e.swingT -= dt;
        if (e.swingT <= 0) {
          e.swingT = 0.8;
          const k = e.blockers[Math.floor(Math.random() * e.blockers.length)];
          k.hp -= 3 + e.dmg * 3;
          if (k.hp <= 0) { k.hp = 0; k.state = 'dead'; k.target = null; k.respawnT = k.respawn || KNIGHT.respawn; sm.knightsFallen += 1; }
        }
        continue;
      }
      const field = e.flying ? flowAir : e.sapper ? flowSap : flow;
      if (e.next < 0) e.next = field.next[e.cell];
      if (e.next < 0) continue;
      const t = s.grid[e.next];
      if (isBuilding(t) && !e.flying) {
        e.attacking = true;
        s.hp[e.next] -= e.dmg * e.batter * BATTER * dt;
        if (s.hp[e.next] <= 0) destroyTile(e.next);
        continue;
      }
      // A siege ram never has to arrive. It stops as soon as anything of yours is inside its
      // reach, which is further than a tower can shoot, and starts throwing stones at it.
      if (e.reach) {
        const hit = nearestBuilding(s, e.x, e.y, e.reach);
        if (hit >= 0) {
          e.attacking = true;
          s.hp[hit] -= e.dmg * e.batter * BATTER * dt;
          if (s.hp[hit] <= 0) destroyTile(hit);
          sm.shots.push({ x0: e.x, y0: e.y, x1: coords(hit)[0], y1: coords(hit)[1], t: 0, dur: 0.3, kind: 'stone' });
          continue;
        }
      }
      e.attacking = false;
      const [tx, ty] = coords(e.next);
      const dx = tx - e.x;
      const dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      const step = e.speed * (e.slowT > 0 ? 1 - e.slowK : 1) * dt;
      if (d <= step) {
        e.x = tx; e.y = ty; e.cell = e.next; e.next = -1;
        if (e.cell === CASTLE) {
          s.castleHp = Math.max(0, s.castleHp - e.dmg);
          e.dead = true;
          sm.leaked += 1;
          castleFlash = 0.4;
        }
      } else {
        e.x += dx / d * step;
        e.y += dy / d * step;
      }
    }

    // Shamans mend whatever is near them, themselves included, which is why they are worth
    // twenty gold and why leaving one alive at the back of a pack is how a wave gets through.
    for (const h of sm.enemies) {
      if (h.dead || !h.healAura || h.pile > 0) continue;
      for (const e of sm.enemies) {
        if (e.dead || e.pile > 0 || e.hp >= e.maxHp) continue;
        if (Math.hypot(e.x - h.x, e.y - h.y) > 2.1) continue;
        e.hp = Math.min(e.maxHp, e.hp + h.healAura * dt);
      }
    }

    for (const d of sm.defenders) {
      d.cd -= dt;
      if (d.cd > 0) continue;
      const [cx, cy] = coords(d.i);
      let best = null;
      let bestRem = Infinity;
      for (const e of sm.enemies) {
        if (!targetable(e)) continue;
        if (d.noAir && e.flying) continue;
        if (Math.hypot(e.x - cx, e.y - cy) > d.range) continue;
        const field = e.flying ? flowAir : flow;
        let rem;
        if (e.next >= 0) { const [nx, ny] = coords(e.next); rem = field.dist[e.next] + Math.hypot(e.x - nx, e.y - ny); }
        else rem = field.dist[e.cell];
        if (rem < bestRem) { bestRem = rem; best = e; }
      }
      if (!best) continue;
      d.cd = d.rate;
      best.hp -= d.dmg;
      if (d.slow) { best.slowT = 3; best.slowK = Math.max(best.slowK, d.slow); }
      sm.shots.push({ x0: cx, y0: cy, x1: best.x, y1: best.y, t: 0, dur: 0.18, kind: d.slow ? 'hex' : d.type === 'ballista' ? 'bolt' : 'arrow' });
      if (best.hp <= 0 && !best.dead) enemyDown(best);
    }

    for (const e of sm.enemies) if (e.dead && e.el) { e.el.remove(); e.el = null; }
    sm.enemies = sm.enemies.filter(e => !e.dead);
    for (const p of sm.shots) p.t += dt;
    sm.shots = sm.shots.filter(p => p.t < p.dur);

    if (s.castleHp <= 0) { gameOver(); return; }
    if (!sm.queue.length && !sm.enemies.length) endWave();
  }

  function chronicleLine(entry) {
    const lostHp = entry.castleAtStart - entry.castleHp;
    let pool;
    if (lostHp >= 5) pool = LINES.bloody;
    else if (entry.lost.length) pool = LINES.costly;
    else if (entry.leaked) pool = LINES.held;
    else if (entry.knightsFallen >= 2 && Math.random() < 0.5) pool = LINES.knights;
    else pool = LINES.flawless;
    let text = rand(pool).replace('{lost}', (entry.lost[0] || 'wall').toLowerCase());
    if (entry.bossSlain) text = `${rand(LINES.boss).replace('{boss}', entry.bossSlain)} ${text}`;
    return text;
  }

  function endWave() {
    const sm = sim;
    sim = null;
    cancelAnimationFrame(raf);
    clearFx();
    restKnights();
    const inc = income(state);
    state.gold += inc.total;
    const entry = {
      wave: state.wave, slain: sm.slain, leaked: sm.leaked, bounty: sm.bounty, income: inc.total, from: inc.from,
      lost: sm.lost, castleHp: state.castleHp, castleAtStart: sm.castleAtStart, bossSlain: sm.bossSlain, knightsFallen: sm.knightsFallen,
      who: rand(VILLAGERS), trade: rand(TRADES),
    };
    entry.text = chronicleLine(entry);
    state.log = [entry].concat(state.log).slice(0, LOG_MAX);
    state.best = Math.max(state.best, state.wave);
    state.wave += 1;
    save();
    renderAll(entry.wave);
    const fromText = Object.entries(entry.from).map(([t, g]) => `${g}g ${BUILD[t].name.toLowerCase()}${g === 1 ? '' : 's'}`).join(', ');
    showOverlay(
      `<h2>Wave ${entry.wave} ${entry.leaked ? 'weathered' : 'held'}</h2>` +
      `<div class="big">${entry.slain} slain${entry.leaked ? ` · ${entry.leaked} reached the keep` : ''}</div>` +
      `<p>+${entry.bounty}g in loot · +${entry.income}g from the village${fromText ? ` (${fromText})` : ''}` +
      `${entry.knightsFallen ? `<br>${entry.knightsFallen} knight${entry.knightsFallen === 1 ? '' : 's'} fell and will be back on their feet by the next wave` : ''}` +
      `${entry.lost.length ? `<br>Lost: ${entry.lost.join(', ')}` : ''}</p>` +
      `<p class="quote">&ldquo;${esc(entry.text)}&rdquo;<br><span class="muted">&mdash; ${esc(entry.who)}, ${entry.trade}</span></p>` +
      `<button class="btn btn-primary" id="btn-morning">Back to work</button>`,
      null, true
    );
    $('btn-morning').addEventListener('click', hideOverlay);
  }

  function gameOver() {
    const sm = sim;
    sim = null;
    cancelAnimationFrame(raf);
    clearFx();
    restKnights();
    state.fallen = true;
    state.best = Math.max(state.best, state.wave);
    save();
    renderAll();
    showOverlay(
      `<h2>The keep has fallen</h2>` +
      `<div class="big">Wave ${state.wave}</div>` +
      `<p>${sm.slain} monsters slain this wave before the door gave way.<br>Best stand: wave ${state.best}.</p>` +
      `<button class="btn btn-primary" id="btn-restart">Rebuild the keep</button>`
    );
    $('btn-restart').addEventListener('click', () => { hideOverlay(); newGame(); });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.grid) || s.grid.length !== W * H || !Array.isArray(s.hp)) return null;
      s.grid[CASTLE] = 'castle';
      for (const g of GATES) s.grid[g] = 'gate';
      if (!Array.isArray(s.log)) s.log = [];
      // Older saves predate barracks levels.
      if (!Array.isArray(s.lvl) || s.lvl.length !== W * H) s.lvl = s.grid.map(t => (t === 'barracks' ? 1 : 0));
      return s;
    } catch (e) { return null; }
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let cellEls = [];
  let centers = [];
  let castleFlash = 0;

  function renderTop() {
    $('stat-wave').textContent = sim ? `${state.wave}` : `${state.wave}${state.best ? ` · best ${state.best}` : ''}`;
    $('stat-gold').textContent = `${state.gold}g`;
    const hp = state.castleHp;
    const v = $('stat-castle');
    v.innerHTML = `${hp} / ${CASTLE_HP}<span class="hp-bar"><i style="width:${(hp / CASTLE_HP) * 100}%"></i></span>`;
    v.className = `value${hp <= CASTLE_HP / 4 ? ' low' : ''}`;
  }

  // Hotbar shortcuts. The buildings take the number row in the order they are
  // declared; demolish takes X, wherever it happens to sit in the list.
  const HOTKEYS = (() => {
    const row = '1234567890qwe';
    const map = {};
    let n = 0;
    for (const key of Object.keys(BUILD)) map[key] = key === 'demolish' ? 'x' : row[n++];
    return map;
  })();

  function renderPalette() {
    const host = $('palette');
    host.innerHTML = '';
    for (const [key, b] of Object.entries(BUILD)) {
      const btn = el('button', `btn tool t-${key}${tool === key ? ' active' : ''}`);
      btn.title = `${b.name} — ${HOTKEYS[key].toUpperCase()}`;
      btn.innerHTML = `<span class="icon">${b.icon}</span><span class="name">${b.name}</span>` +
        `<span class="key">${HOTKEYS[key].toUpperCase()}</span>` +
        `<span class="cost${key !== 'demolish' && state.gold < b.cost ? ' short' : ''}">${key === 'demolish' ? '' : `${b.cost}g`}</span>` +
        `<span class="tool-desc"><b>${b.name}</b> &middot; ${b.desc}</span>`;
      btn.addEventListener('click', () => { tool = key; renderPalette(); });
      host.appendChild(btn);
    }
  }

  function layoutCells() {
    centers = cellEls.map(c => [c.offsetLeft + c.offsetWidth / 2, c.offsetTop + c.offsetHeight / 2]);
  }

  function renderGrid() {
    const host = $('grid');
    host.innerHTML = '';
    cellEls = [];
    for (let i = 0; i < W * H; i++) {
      const t = state.grid[i];
      const c = el('button', 'cell');
      if (t) {
        const b = info(t);
        c.classList.add('built', `t-${t}`);
        if (isFixed(t)) c.classList.add('fixed');
        const st = tileStats(state, i);
        if (st.power) c.classList.add('flag-sharp');
        if (st.haste) c.classList.add('flag-haste');
        if (b.kind === 'village' && st.gold > b.gold) c.classList.add('flag-rich');
        c.innerHTML = `<span class="icon">${b.icon}</span>`;
        let lbl = b.name;
        if (b.kind === 'village') lbl = `${st.gold}g`;
        else if (t === 'barracks') lbl = `Barracks ${'I'.repeat(st.lvl)}`;
        else if (t === 'castle') lbl = 'The Keep';
        else if (t === 'gate') lbl = GATE_NAMES[i].replace('the ', '');
        c.appendChild(el('span', 'lbl', lbl));
        if (isBuilding(t)) {
          const bar = el('span', 'tile-hp');
          bar.appendChild(el('i'));
          c.appendChild(bar);
        }
      }
      c.addEventListener('click', () => onCell(i));
      c.addEventListener('mouseenter', () => hoverCell(i));
      c.addEventListener('mouseleave', () => { $('cell-hint').innerHTML = '&nbsp;'; });
      host.appendChild(c);
      cellEls.push(c);
    }
    layoutCells();
    renderPath();
    renderTileHp();
    renderUnits();
    const built = state.grid.filter(isBuilding).length;
    $('capacity').textContent = `${built} tile${built === 1 ? '' : 's'} · ${income(state).total}g a wave · ${knights.length} knight${knights.length === 1 ? '' : 's'}`;
  }

  function renderPath() {
    const on = pathCells();
    for (let i = 0; i < W * H; i++) {
      const c = cellEls[i];
      const t = state.grid[i];
      c.classList.toggle('path', on.has(i) && !isBuilding(t));
      c.classList.toggle('path-bash', on.has(i) && isBuilding(t));
    }
  }

  function renderTileHp() {
    for (let i = 0; i < W * H; i++) {
      const t = state.grid[i];
      if (!isBuilding(t)) continue;
      const bar = cellEls[i].querySelector('.tile-hp');
      if (!bar) continue;
      const frac = Math.max(0, state.hp[i]) / BUILD[t].hp;
      bar.classList.toggle('show', frac < 0.999);
      bar.firstChild.style.width = `${frac * 100}%`;
    }
  }

  function hoverCell(i) {
    const t = state.grid[i];
    let msg;
    if (t) {
      const b = info(t);
      const st = tileStats(state, i);
      const bits = [];
      if (b.kind === 'village') bits.push(`earns ${st.gold}g a wave`);
      if (b.kind === 'defence') bits.push(`${st.dmg.toFixed(0)} damage every ${st.rate.toFixed(1)}s, range ${b.range}`);
      if (t === 'barracks') {
        bits.push(`level ${st.lvl} · ${st.squad} knights with ${st.hp} hp, ${st.dmg.toFixed(0)} damage every ${st.rate.toFixed(1)}s, rally ${KNIGHT.rally} tiles`);
        if (st.lvl < MAX_LEVEL) bits.push(`click with the Barracks tool to upgrade for ${UPGRADE_COST[st.lvl]}g`);
      }
      if (isBuilding(t)) bits.push(`${Math.ceil(state.hp[i])} / ${b.hp} hp`);
      bits.push(...st.got);
      const gives = givesTo(state, i, t);
      if (gives.length) bits.push(`boosting ${gives.join(', ')}`);
      if (t === 'gate') bits.push(`the horde arrives by ${GATE_NAMES[i]}`);
      if (t === 'castle') bits.push('hold it or the game ends');
      msg = `<b>${b.name}</b>${bits.length ? ' · ' + bits.join(' · ') : ''}`;
    } else if (tool === 'demolish') {
      msg = 'Nothing to demolish here.';
    } else {
      const b = BUILD[tool];
      const st = tileStats(state, i, tool);
      const bits = [];
      if (b.kind === 'village') bits.push(`would earn ${st.gold}g a wave`);
      if (st.got.length) bits.push(...st.got);
      const gives = givesTo(state, i, tool);
      if (gives.length) bits.push(`would boost ${gives.join(', ')}`);
      if (pathCells().has(i)) bits.push('on the horde’s path');
      msg = `Build a <b>${b.name}</b> here for ${b.cost}g${bits.length ? ' · ' + bits.join(' · ') : ''}`;
    }
    $('cell-hint').innerHTML = msg;
  }

  function onCell(i) {
    if (state.fallen) return;
    const t = state.grid[i];
    if (isFixed(t)) { flash('cell-hint', t === 'castle' ? 'That is the keep. Defend it.' : 'The roads stay open; build beside them.'); return; }
    if (tool === 'demolish') {
      if (!t) return;
      state.grid[i] = null;
      state.hp[i] = 0;
      state.lvl[i] = 0;
      state.gold += Math.floor(BUILD[t].cost / 2);
    } else if (t === 'barracks' && tool === 'barracks') {
      const lvl = state.lvl[i] || 1;
      if (lvl >= MAX_LEVEL) { flash('cell-hint', 'This barracks is already at full strength.'); return; }
      const cost = UPGRADE_COST[lvl];
      if (state.gold < cost) { flash('cell-hint', `Not enough gold. The upgrade costs ${cost}g.`); return; }
      state.gold -= cost;
      state.lvl[i] = lvl + 1;
    } else {
      if (t) { flash('cell-hint', 'Demolish it first.'); return; }
      if (enemyOn(i)) { flash('cell-hint', 'Monsters are standing there.'); return; }
      const b = BUILD[tool];
      if (state.gold < b.cost) { flash('cell-hint', `Not enough gold. ${b.name} costs ${b.cost}g.`); return; }
      state.gold -= b.cost;
      state.grid[i] = tool;
      state.hp[i] = b.hp;
      state.lvl[i] = tool === 'barracks' ? 1 : 0;
    }
    reflow();
    save();
    renderAll();
    hoverCell(i);
  }

  function flash(id, msg) { $(id).innerHTML = msg; }

  function tallyText() {
    return `${sim.slain} slain · ${sim.leaked} reached the keep${sim.knightsFallen ? ` · ${sim.knightsFallen} knights down` : ''}${sim.lost.length ? ` · lost ${sim.lost.length}` : ''}`;
  }

  function renderWave() {
    const host = $('guests');
    host.innerHTML = '';
    const n = state.wave;
    if (sim) {
      $('guest-count').textContent = `${sim.enemies.length} on the field, ${sim.queue.length} to come`;
      for (const row of sim.preview) {
        const card = el('div', `guest e-${row.type}`);
        card.innerHTML = `<div class="row"><span class="name">${ENEMIES[row.type].icon} ${ENEMIES[row.type].name}</span><span class="tier">&times;${row.count}</span></div>`;
        host.appendChild(card);
      }
      const tally = el('div', 'guest tally');
      tally.innerHTML = `<div class="line">${tallyText()}</div>`;
      host.appendChild(tally);
    } else {
      const rows = waveSummary(n);
      const total = rows.reduce((a, r) => a + r.count, 0);
      $('guest-count').textContent = `wave ${n} · ${total} monsters`;
      for (const row of rows) {
        const e = ENEMIES[row.type];
        const card = el('div', `guest e-${row.type}`);
        card.innerHTML = `<div class="row"><span class="name">${e.icon} ${e.name}</span><span class="tier">&times;${row.count}</span></div>` +
          `<div class="line">${row.hp} hp · ${e.note} · ${e.dmg} damage to the keep</div>`;
        host.appendChild(card);
      }
    }
    const btn = $('btn-night');
    btn.disabled = !!sim || state.fallen;
    btn.textContent = sim ? `Wave ${n} in progress…` : `Sound the alarm: wave ${n}`;
    $('btn-speed').textContent = `Speed ×${speed}`;
    $('btn-speed').classList.toggle('active', speed > 1);
    const hint = $('night-hint');
    const sealed = GATES.some(g => { let c = g; let guard = 0; while (c >= 0 && c !== CASTLE && guard++ < W * H) { if (isBuilding(state.grid[c])) return true; c = flow.next[c]; } return false; });
    if (sim) hint.textContent = 'You can still build while they come. Knights hold monsters in place; that is when your archers earn their keep.';
    else if (sealed) hint.textContent = 'The horde will batter through the red-edged tile: every way round it is longer. Leave a road open or they will make one.';
    else hint.textContent = `The horde follows the dotted path from the ${GATES.length} roads to the keep. Walls bend it; knights from a barracks beside it stall it; towers finish it.`;
  }

  function renderLog(freshWave) {
    const host = $('reviews');
    host.innerHTML = '';
    if (!state.log.length) { host.appendChild(el('p', 'empty', 'Nothing written yet. The first goblins are on the road.')); return; }
    for (const r of state.log) {
      const row = el('div', `review${r.wave === freshWave ? ' fresh' : ''}`);
      const cls = r.castleAtStart - r.castleHp >= 5 ? 'low' : (r.leaked === 0 ? 'high' : '');
      const gain = r.bounty + r.income;
      row.innerHTML = `<span class="stars ${cls}">Wave ${r.wave}</span>` +
        `<span><span class="who">${esc(r.who)}<small>${esc(r.trade)} · ${r.slain} slain${r.leaked ? `, ${r.leaked} through` : ''}${r.knightsFallen ? ` · ${r.knightsFallen} knights down` : ''}${r.lost.length ? ` · lost ${esc(r.lost.join(', '))}` : ''}</small></span> ` +
        `<span class="text">&ldquo;${esc(r.text)}&rdquo;</span></span>` +
        `<span class="pay plus">+${gain}g</span>`;
      host.appendChild(row);
    }
  }

  function renderAll(freshWave) {
    renderTop();
    renderPalette();
    renderGrid();
    renderWave();
    renderLog(freshWave);
  }

  // Live layer: enemies, knights and shots, positioned over the grid.
  function clearFx() {
    const fx = $('fx');
    fx.innerHTML = '';
    for (const k of knights) k.el = null;
    cellEls[CASTLE] && cellEls[CASTLE].classList.remove('hit');
  }

  function toPx(x, y) {
    const cw = cellEls[0].offsetWidth;
    const i = idx(Math.max(0, Math.min(W - 1, Math.round(x))), Math.max(0, Math.min(H - 1, Math.round(y))));
    const [cx, cy] = centers[i];
    const [ix, iy] = coords(i);
    const pitch = cellEls.length > 1 ? centers[1][0] - centers[0][0] : cw;
    return [cx + (x - ix) * pitch, cy + (y - iy) * pitch];
  }

  // Knights are drawn in and out of waves.
  function renderUnits() {
    const fx = $('fx');
    if (!cellEls.length) return;
    for (const k of knights) {
      if (!k.el) {
        k.el = el('div', 'knight');
        k.el.innerHTML = `<span class="k-fig"><span class="k-helm"></span><span class="k-body"></span><span class="k-sword"></span></span><span class="k-pips"></span>`;
        fx.appendChild(k.el);
      }
      const [x, y] = toPx(k.x, k.y);
      k.el.style.transform = `translate(${x}px, ${y}px)`;
      k.el.classList.toggle('fighting', k.state === 'fight');
      k.el.classList.toggle('swing', k.swing > 0);
      k.el.classList.toggle('dead', k.state === 'dead');
      k.el.classList.toggle('marching', k.state === 'march' || k.state === 'return');
      k.el.querySelector('.k-fig').classList.toggle('flip', k.facing < 0);
      const pips = k.el.querySelector('.k-pips');
      const total = Math.ceil(k.maxHp / 10);
      if (pips.children.length !== total) { pips.innerHTML = ''; for (let p = 0; p < total; p++) pips.appendChild(el('i')); }
      const lit = Math.ceil(k.hp / 10);
      for (let p = 0; p < total; p++) pips.children[p].classList.toggle('on', p < lit);
    }
  }

  function renderSim() {
    const fx = $('fx');
    const cw = cellEls[0].offsetWidth;
    if (Math.abs(centers[0][0] - cw / 2 - cellEls[0].offsetLeft) > 1) layoutCells();
    for (const e of sim.enemies) {
      if (!e.el) {
        e.el = el('div', `enemy e-${e.type}${e.flying ? ' flying' : ''}`);
        e.el.innerHTML = `<span class="e-icon">${ENEMIES[e.type].icon}</span><span class="e-hp"><i></i></span>`;
        fx.appendChild(e.el);
      }
      const [x, y] = toPx(e.x, e.y);
      e.el.style.transform = `translate(${x}px, ${y}px)`;
      e.el.classList.toggle('attacking', e.attacking && !e.blocked);
      e.el.classList.toggle('fighting', e.blocked);
      const pile = e.pile > 0;
      if (pile !== e.el.classList.contains('pile')) {
        e.el.classList.toggle('pile', pile);
        e.el.querySelector('.e-icon').textContent = pile ? '🦴' : ENEMIES[e.type].icon;
      }
      e.el.querySelector('i').style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
    }
    for (const p of sim.shots) {
      if (!p.el) { p.el = el('div', `shot ${p.kind}`); fx.appendChild(p.el); }
      const k = Math.min(1, p.t / p.dur);
      const [x, y] = toPx(p.x0 + (p.x1 - p.x0) * k, p.y0 + (p.y1 - p.y0) * k);
      const ang = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      p.el.style.transform = `translate(${x}px, ${y}px) rotate(${ang}rad)`;
    }
    for (const child of Array.from(fx.children)) {
      if (child.classList.contains('shot') && !sim.shots.some(p => p.el === child)) child.remove();
    }
    renderUnits();
    renderTileHp();
    if (castleFlash > 0) { cellEls[CASTLE].classList.add('hit'); castleFlash -= 0.016; }
    else cellEls[CASTLE].classList.remove('hit');
    $('stat-gold').textContent = `${state.gold}g`;
    const hp = state.castleHp;
    $('stat-castle').innerHTML = `${hp} / ${CASTLE_HP}<span class="hp-bar"><i style="width:${(hp / CASTLE_HP) * 100}%"></i></span>`;
    $('guest-count').textContent = `${sim.enemies.length} on the field, ${sim.queue.length} to come`;
    const tally = $('guests').querySelector('.tally .line');
    if (tally) tally.textContent = tallyText();
  }

  let last = 0;
  let raf = 0;
  function frame(ts) {
    if (!sim) return;
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016;
    last = ts;
    let total = dt * speed;
    while (total > 0 && sim) {
      const h = Math.min(SUBSTEP, total);
      stepSim(h);
      total -= h;
    }
    if (sim) { renderSim(); raf = requestAnimationFrame(frame); }
  }

  // ---------------------------------------------------------------------------
  // Overlays & boot
  // ---------------------------------------------------------------------------
  // `escapable` marks an overlay the player may dismiss with Escape or a click
  // on the backdrop. The fallen-keep card is not one: there is nothing behind it
  // to go back to.
  let escapable = false;
  function showOverlay(html, cls, canEscape) {
    const card = $('overlay-card');
    card.className = `overlay-card${cls ? ' ' + cls : ''}`;
    card.innerHTML = html;
    escapable = !!canEscape;
    $('overlay').hidden = false;
  }
  function hideOverlay() { $('overlay').hidden = true; escapable = false; }

  function showHelp() {
    showOverlay(
      `<h2>How to hold the marches</h2>` +
      `<p>The horde walks the dotted road from the three gates to <b>the keep</b> in the far corner. Lose the keep and the game is over.</p>` +
      `<p>Almost everything you build boosts something beside it, and a good deal of it boosts the thing that boosts it back &mdash; a well feeds the farm, the farm supplies the tavern, the tavern fills the market, and the market pays the farm. Hover a slot in the hotbar to see what it gives and what it takes.</p>` +
      `<p><b>Walls</b> bend the road the long way round. <b>Towers</b>, <b>ballistae</b> and <b>mage towers</b> shoot what walks past. A <b>barracks</b> sends knights out to hold monsters still, which is when your archers earn their keep &mdash; click a barracks with the barracks tool again to upgrade it.</p>` +
      `<p>Seal every road and the horde will simply batter through the red-edged tile instead. Leave them a way in and make it a long one.</p>` +
      `<p><b>Keys:</b> ${Object.entries(HOTKEYS).map(([k, ch]) => `${ch.toUpperCase()} ${BUILD[k].name}`).join(' &middot; ')} &middot; Space sounds the alarm &middot; S toggles speed.</p>` +
      `<button class="btn btn-primary" id="btn-help-close">Back to the walls</button>`,
      'help', true);
    $('btn-help-close').addEventListener('click', hideOverlay);
  }

  function newGame() {
    if (sim) { sim = null; cancelAnimationFrame(raf); }
    clearFx();
    knights = [];
    const best = state ? state.best : 0;
    state = freshState();
    state.best = best;
    tool = 'wall';
    reflow();
    save();
    renderAll();
  }

  $('btn-night').addEventListener('click', startWave);
  $('btn-speed').addEventListener('click', () => { speed = speed === 1 ? 2 : 1; renderWave(); });
  $('btn-help').addEventListener('click', showHelp);
  $('overlay').addEventListener('click', ev => { if (escapable && ev.target === $('overlay')) hideOverlay(); });

  // Hotbar keys, so a hand never has to leave the board for the build list.
  window.addEventListener('keydown', ev => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (!$('overlay').hidden) { if (ev.key === 'Escape' && escapable) hideOverlay(); return; }
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const pick = Object.keys(HOTKEYS).find(t => HOTKEYS[t] === k);
    if (pick) { tool = pick; renderPalette(); ev.preventDefault(); return; }
    // Space would also re-trigger whichever button still has focus.
    if (k === ' ') { ev.preventDefault(); if (document.activeElement !== $('btn-night')) startWave(); return; }
    if (k === 's') { speed = speed === 1 ? 2 : 1; renderWave(); }
  });
  $('btn-new').addEventListener('click', () => {
    if (state.wave > 1 && !state.fallen && !confirm('Abandon this keep and start again?')) return;
    hideOverlay();
    newGame();
  });
  window.addEventListener('resize', () => { layoutCells(); renderUnits(); });

  state = load() || freshState();
  reflow();
  save();
  renderAll();
  if (state.fallen) {
    showOverlay(`<h2>The keep has fallen</h2><div class="big">Wave ${state.wave}</div><p>Best stand: wave ${state.best}.</p>` +
      `<button class="btn btn-primary" id="btn-restart">Rebuild the keep</button>`);
    $('btn-restart').addEventListener('click', () => { hideOverlay(); newGame(); });
  }

  // Small debug handle for playtesting scripts.
  window.keep = {
    state: () => state, sim: () => sim, flow: () => flow, knights: () => knights,
    place: (x, y, t) => { tool = t; onCell(idx(x, y)); },
    startWave, newGame, running: () => !!sim,
    setSpeed: v => { speed = v; }, W, H,
  };
})();
