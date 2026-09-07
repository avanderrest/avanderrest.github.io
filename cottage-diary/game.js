/* The Garden Shed — a life sim with the scope of a to-do list.
   One character, one cottage, a potting shed, six neighbours. Three things a day. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ data

  const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  const DAYS_PER_SEASON = 7;
  const SHELF_MAX = 4;
  const SAVE_KEY = 'cottage-diary-v2';
  const OLD_KEYS = ['cottage-diary-v1']; // older diaries are read once and carried over
  const TABLE_SLOTS = 3;
  // The shelf starts half empty. Every few pages the cookbook picks up, room turns up
  // for another pot — you learn a dish, then you find somewhere to grow the thing it wants.
  const POT_START = 3;
  const POT_MAX = 8;
  const POTS_PER_RECIPE = 3;
  const GIFTS_FULL = 1; // gifts to one person in a day before they start waving you off

  // The yard: two things you earn rather than start with.
  const COOP_FAVOURS = 8;   // favours done for the lane before Poppy turns up with a hen
  const COOP_DISHES = 3;    // ...of which this many have to have been something you cooked
  const COOP_STEP = 5;      // and another hen every this many favours after that
  const COOP_MAX = 4;
  const HEN_NAMES = ['Doris', 'Maud', 'Beryl', 'Nancy', 'Enid', 'Vera', 'Sybil', 'Gladys'];
  const HIVE_COMBS = 4;     // frames to draw out before there is honey to take
  const HIVE_MAX = 2;
  const APIARY_FRIEND = 70; // Wren hands over bees to good friends and nobody else
  const APIARY_FLOWERS = 3; // ...who have picked something that flowers
  const FLOWERING = ['sunflower', 'strawberry', 'tomato', 'courgette', 'pumpkin', 'broccoli'];
  // Recipes you move in knowing. The rest are shared by neighbours or worked out at the table.
  const STARTER_RECIPES = ['garden_salad', 'jacket_potato', 'honey_cake', 'onion_soup'];

  const ITEMS = {
    lettuce:    { name: 'Lettuce',    icon: '🥗', kind: 'crop', days: 3, seasons: ['Spring'],                     hardy: false, yield: [2, 3] },
    carrot:     { name: 'Carrot',     icon: '🥕', kind: 'crop', days: 4, seasons: ['Spring', 'Autumn'],           hardy: true,  yield: [2, 3] },
    strawberry: { name: 'Strawberry', icon: '🍓', kind: 'crop', days: 5, seasons: ['Spring'],                     hardy: false, yield: [3, 4] },
    potato:     { name: 'Potato',     icon: '🥔', kind: 'crop', days: 5, seasons: ['Spring', 'Summer', 'Autumn'], hardy: true,  yield: [3, 4] },
    tomato:     { name: 'Tomato',     icon: '🍅', kind: 'crop', days: 5, seasons: ['Summer'],                     hardy: false, yield: [3, 4] },
    courgette:  { name: 'Courgette',  icon: '🥒', kind: 'crop', days: 4, seasons: ['Summer'],                     hardy: false, yield: [2, 3] },
    sweetcorn:  { name: 'Sweetcorn',  icon: '🌽', kind: 'crop', days: 5, seasons: ['Summer'],                     hardy: false, yield: [2, 3] },
    sunflower:  { name: 'Sunflower',  icon: '🌻', kind: 'crop', days: 4, seasons: ['Summer'],                     hardy: false, yield: [1, 2] },
    pumpkin:    { name: 'Pumpkin',    icon: '🎃', kind: 'crop', days: 6, seasons: ['Autumn'],                     hardy: false, yield: [1, 2] },
    onion:      { name: 'Onion',      icon: '🧅', kind: 'crop', days: 4, seasons: ['Autumn', 'Winter'],           hardy: true,  yield: [2, 3] },
    broccoli:   { name: 'Broccoli',   icon: '🥦', kind: 'crop', days: 4, seasons: ['Autumn', 'Winter'],           hardy: true,  yield: [2, 2] },
    cabbage:    { name: 'Cabbage',    icon: '🥬', kind: 'crop', days: 5, seasons: ['Winter'],                     hardy: true,  yield: [1, 2] },
    garlic:     { name: 'Garlic',     icon: '🧄', kind: 'crop', days: 6, seasons: ['Winter'],                     hardy: true,  yield: [2, 3] },
    pea:        { name: 'Peas',       icon: '🫛', kind: 'crop', days: 4, seasons: ['Spring', 'Summer'],           hardy: false, yield: [3, 4] },
    rhubarb:    { name: 'Rhubarb',    icon: '🌱', kind: 'crop', days: 5, seasons: ['Spring'],                     hardy: true,  yield: [2, 3] },
    beetroot:   { name: 'Beetroot',   icon: '🟣', kind: 'crop', days: 5, seasons: ['Summer', 'Autumn'],           hardy: true,  yield: [2, 3] },
    leek:       { name: 'Leeks',      icon: '🥬', kind: 'crop', days: 5, seasons: ['Autumn', 'Winter'],           hardy: true,  yield: [2, 3] },
    parsnip:    { name: 'Parsnips',   icon: '🥕', kind: 'crop', days: 6, seasons: ['Autumn', 'Winter'],           hardy: true,  yield: [2, 3] },
    kale:       { name: 'Kale',       icon: '🥬', kind: 'crop', days: 4, seasons: ['Winter'],                     hardy: true,  yield: [2, 3] },

    flour: { name: 'Flour', icon: '🌾', kind: 'staple' },
    honey: { name: 'Honey', icon: '🍯', kind: 'staple' },
    egg:   { name: 'Eggs',  icon: '🥚', kind: 'staple' },
    fish:  { name: 'Fish',  icon: '🐟', kind: 'staple' },
    milk:  { name: 'Milk',  icon: '🥛', kind: 'staple' },
    apple: { name: 'Apples', icon: '🍎', kind: 'staple' },

    // picked up on a walk, not grown. Seasonal, so the lane changes with the year.
    nettles:  { name: 'Nettles',   icon: '🌿', kind: 'forage', seasons: ['Spring', 'Summer'] },
    berries:  { name: 'Berries',   icon: '🫐', kind: 'forage', seasons: ['Summer', 'Autumn'] },
    mushroom: { name: 'Mushrooms', icon: '🍄', kind: 'forage', seasons: ['Spring', 'Autumn', 'Winter'] },
    chestnut: { name: 'Chestnuts', icon: '🌰', kind: 'forage', seasons: ['Autumn', 'Winter'] },
    wildgarlic: { name: 'Wild garlic', icon: '🌿', kind: 'forage', seasons: ['Spring'] },
    elderflower: { name: 'Elderflower', icon: '🌼', kind: 'forage', seasons: ['Spring', 'Summer'] },
    sloe:     { name: 'Sloes',     icon: '🫐', kind: 'forage', seasons: ['Autumn', 'Winter'] },
    rosehip:  { name: 'Rosehips',  icon: '🌹', kind: 'forage', seasons: ['Autumn', 'Winter'] },
  };

  const RECIPES = {
    garden_salad:    { name: 'Garden Salad',       icon: '🥗', seasons: ['Spring', 'Summer'], needs: { lettuce: 1, carrot: 1 } },
    strawberry_jam:  { name: 'Strawberry Jam',     icon: '🍓', seasons: ['Spring'],           needs: { strawberry: 2, honey: 1 } },
    carrot_cake:     { name: 'Carrot Cake',        icon: '🍰', seasons: ['Spring', 'Autumn'], needs: { carrot: 2, flour: 1, egg: 1 } },
    tomato_tart:     { name: 'Tomato Tart',        icon: '🥧', seasons: ['Summer'],           needs: { tomato: 2, flour: 1, egg: 1 } },
    fritters:        { name: 'Courgette Fritters', icon: '🍳', seasons: ['Summer'],           needs: { courgette: 1, egg: 1 } },
    corn_chowder:    { name: 'Corn Chowder',       icon: '🥣', seasons: ['Summer'],           needs: { sweetcorn: 1, potato: 1, milk: 1 } },
    sunflower_loaf:  { name: 'Sunflower Loaf',     icon: '🍞', seasons: ['Summer', 'Autumn'], needs: { sunflower: 1, flour: 1 } },
    pumpkin_pie:     { name: 'Pumpkin Pie',        icon: '🎃', seasons: ['Autumn'],           needs: { pumpkin: 1, flour: 1, honey: 1 } },
    apple_crumble:   { name: 'Apple Crumble',      icon: '🍎', seasons: ['Autumn', 'Winter'], needs: { apple: 2, flour: 1, honey: 1 } },
    onion_soup:      { name: 'Onion Soup',         icon: '🍲', seasons: ['Autumn', 'Winter'], needs: { onion: 2, potato: 1 } },
    fish_pie:        { name: 'Fish Pie',           icon: '🐟', seasons: ['Autumn', 'Winter'], needs: { fish: 1, potato: 2, milk: 1 } },
    broccoli_bake:   { name: 'Broccoli Bake',      icon: '🧀', seasons: ['Autumn', 'Winter'], needs: { broccoli: 1, milk: 1, egg: 1 } },
    winter_broth:    { name: 'Winter Broth',       icon: '🍲', seasons: ['Winter'],           needs: { cabbage: 1, onion: 1, garlic: 1 } },
    honey_cake:      { name: 'Honey Cake',         icon: '🍰', seasons: ['Winter', 'Spring'], needs: { flour: 1, honey: 1, egg: 1 } },
    garlic_potatoes: { name: 'Garlic Potatoes',    icon: '🥔', seasons: ['Winter'],           needs: { garlic: 1, potato: 2 } },
    jacket_potato:   { name: 'Jacket Potato',      icon: '🥔', seasons: SEASONS,              needs: { potato: 2 } },
    // things the lane provides
    nettle_soup:     { name: 'Nettle Soup',       icon: '🍵', seasons: ['Spring'],           needs: { nettles: 2, potato: 1 } },
    summer_pudding:  { name: 'Summer Pudding',    icon: '🫐', seasons: ['Summer', 'Autumn'], needs: { berries: 2, flour: 1 } },
    mushroom_pie:    { name: 'Mushroom Pie',      icon: '🥧', seasons: ['Autumn', 'Winter'], needs: { mushroom: 2, flour: 1, milk: 1 } },
    candied_nuts:    { name: 'Candied Chestnuts', icon: '🌰', seasons: ['Autumn', 'Winter'], needs: { chestnut: 2, honey: 1 } },
    pea_soup:        { name: 'Pea Soup',          icon: '🥣', seasons: ['Spring', 'Summer'], needs: { pea: 2, potato: 1 } },
    rhubarb_crumble: { name: 'Rhubarb Crumble',   icon: '🥧', seasons: ['Spring'],           needs: { rhubarb: 2, flour: 1, honey: 1 } },
    wild_garlic_butter: { name: 'Wild Garlic Butter', icon: '🧈', seasons: ['Spring'],       needs: { wildgarlic: 2, milk: 1 } },
    cordial:         { name: 'Elderflower Cordial', icon: '🍶', seasons: ['Spring', 'Summer'], needs: { elderflower: 2, honey: 1 } },
    elder_cake:      { name: 'Elderflower Cake',  icon: '🍰', seasons: ['Spring', 'Summer'], needs: { elderflower: 1, flour: 1, honey: 1 } },
    shortcake:       { name: 'Strawberry Shortcake', icon: '🍓', seasons: ['Spring', 'Summer'], needs: { strawberry: 2, flour: 1, milk: 1 } },
    nettle_pesto:    { name: 'Nettle Pesto',      icon: '🌿', seasons: ['Spring', 'Summer'], needs: { nettles: 2, garlic: 1 } },
    berry_jam:       { name: 'Bramble Jam',       icon: '🫐', seasons: ['Summer', 'Autumn'], needs: { berries: 2, honey: 1 } },
    pea_risotto:     { name: 'Pea and Egg Risotto', icon: '🍚', seasons: ['Summer'],         needs: { pea: 2, egg: 1, milk: 1 } },
    beetroot_salad:  { name: 'Beetroot Salad',    icon: '🥗', seasons: ['Summer', 'Autumn'], needs: { beetroot: 2, carrot: 1 } },
    beetroot_soup:   { name: 'Beetroot Soup',     icon: '🍲', seasons: ['Autumn'],           needs: { beetroot: 2, onion: 1, milk: 1 } },
    leek_and_potato: { name: 'Leek and Potato',   icon: '🍲', seasons: ['Autumn', 'Winter'], needs: { leek: 2, potato: 1, milk: 1 } },
    roast_parsnips:  { name: 'Honey Parsnips',    icon: '🥕', seasons: ['Autumn', 'Winter'], needs: { parsnip: 2, honey: 1 } },
    sloe_syrup:      { name: 'Sloe Syrup',        icon: '🍾', seasons: ['Autumn'],           needs: { sloe: 2, honey: 1 } },
    rosehip_tea:     { name: 'Rosehip Tea',       icon: '🍵', seasons: ['Autumn', 'Winter'], needs: { rosehip: 2 } },
    // Winter had four things to cook and now it has a dozen. Nothing in these wants the garden
    // to be doing anything it cannot do in January.
    kale_crisps:     { name: 'Kale Crisps',       icon: '🥬', seasons: ['Winter'],           needs: { kale: 2 } },
    kale_and_egg:    { name: 'Kale and Egg',      icon: '🍳', seasons: ['Winter'],           needs: { kale: 1, egg: 2 } },
    winter_hotpot:   { name: 'Winter Hotpot',     icon: '🍲', seasons: ['Winter'],           needs: { leek: 1, parsnip: 1, potato: 1 } },
    parsnip_bread:   { name: 'Parsnip Bread',     icon: '🍞', seasons: ['Winter'],           needs: { parsnip: 1, flour: 1, egg: 1 } },
    mulled_apple:    { name: 'Mulled Apple',      icon: '🍷', seasons: ['Winter'],           needs: { apple: 2, sloe: 1, honey: 1 } },
    cabbage_hash:    { name: 'Cabbage Hash',      icon: '🍳', seasons: ['Winter'],           needs: { cabbage: 1, potato: 1, onion: 1 } },
  };

  const FOLK = [
    {
      id: 'ada', name: 'Ada', role: 'retired baker, top of the lane', face: '👵', gives: 'flour',
      hello: '"You\'ll be the new one. I\'m Ada. I did the bread for this whole lane for forty years, and I still do, so don\'t go buying any."',
      door: { icon: '🚪', title: 'The blue door at the top of the lane', blurb: 'Warm on the step, and a smell of bread that has been going on for years.' },
      seeds: ['strawberry', 'tomato', 'pumpkin', 'rhubarb'],
      keepsake: { icon: '🫙', name: 'Ada\'s sourdough starter', text: 'A jar of starter older than me. "Feed it," she said. "It\'s family."', given: 'Ada handed over a jar of her sourdough starter. It lives on the shed shelf now, and so, apparently, do I.' },
      likes: ['strawberry_jam', 'carrot_cake', 'pumpkin_pie', 'honey_cake', 'apple_crumble', 'summer_pudding'],
      wants: [{ item: 'strawberry', n: 3 }, { item: 'tomato', n: 2 }, { item: 'pumpkin', n: 1 }, { item: 'honey', n: 1 }, { item: 'egg', n: 2 }, { item: 'garlic', n: 2 }, { item: 'apple', n: 2 }, { item: 'berries', n: 2 }],
      chat: ['Ada had the kettle on before I knocked.', 'Ada showed me the proper way to knead. I was doing it wrong.', 'Ada says the weather is turning. Ada always says that.', 'Sat with Ada while her bread proved. Neither of us said much.'],
      close: ['Ada calls me "love" now, and doesn\'t notice she\'s doing it.', 'Ada talked about her husband for the first time. Only a little, and then the kettle went on.', 'Ada has started leaving the door on the latch for me. I let myself in.', 'Ada fell asleep in her chair while I was there. I washed up and went quietly.'],
      thanks: ['"Oh, you shouldn\'t have. Well. You should, actually."', '"That\'ll go straight in the oven."', '"You\'re a good sort, you know."'],
    },
    {
      id: 'tomas', name: 'Tomas', role: 'carpenter, smells of sawdust, has an apple tree', face: '🧔', gives: 'apple',
      hello: '"Tomas. Next door. If you hear hammering, that\'s me. If you hear swearing, also me. Help yourself to the apples, the tree does more than I can eat."',
      door: { icon: '🪟', title: 'A door propped open with a plank', blurb: 'Sawdust on the path. Somebody in there is sawing and not talking.' },
      seeds: ['potato', 'onion', 'parsnip'],
      keepsake: { icon: '🪵', name: 'A wooden duck', text: 'Tomas carved it in an evening and pretended it was nothing. It is not nothing.', given: 'Tomas left a little carved duck on the doorstep. Didn\'t say a word about it. It\'s on the shed shelf.' },
      likes: ['onion_soup', 'winter_broth', 'jacket_potato', 'fish_pie', 'apple_crumble', 'mushroom_pie'],
      wants: [{ item: 'potato', n: 2 }, { item: 'onion', n: 2 }, { item: 'fish', n: 1 }, { item: 'sweetcorn', n: 2 }, { item: 'jacket_potato', n: 1 }, { item: 'onion_soup', n: 1 }, { item: 'mushroom', n: 2 }],
      chat: ['Tomas looked at my front door from his doorstep and sighed. It sticks, apparently. He can tell from there.','Helped Tomas hold a plank. He said "cheers" twice.', 'Tomas is building a gate for the churchyard. Took him an hour to explain the hinges.', 'Tomas told a joke. I think it was a joke.'],
      close: ['Tomas has fixed my front door. Didn\'t mention it, didn\'t ask. It just shuts now.', 'Tomas talked for an hour about a boat he is not going to build. I hope he builds it.', 'Tomas asked my opinion on a joint, and then waited for the answer.', 'Tomas said "come round whenever" and looked slightly alarmed at himself.'],
      thanks: ['"Right. Good. Ta."', '"That\'ll do nicely."', '"Didn\'t expect that. Cheers."'],
    },
    {
      id: 'wren', name: 'Wren', role: 'beekeeper, always humming', face: '👩‍🌾', gives: 'honey',
      hello: '"Oh, hello! Wren. I keep the bees up on the meadow. Don\'t mind the humming, that\'s mostly me."',
      door: { icon: '🚪', title: 'A cottage door under a meadow', blurb: 'Something is humming behind it. Possibly bees. Possibly not bees.' },
      seeds: ['sunflower', 'lettuce', 'strawberry', 'pea'],
      keepsake: { icon: '🕯️', name: 'A beeswax candle', text: 'Smells of the meadow when it burns. Wren says the bees insisted.', given: 'Wren gave me a beeswax candle, still warm from the mould. On the shed shelf.' },
      likes: ['honey_cake', 'strawberry_jam', 'sunflower_loaf', 'garden_salad', 'nettle_soup', 'summer_pudding'],
      wants: [{ item: 'sunflower', n: 1 }, { item: 'lettuce', n: 2 }, { item: 'strawberry', n: 2 }, { item: 'flour', n: 1 }, { item: 'milk', n: 1 }, { item: 'broccoli', n: 1 }, { item: 'berries', n: 2 }],
      chat: ['Wren let me look inside a hive. The bees did not seem to mind.', 'Wren talked about swarms for twenty minutes. I nodded a lot.', 'Wren was lying in the meadow. I lay down too.', 'Wren has named all her queens. Today\'s was called Margaret.'],
      close: ['Wren showed me how to hold a frame without frightening anybody. My hands are steadier than they were.', 'Wren says the end hive will swarm this year and I am to come and watch.', 'Wren and I lay in the meadow until the light went. Neither of us started it.', 'Wren has stopped explaining bees to me and started just talking about them.'],
      thanks: ['"The bees will be so pleased. Well, I will."', '"Oh! Lovely. Thank you."', '"You didn\'t have to. That\'s why it\'s nice."'],
    },
    {
      id: 'harold', name: 'Harold', role: 'fisherman, mostly retired', face: '👴', gives: 'fish',
      hello: '"Harold. I fish. Or I did. The jetty\'s down that way, if you ever want to watch some water with someone."',
      door: { icon: '⚓', title: 'A door down by the jetty', blurb: 'Nets over the rail, boots by the step, nobody in a hurry.' },
      seeds: ['garlic', 'cabbage', 'carrot', 'kale'],
      keepsake: { icon: '🐚', name: 'A jar of sea glass', text: 'Forty years of walking the tideline, Harold reckons. Green, mostly.', given: 'Harold gave me a jam jar of sea glass. "Catches the light," he said, and went home. It does.' },
      likes: ['fish_pie', 'onion_soup', 'garlic_potatoes', 'corn_chowder', 'mushroom_pie', 'candied_nuts'],
      wants: [{ item: 'onion', n: 2 }, { item: 'carrot', n: 2 }, { item: 'garlic', n: 1 }, { item: 'potato', n: 3 }, { item: 'honey', n: 1 }, { item: 'cabbage', n: 1 }, { item: 'chestnut', n: 2 }],
      chat: ['Harold was on the jetty. We watched the water for a bit.', 'Harold told me about the one that got away. It has grown since last time.', 'Harold says you can tell rain by the gulls. He was right, once.', 'Harold mended a net while I talked. He listens better with his hands busy.'],
      close: ['Harold talked about his wife today. Once, briefly, looking at the water.', 'Harold gave me his good knife. "You\'ll use it more than I do."', 'Harold saves me a spot on the bench now. It is the same spot every time.', 'Harold used my name today. He has been calling me "you" since March.'],
      thanks: ['"Hm. Kind of you."', '"Well now. That\'s something."', '"I\'ll not forget that."'],
    },
    {
      id: 'ines', name: 'Ines', role: 'postmistress, keeps a goat', face: '👩', gives: 'milk',
      hello: '"Ines. Post office. And that\'s Marjorie, she\'s a goat. Anything you need to know about anyone on this lane, I\'ve probably got it."',
      door: { icon: '📮', title: 'The post office door', blurb: 'Open half the day. Something with horns is eating the noticeboard.' },
      seeds: ['courgette', 'broccoli', 'lettuce', 'leek'],
      keepsake: { icon: '📮', name: 'A postcard from nowhere', text: 'Addressed to "the cottage". No stamp. Ines says she found it. I believe her.', given: 'Ines brought round a postcard addressed to "the cottage", no stamp. I\'ve propped it on the shed shelf.' },
      likes: ['fritters', 'broccoli_bake', 'garden_salad', 'tomato_tart', 'nettle_soup', 'candied_nuts'],
      wants: [{ item: 'sunflower', n: 2 }, { item: 'courgette', n: 2 }, { item: 'lettuce', n: 2 }, { item: 'egg', n: 2 }, { item: 'broccoli', n: 2 }, { item: 'fritters', n: 1 }, { item: 'nettles', n: 2 }],
      chat: ['Ines knows everything about everyone. Now she knows a bit about me.', 'Ines\'s goat, Marjorie, ate the corner of my letter.', 'Ines had a parcel for me. It was just seeds, but still.', 'Ines closed the post office early so we could have a cup of tea.'],
      close: ['Ines told me something about somebody and then said, "but you won\'t pass that on." I won\'t.', 'Ines shut the post office at two and we walked Marjorie up the lane and back.', 'Ines says the lane took to me faster than it took to her. She has been here nineteen years.', 'Ines keeps my post behind the counter now instead of in the box. No reason given.'],
      thanks: ['"Well aren\'t you a treasure."', '"Marjorie says thank you. She doesn\'t, but I do."', '"I\'ll tell everyone. In a good way."'],
    },
    {
      id: 'poppy', name: 'Poppy', role: 'eight, lives with her gran, keeps hens', face: '👧', gives: 'egg',
      hello: '"I\'m Poppy and I\'m eight and I\'ve got eleven hens. Do you want to see them? You can see them."',
      door: { icon: '🚪', title: 'A small door with a drawing taped to it', blurb: 'Hens in the yard. Quite a lot of hens, actually, and shouting.' },
      seeds: ['strawberry', 'sweetcorn', 'pumpkin', 'beetroot'],
      keepsake: { icon: '🖍️', name: 'Poppy\'s drawing', text: 'My cottage, in crayon. The chimney is enormous. It is on the shed shelf forever now.', given: 'Poppy gave me a drawing of the cottage. The chimney is enormous. It\'s on the shed shelf forever now.' },
      likes: ['strawberry_jam', 'tomato_tart', 'pumpkin_pie', 'carrot_cake', 'apple_crumble', 'summer_pudding', 'candied_nuts'],
      wants: [{ item: 'strawberry', n: 2 }, { item: 'carrot', n: 1 }, { item: 'pumpkin', n: 1 }, { item: 'sweetcorn', n: 1 }, { item: 'honey', n: 1 }, { item: 'fish', n: 1 }, { item: 'berries', n: 3 }],
      chat: ['Poppy introduced me to every hen by name. There are eleven.', 'Poppy asked if I was old. I said a bit.', 'Poppy showed me a frog she has been keeping in a bucket. We let it go.', 'Poppy drew my cottage. The chimney is enormous.'],
      close: ['Poppy has named a hen after me. It is the loudest one. She says that is a compliment.', 'Poppy read to me. She is not very good at it yet and I did not say so.', 'Poppy asked if I was going to stay. I said yes, and she went off to tell a hen.', 'Poppy\'s gran waved at me from the window today. That took eight months.'],
      thanks: ['"YES. Thank you thank you thank you."', '"Gran! GRAN! Look!"', '"This is the best day. Well, second best."'],
    },
  ];

  const WEATHER = {
    sunny:  { icon: '☀️', name: 'Sunny' },
    cloudy: { icon: '☁️', name: 'Overcast' },
    rain:   { icon: '🌧️', name: 'Rain' },
    windy:  { icon: '🌬️', name: 'Windy' },
    heat:   { icon: '🔥', name: 'Heatwave' },
    frost:  { icon: '❄️', name: 'Frost' },
  };
  const WEATHER_TABLE = {
    Spring: [['sunny', 40], ['cloudy', 15], ['rain', 35], ['windy', 10]],
    Summer: [['sunny', 50], ['heat', 25], ['rain', 15], ['windy', 10]],
    Autumn: [['sunny', 25], ['cloudy', 20], ['rain', 30], ['windy', 25]],
    Winter: [['sunny', 20], ['cloudy', 20], ['frost', 30], ['rain', 15], ['windy', 15]],
  };

  const TIERS = [
    [90, 'Dear friend'], [70, 'Good friend'], [40, 'Friend'], [20, 'Nodding terms'], [0, 'Stranger'],
  ];

  // --------------------------------------------------------------- helpers

  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const uid = () => Date.now().toString(36) + rnd(1e6).toString(36);

  const tierOf = (f) => TIERS.find(([min]) => f >= min)[1];
  // Nobody counts the days somebody has been asking. They just know how long it's been going on.
  const waitWord = (left) => left > 6 ? 'no hurry about it' : left > 3 ? 'been asking a while' : left > 1 ? 'asking again' : 'about to give up on it';
  const waitLine = (left) => left > 6
    ? 'There is no hurry in the way they say it.'
    : left > 3 ? 'They have been asking a while now.'
      : left > 1 ? 'That is the second time of asking.'
        : 'They have very nearly stopped mentioning it.';
  const tierIndex = (f) => TIERS.findIndex(([min]) => f >= min);
  const itemName = (id) => (ITEMS[id] || RECIPES[id]).name;
  // Illustrations are printed into the page, not laid on it: everything drawn goes
  // through the same sepia plate. `ink` wraps a loose glyph so the filter can reach it.
  const ink = (glyph) => `<i class="ink-plate">${glyph}</i>`;
  const itemIcon = (id) => ink((ITEMS[id] || RECIPES[id]).icon);
  const plural = (n, id) => {
    const nm = itemName(id);
    if (n === 1 || RECIPES[id] || ITEMS[id]?.kind !== 'crop') return nm;
    if (/y$/.test(nm) && !/[aeiou]y$/.test(nm)) return nm.replace(/y$/, 'ies');
    if (/(s|x|ch|sh|o)$/.test(nm)) return nm + 'es';
    return nm + 's';
  };

  // ------------------------------------------------------------------ state

  let S = null;

  // What everyone is after on the day you move in. One you already have, one on the board,
  // a couple to grow, a couple to fetch from another neighbour.
  const STARTER_REQUESTS = {
    ada:    { item: 'strawberry', n: 3, left: 10 },
    tomas:  { item: 'potato',     n: 2, left: 7 },
    wren:   { item: 'lettuce',    n: 2, left: 8 },
    harold: { item: 'carrot',     n: 2, left: 9 },
    ines:   { item: 'egg',        n: 2, left: 8 },
    poppy:  { item: 'honey',      n: 1, left: 8 },
  };

  function freshState(name) {
    const folk = {};
    for (const f of FOLK) folk[f.id] = { friendship: 8, since: 3, request: { ...STARTER_REQUESTS[f.id] } };
    folk.poppy.friendship = 14;

    return {
      name: name || 'You',
      day: 1, season: 0, year: 1,
      weather: 'sunny',
      actions: 3, maxActions: 3,
      wellFed: false, ateToday: false,
      pantry: { potato: 3, flour: 1, egg: 1 },
      shelf: [],
      table: {},
      known: [...STARTER_RECIPES],
      pots: defaultPots(),
      sill: STARTER_PACKETS.map((crop) => ({ id: uid(), kind: 'seeds', crop, from: 'the last tenant', n: 1 })),
      folk,
      chatted: null,  // one proper sit-down a day, and that's your lot
      metToday: null, // and one new face a day, which is quite enough
      gifted: {},     // folk id -> how many things you've dropped round today
      coop: { open: false, hens: [], fed: false },
      apiary: { open: false, hives: [] },
      diary: [],
      stats: { dishes: 0, visits: 0, requests: 0, recipes: 0, picks: 0, walks: 0, dishFavours: 0, flowers: 0, eggs: 0, honey: 0 },
      flags: { fete: false, firstDish: false, keepsakes: {}, hello: false, greeted: {} },
    };
  }

  // Nothing gets sown without a packet, so the last tenant left three in the drawer.
  const STARTER_PACKETS = ['carrot', 'potato', 'tomato'];

  const emptyPot = () => ({ crop: null, progress: 0, dry: 1, wilted: false, picks: 0 });
  function defaultPots() {
    const pots = [];
    for (let i = 0; i < POT_START; i++) pots.push(emptyPot());
    pots[0] = { ...emptyPot(), crop: 'lettuce', progress: 1 };
    pots[1] = { ...emptyPot(), crop: 'strawberry', progress: 0 };
    return pots;
  }
  // How many pots the shelf has earned, given what is written in the cookbook.
  const potsFor = (known) => clamp(POT_START + Math.floor((known - STARTER_RECIPES.length) / POTS_PER_RECIPE), POT_START, POT_MAX);
  const potTarget = () => potsFor(S.known.length);

  // Older diaries (before the shed and the chopping board, or with a garden and a fence) get tidied up.
  function migrate(s) {
    if (!Array.isArray(s.known)) s.known = [...new Set([...STARTER_RECIPES, ...(s.shelf || [])])];
    if (!Array.isArray(s.sill)) s.sill = [];
    for (const o of s.sill) if (!o.id) o.id = uid();
    if (!Array.isArray(s.pots)) s.pots = defaultPots();
    while (s.pots.length < potsFor(s.known.length)) s.pots.push(emptyPot());
    if (!s.table || typeof s.table !== 'object') s.table = {};
    delete s.can; // the can used to hold five pours and fill overnight; now it just pours
    if (!s.stats) s.stats = { dishes: 0, visits: 0, requests: 0 };
    if (s.stats.recipes == null) s.stats.recipes = 0;
    if (s.stats.picks == null) s.stats.picks = 0;
    for (const k of ['dishFavours', 'flowers', 'eggs', 'honey']) if (s.stats[k] == null) s.stats[k] = 0;
    if (!s.flags) s.flags = { fete: false, firstDish: false };
    if (!s.flags.keepsakes) s.flags.keepsakes = {};
    if (s.flags.hello == null) s.flags.hello = true; // they moved in before there was a hello to say
    if (!s.flags.greeted) s.flags.greeted = {};
    if (s.chatted === undefined) s.chatted = null;
    if (s.metToday === undefined) s.metToday = null;
    if (!s.gifted) s.gifted = {};
    if (!s.coop || typeof s.coop !== 'object') s.coop = { open: false, hens: [], fed: false };
    if (!Array.isArray(s.coop.hens)) s.coop.hens = [];
    if (!s.apiary || typeof s.apiary !== 'object') s.apiary = { open: false, hives: [] };
    if (!Array.isArray(s.apiary.hives)) s.apiary.hives = [];
    // old boards are full of ticked-off request notes; they have done their job
    s.sill = s.sill.filter((o) => !(o.kind === 'note' && o.req && o.done));
    if (s.stats.walks == null) s.stats.walks = 0;
    // seed packets stack by crop now, and nothing can be sown without one
    const packets = new Map();
    s.sill = s.sill.filter((o) => {
      if (o.kind !== 'seeds') return true;
      const have = packets.get(o.crop);
      if (have) { have.n = (have.n || 1) + (o.n || 1); return false; }
      o.n = o.n || 1;
      packets.set(o.crop, o);
      return true;
    });
    for (const p of s.pots) delete p.boost;
    if (!packets.size) for (const crop of STARTER_PACKETS) s.sill.push({ id: uid(), kind: 'seeds', crop, from: 'the drawer', n: 1 });
    // a diary from before the doors were clickable had already done the round of hellos
    if (s.flags.hello) for (const f of FOLK) if (s.flags.greeted[f.id] == null) s.flags.greeted[f.id] = true;
    // the garden and the fence are gone, and so are the nails that mended it
    delete s.beds;
    delete s.fence;
    if (s.pantry) delete s.pantry.nails;
    for (const st of Object.values(s.folk)) if (st.request && !ITEMS[st.request.item] && !RECIPES[st.request.item]) st.request = null;
    return s;
  }

  const seasonName = () => SEASONS[S.season];
  const dayLabel = () => `${seasonName()}, day ${S.day}`;

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode etc. */ }
  }
  function load() {
    for (const key of [SAVE_KEY, ...OLD_KEYS]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const s = JSON.parse(raw);
        if (s && s.folk && s.pantry) return migrate(s);
      } catch (e) { /* corrupt or private mode; try the next one */ }
    }
    return null;
  }

  // What happens is said once in the corner and then it goes -- but it is also written
  // down. S.diary is the book you can actually sit and read, so it keeps a good season
  // and a half of days rather than the last handful of lines.
  const DIARY_MAX = 500;
  function diary(text, cls) {
    S.diary.push({ t: text, c: cls || '' });
    if (S.diary.length > DIARY_MAX) S.diary.splice(0, S.diary.length - DIARY_MAX);
    logLine(text, cls);
  }
  function diaryDay() {
    const w = WEATHER[S.weather];
    S.diary.push({ day: dayLabel(), w: S.weather });
    logLine(`${dayLabel()} · ${w.icon} ${w.name}`, 'day');
  }

  // The diary, read back. Each day is one paragraph in your own hand, because that is
  // what a day is -- not a list of things that scored.
  function openDiary() {
    const days = [];
    for (const e of S.diary) {
      if (e.day) days.push({ label: e.day, w: e.w, lines: [] });
      else if (days.length) days[days.length - 1].lines.push(e.t);
    }
    let html = `<h2>The diary</h2>
      <p class="lead ink">${esc(S.name)}, at the cottage. ${days.length ? `The last ${days.length === 1 ? 'day' : `${days.length} days`} of it, anyway — the earlier pages have gone soft at the corners.` : 'Nothing written down yet.'}</p>
      <div class="diary-book">`;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      const w = WEATHER[d.w];
      html += `<section class="diary-day${i === days.length - 1 ? ' today' : ''}">
        <h3>${esc(d.label)}${w ? ` <span class="wx">${ink(w.icon)} ${esc(w.name.toLowerCase())}</span>` : ''}</h3>
        ${d.lines.length ? `<p>${d.lines.map(esc).join(' ')}</p>` : '<p class="quiet">A day where nothing much was written down.</p>'}
      </section>`;
    }
    html += `</div><div class="foot"><button class="primary" id="sheet-cancel">Close the book</button></div>`;
    openSheet(html);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  const LOG_MAX = 4;
  function logLine(text, cls) {
    const el = $('log');
    const line = document.createElement('div');
    line.className = `log-line ${cls || ''}`;
    line.textContent = text;
    el.appendChild(line);
    while (el.children.length > LOG_MAX) el.firstChild.remove();
    setTimeout(() => {
      line.classList.add('out');
      setTimeout(() => line.remove(), 500);
    }, cls === 'day' ? 9000 : 7000);
  }
  function toast(msg) { logLine(msg, 'toast'); }

  function spend() {
    S.actions -= 1;
  }
  function canAct() {
    if (S.actions <= 0) { toast('Nothing left in you today. Go to bed.'); return false; }
    return true;
  }

  function addItem(id, n) { S.pantry[id] = (S.pantry[id] || 0) + n; }
  function hasItems(needs) {
    return Object.entries(needs).every(([id, n]) => (S.pantry[id] || 0) >= n);
  }
  function takeItems(needs) {
    for (const [id, n] of Object.entries(needs)) {
      S.pantry[id] -= n;
      if (S.pantry[id] <= 0) delete S.pantry[id];
    }
  }
  // "3 carrots", but "an onion soup" — nobody asks for 1 onion soup.
  function askText(req) {
    if (!RECIPES[req.item]) return `${req.n} ${plural(req.n, req.item).toLowerCase()}`;
    const nm = RECIPES[req.item].name.toLowerCase();
    return `${/^[aeiou]/.test(nm) ? 'an' : 'a'} ${nm}`;
  }

  function haveRequestItem(req) {
    if (RECIPES[req.item]) return S.shelf.includes(req.item);
    return (S.pantry[req.item] || 0) >= req.n;
  }

  function seasonalRecipes() {
    return Object.keys(RECIPES).filter((id) => RECIPES[id].seasons.includes(seasonName()));
  }

  function bumpFriendship(id, amount) {
    const f = S.folk[id];
    const before = tierIndex(f.friendship);
    f.friendship = clamp(f.friendship + amount, 0, 100);
    const after = tierIndex(f.friendship);
    const who = FOLK.find((x) => x.id === id);
    if (after < before) {
      diary(`${who.name} and I are on ${tierOf(f.friendship).toLowerCase().replace(/ terms$/, '')} terms now.`, 'warm');
    }
    // Good friends leave you something for the shed shelf. Once.
    if (amount > 0 && f.friendship >= 70 && !S.flags.keepsakes[id]) {
      S.flags.keepsakes[id] = true;
      const k = who.keepsake;
      sillAdd({ kind: 'keepsake', from: who.name, icon: k.icon, name: k.name, text: k.text });
      diary(k.given, 'warm');
    }
  }

  // ------------------------------------------------------------------ shed
  // Plans and presents live on the shed pinboard as little objects: notes, recipe
  // cards and keepsakes. They can be picked up and put down elsewhere. Seed packets
  // are in the same list but they are not on the board — they are out on the table,
  // by the pots, which is where you would actually leave them.
  // (The state and the ids still say `sill` — the pinboard predates the shed.)

  let held = null;    // index of the board item currently in hand (click to place)
  let dragIdx = null; // index being dragged with the mouse

  function sillAdd(obj) { obj.id = uid(); S.sill.push(obj); return obj; }
  // Move item `from` so it sits before the item that was at `before` (S.sill.length = the end).
  function sillMove(from, before) {
    if (from < 0 || from >= S.sill.length) return;
    const [it] = S.sill.splice(from, 1);
    const dest = before > from ? before - 1 : before;
    S.sill.splice(clamp(dest, 0, S.sill.length), 0, it);
  }
  // The live (unticked) note pinned for a neighbour's request, if any.
  function noteFor(folkId) { return S.sill.find((o) => o.kind === 'note' && o.req === folkId && !o.done); }
  // Notes pin themselves: the moment someone tells you what they're after, it's on the board.
  function pinNote(folkId) {
    const st = S.folk[folkId];
    if (!st || !st.request || !S.flags.greeted[folkId] || noteFor(folkId)) return null;
    const f = FOLK.find((x) => x.id === folkId);
    const req = st.request;
    return sillAdd({ kind: 'note', text: `${f.name} — ${askText(req)}`, req: folkId, done: false });
  }
  function pinAllNotes() { for (const f of FOLK) pinNote(f.id); }

  function learnRecipe(id, from) {
    if (S.known.includes(id)) return false;
    S.known.push(id);
    S.stats.recipes += 1;
    if (from) sillAdd({ kind: 'recipe', recipe: id, from: from.name });
    checkPots();
    return true;
  }
  // A new page in the book, and sooner or later somewhere to grow what it asks for.
  function checkPots() {
    let added = 0;
    while (S.pots.length < potTarget()) { S.pots.push(emptyPot()); added += 1; }
    if (added) {
      diary(added === 1
        ? `Shifted things along the shed shelf and found room for another pot. ${S.pots.length} of them now.`
        : `Made room on the shelf for ${added} more pots. ${S.pots.length} of them now.`, 'warm');
    }
    return added;
  }
  // Packets stack by crop so the table doesn't silt up with a hundred paper twists.
  function addSeeds(crop, from) {
    const have = S.sill.find((o) => o.kind === 'seeds' && o.crop === crop);
    if (have) { have.n = (have.n || 1) + 1; return have; }
    return sillAdd({ kind: 'seeds', crop, from, n: 1 });
  }
  function takeSeeds(packet) {
    packet.n = (packet.n || 1) - 1;
    if (packet.n <= 0) S.sill.splice(S.sill.indexOf(packet), 1);
  }
  const packetFor = (crop) => S.sill.find((o) => o.kind === 'seeds' && o.crop === crop);
  const anyPackets = () => S.sill.filter((o) => o.kind === 'seeds');
  // Null when there is nothing they grow that you haven't already got seed for —
  // the caller finds you something else, so the board doesn't fill up with paper.
  function giveSeeds(f) {
    const fresh = f.seeds.filter((c) => !packetFor(c));
    if (!fresh.length) return null;
    const crop = pick(fresh);
    addSeeds(crop, f.name);
    return crop;
  }

  // ------------------------------------------------------------ potted plants
  // Pots on the shed shelf, in the light off the window. Under cover, so anything grows in
  // any season, one thing per pick, and it grows back from half-way. Watering is by hand,
  // with the can. Picking is free. The shelf gains a pot every few recipes you learn.

  const potRipe = (p) => !!p.crop && !p.wilted && p.progress >= ITEMS[p.crop].days;
  const regrowDays = (id) => Math.ceil(ITEMS[id].days / 2);
  const yieldRange = (id) => ITEMS[id].yield;
  const yieldOf = (id) => { const [lo, hi] = ITEMS[id].yield; return lo + rnd(hi - lo + 1); };
  const emptyPots = () => S.pots.filter((p) => !p.crop).length;

  function takeCan() {
    if (held === 'can') { held = null; render(); return; }
    held = 'can';
    closeWindow();
    render();
    toast('Got the can. Click a pot.');
  }

  function waterPot(i) {
    const p = S.pots[i];
    if (!p.crop) { toast('An empty pot. Nothing in it to water.'); return; }
    const c = ITEMS[p.crop];
    if (p.dry === 0) { toast(`The ${c.name.toLowerCase()} has had its drink already.`); return; }
    p.dry = 0;
    if (p.wilted) {
      p.wilted = false;
      p.progress = Math.max(0, p.progress - 1);
      diary(`Watered the wilted ${c.name.toLowerCase()} in the shed. It perked up by teatime, mostly.`);
    }
    toast(pick(['Glug.', 'Glug glug.', 'A good drink.']));
    save();
    render();
  }

  function pickPot(i) {
    const p = S.pots[i];
    const c = ITEMS[p.crop];
    const n = yieldOf(p.crop);
    addItem(p.crop, n);
    p.progress = c.days - regrowDays(p.crop);
    p.picks += 1;
    S.stats.picks += 1;
    if (FLOWERING.includes(p.crop)) S.stats.flowers += 1;
    // A plant keeps you in its own seed — but only while you haven't got a packet of it
    // already, or the board silts up with paper and seed stops being worth anything.
    let extra = '';
    if (Math.random() < (packetFor(p.crop) ? 0.07 : 0.7)) {
      addSeeds(p.crop, 'the shed');
      extra = ' Saved the seed in a twist of paper, too.';
    }
    diary(`Picked ${n === 1 ? 'a' : n} ${plural(n, p.crop).toLowerCase()} off the shed ${c.name.toLowerCase()}.${extra}`, 'good');
    toast(`${c.icon} ${n === 1 ? 'One' : n} ${plural(n, p.crop).toLowerCase()} into the pantry.`);
    checkUnlocks();
    save();
    render();
  }

  function potClick(i) {
    if (held === 'can') { waterPot(i); return; }
    if (typeof held === 'number') { toast('Put that down first.'); return; }
    const p = S.pots[i];
    if (!p.crop) { openPotSowSheet(i); return; }
    if (potRipe(p)) { pickPot(i); return; }
    openPotSheet(i);
  }

  // Nothing goes in a pot without a packet off the table. Seed is the thing you're short of.
  function sowPot(i, packet) {
    if (!canAct()) return false;
    const id = packet.crop;
    const c = ITEMS[id];
    S.pots[i] = { ...emptyPot(), crop: id, dry: 0 };
    // old diaries say greenhouse, older ones still say windowsill
    const own = packet.from === 'the shed' || packet.from === 'the greenhouse' || packet.from === 'the windowsill';
    takeSeeds(packet);
    spend();
    diary(own
      ? `Potted up my own saved ${c.name.toLowerCase()} seed. ${c.days} days, if I remember to water it.`
      : `Sowed the ${c.name.toLowerCase()} seed from ${packet.from}. ${c.days} days, if I remember to water it.`);
    finishAction();
    return true;
  }

  function openPotSowSheet(i) {
    const packets = anyPackets();
    let html = `<h2>An empty pot</h2><p>Anything grows indoors, whatever the season — but only from seed you've got. Sowing takes an action; watering and picking are free.</p>`;
    if (!packets.length) {
      html += `<p class="ink">No seed packets on the table. Seed comes from three places: saved off your own plants when you pick them, handed over by a neighbour whose favour you've done, and found along the lane.</p>`;
    }
    html += `<div class="options">`;
    for (const p of packets) {
      const c = ITEMS[p.crop];
      const [lo, hi] = yieldRange(p.crop);
      html += `<button class="opt packet" data-packet="${p.id}">
        <span class="icon">${c.icon}</span>
        <span><span class="t">${c.name}${(p.n || 1) > 1 ? ` <span class="tiny-tag">×${p.n}</span>` : ''}</span><br><span class="d">from ${esc(p.from)} · ${c.days} days to the first pick, then every ${regrowDays(p.crop)} · ${lo === hi ? lo : `${lo}–${hi}`} per pick</span></span>
        <span class="r good">1 action</span></button>`;
    }
    html += `</div><div class="foot"><button id="sheet-cancel">Never mind</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-packet]').forEach((btn) => btn.addEventListener('click', () => {
      const p = S.sill.find((o) => o.id === btn.dataset.packet);
      if (p && sowPot(i, p)) closeSheet();
    }));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function openPotSheet(i) {
    const p = S.pots[i];
    const c = ITEMS[p.crop];
    const left = c.days - p.progress;
    const growth = p.wilted
      ? 'Wilted and sulking. Water it and it will come back, a day behind.'
      : `Growing. ${left} day${left === 1 ? '' : 's'} until ${p.picks ? 'the next pick' : 'the first pick'}.`;
    const water = p.dry === 0 ? 'Watered today.' : p.dry === 1 ? 'Fine for now. Water it tomorrow.' : 'Thirsty. It will wilt tonight without a drink.';
    openSheet(`<h2>${c.icon} ${c.name}</h2>
      <p class="ink">${growth}</p><p>${water}${p.picks ? ` Picked ${p.picks} time${p.picks === 1 ? '' : 's'} so far.` : ''} Pick up the watering can and click the pot to water it.</p>
      <div class="foot"><button id="pot-pull">Pull it out</button><button class="primary" id="sheet-cancel">Leave it</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('pot-pull').addEventListener('click', () => {
      diary(`Pulled the ${c.name.toLowerCase()} out of its pot. Fresh start.`);
      S.pots[i] = emptyPot();
      closeSheet();
      save();
      render();
    });
  }

  function renderPots() {
    const carrying = held === 'can';
    document.body.classList.toggle('carrying', carrying);
    $('pots').innerHTML = S.pots.map((p, i) => {
      if (!p.crop) return `<button class="pot empty" data-pot="${i}" title="An empty pot. Click to sow something."><span class="plant">＋</span><span class="pot-body"><i class="soil"></i></span><span class="pot-name">empty</span><span class="pot-state">sow</span></button>`;
      const c = ITEMS[p.crop];
      const ripe = potRipe(p);
      const frac = p.progress / c.days;
      const stage = ripe ? 3 : frac >= 0.66 ? 2 : frac >= 0.33 ? 1 : 0;
      const plant = stage === 0 ? '🌱' : stage === 1 ? '🌿' : c.icon;
      const wet = p.dry === 0 ? 'wet' : p.dry === 1 ? 'fine' : p.dry === 2 ? 'thirsty' : 'parched';
      const left = c.days - p.progress;
      const state = p.wilted ? 'wilted' : ripe ? 'pick me' : p.dry >= 2 ? 'thirsty' : `${left}d to go`;
      const title = p.wilted ? `${c.name}, wilted. Water it.` : ripe ? `${c.name}, ready. Click to pick.` : `${c.name}, ${left} day${left === 1 ? '' : 's'} to go. Soil ${wet === 'wet' ? 'watered' : wet}.`;
      return `<button class="pot stage-${stage} ${wet}${p.wilted ? ' wilted' : ''}${ripe ? ' ripe' : ''}" data-pot="${i}" title="${title}">
        <span class="plant">${plant}</span><span class="pot-body"><i class="soil"></i></span>
        <span class="pot-name">${c.name}</span><span class="pot-state">${state}</span></button>`;
    }).join('');
    $('pots').querySelectorAll('[data-pot]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); potClick(Number(el.dataset.pot)); }));
    const can = $('can');
    can.classList.toggle('lifted', carrying);
    can.title = carrying ? 'Put the can down' : 'Watering can. Click to pick it up.';
  }

  // --------------------------------------------------------- the chopping board
  // Put two or three things off the counter on the board and see what they make.

  function matchRecipe(t) {
    const keys = Object.keys(t);
    if (!keys.length) return null;
    return Object.keys(RECIPES).find((id) => {
      const n = RECIPES[id].needs;
      const nk = Object.keys(n);
      return nk.length === keys.length && nk.every((k) => t[k] === n[k]);
    }) || null;
  }
  function nearlyRecipe(t) {
    return Object.keys(RECIPES).some((id) => {
      const n = RECIPES[id].needs;
      return Object.entries(t).every(([k, v]) => (n[k] || 0) >= v);
    });
  }
  function tableAdd(id) {
    const have = S.pantry[id] || 0;
    const on = S.table[id] || 0;
    if (on >= have) { toast(`That's all the ${plural(2, id).toLowerCase()} you've got.`); return; }
    if (!on && Object.keys(S.table).length >= TABLE_SLOTS) { toast('Only three places on the board.'); return; }
    S.table[id] = on + 1;
    save();
    render();
  }
  function tableTake(id) {
    if (!S.table[id]) return;
    S.table[id] -= 1;
    if (S.table[id] <= 0) delete S.table[id];
    save();
    render();
  }
  function tableMake() {
    const ids = Object.keys(S.table);
    if (!ids.length) { toast('Nothing on the board yet. Click something on the counter.'); return; }
    if (!canAct()) return;
    if (S.shelf.length >= SHELF_MAX) { toast('No room on the table for another dish. Eat something or give it away.'); return; }
    if (!hasItems(S.table)) { toast('The pantry has less than the table thinks.'); return; }
    const id = matchRecipe(S.table);
    if (!id) {
      toast(nearlyRecipe(S.table)
        ? pick(['Nearly. It wants something else with it.', 'Close. Something is missing, or there\'s too much of one thing.'])
        : pick(['That doesn\'t go together. Not yet, anyway.', 'Stared at it for a bit. It isn\'t anything.', 'Hm. No. Put it back.']));
      return;
    }
    const discovered = learnRecipe(id, null);
    if (discovered) diary(`Put ${needsText(S.table)} together to see what happened. It's ${RECIPES[id].name.toLowerCase()}. Wrote it in the back of the cookbook.`, 'warm');
    cookRecipe(id, discovered ? 'table' : 'table-known');
  }
  function needsText(needs) {
    return Object.entries(needs).map(([iid, n]) => `${n} ${plural(n, iid).toLowerCase()}`).join(', ').replace(/, ([^,]*)$/, ' and $1');
  }
  function cookRecipe(id, how) {
    const r = RECIPES[id];
    takeItems(r.needs);
    S.shelf.push(id);
    S.stats.dishes += 1;
    S.table = {};
    spend();
    if (how === 'table-known') diary(pick([`Made ${r.name.toLowerCase()} at the table, by eye. Didn't need the book.`, `${r.name} from memory. The kitchen smells right.`]), 'good');
    else if (how !== 'table') diary(pick([`Made ${r.name.toLowerCase()}. The kitchen smells right.`, `${r.name} on the shelf. Burnt the first attempt, but only a bit.`, `Cooked ${r.name.toLowerCase()} with the radio on.`]), 'good');
    if (!S.flags.firstDish) { S.flags.firstDish = true; diary('First thing cooked in this kitchen. It counts.', 'warm'); }
    finishAction();
  }

  // ------------------------------------------------ the table, drawn out on it
  // The pantry stands along the back of the table rather than behind a cupboard door,
  // and the board in front of you has three places on it. Click a thing to put it in
  // the first free place, or drag it into a particular one.

  let dragItem = null; // pantry id being dragged from the counter to the board

  function renderCounter() {
    const ids = Object.keys(S.pantry)
      .filter((id) => ITEMS[id])
      .sort((a, b) => (ITEMS[a].kind > ITEMS[b].kind ? 1 : ITEMS[a].kind < ITEMS[b].kind ? -1 : ITEMS[a].name.localeCompare(ITEMS[b].name)));
    const el = $('pantry');
    el.innerHTML = ids.length
      ? ids.map((id) => {
        const it = ITEMS[id];
        const left = S.pantry[id] - (S.table[id] || 0);
        const title = left
          ? `${it.name} \u00b7 ${left} in the house. Click to put one on the board, or drag it onto a place.`
          : `Every ${it.name.toLowerCase()} you have is on the board.`;
        return `<button class="counter-item ${it.kind}${left ? '' : ' spent'}" data-put="${id}" draggable="${left ? 'true' : 'false'}" title="${esc(title)}" ${left ? '' : 'disabled'}>
          <span class="ico">${it.icon}</span><span class="nm">${esc(it.name)}</span><span class="n">${left}</span></button>`;
      }).join('')
      : '<span class="counter-empty">Bare counter.</span>';
    el.querySelectorAll('[data-put]').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); tableAdd(b.dataset.put); });
      b.addEventListener('dragstart', (e) => {
        dragItem = b.dataset.put;
        b.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'copy';
        try { e.dataTransfer.setData('text/plain', b.dataset.put); } catch (_) { /* old browsers */ }
      });
      b.addEventListener('dragend', () => {
        dragItem = null;
        b.classList.remove('dragging');
        document.querySelectorAll('.slot.over').forEach((x) => x.classList.remove('over'));
      });
    });
  }

  function renderSlots() {
    const tIds = Object.keys(S.table);
    let html = '';
    for (let i = 0; i < TABLE_SLOTS; i++) {
      const id = tIds[i];
      html += id
        ? `<button class="slot filled" data-take="${id}" title="${esc(ITEMS[id].name)}${S.table[id] > 1 ? ` \u00d7${S.table[id]}` : ''} \u2014 click to put one back on the counter"><span class="icon">${ITEMS[id].icon}</span>${S.table[id] > 1 ? `<span class="x">\u00d7${S.table[id]}</span>` : ''}</button>`
        : '<span class="slot empty" title="An empty place on the board"></span>';
    }
    const el = $('table-slots');
    el.innerHTML = html;
    el.querySelectorAll('[data-take]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); tableTake(b.dataset.take); }));
    el.querySelectorAll('.slot').forEach((sl) => {
      sl.addEventListener('dragover', (e) => { if (!dragItem) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; sl.classList.add('over'); });
      sl.addEventListener('dragleave', () => sl.classList.remove('over'));
      sl.addEventListener('drop', (e) => {
        if (!dragItem) return;
        e.preventDefault();
        e.stopPropagation();
        const id = dragItem;
        dragItem = null;
        tableAdd(id);
      });
    });

    const match = matchRecipe(S.table);
    const known = match && S.known.includes(match);
    const mk = $('btn-make');
    mk.disabled = S.actions <= 0 || !tIds.length;
    mk.classList.toggle('ready', !!known && S.actions > 0);
    mk.title = !tIds.length
      ? 'Put two or three things from the counter on the board first.'
      : S.actions <= 0 ? 'Nothing left in the day for cooking.'
        : known ? `Make ${RECIPES[match].name.toLowerCase()} \u00b7 1 action`
          : 'See what those make together \u00b7 1 action if it is anything';
  }

  // Along the back of the table with the pantry: whatever you have cooked, stood where you left it.
  function renderDishes() {
    const el = $('dishes');
    el.innerHTML = S.shelf.length
      ? S.shelf.map((id, i) => `<button class="dish${S.ateToday ? '' : ' fresh'}" data-dish="${i}" title="${esc(RECIPES[id].name)}${S.ateToday ? ', and you have already eaten today' : ' \u2014 click to eat it'}">
          <span class="icon">${RECIPES[id].icon}</span><span class="nm">${esc(RECIPES[id].name)}</span></button>`).join('')
      : '';
    el.querySelectorAll('[data-dish]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openDishSheet(Number(b.dataset.dish)); }));
  }

  function openDishSheet(i) {
    const id = S.shelf[i];
    if (!id) return;
    const r = RECIPES[id];
    const fans = FOLK.filter((f) => f.likes.includes(id) && S.flags.greeted[f.id]).map((f) => f.name).join(', ');
    openSheet(`<h2>${ink(r.icon)} ${esc(r.name)}</h2>
      <p class="ink">Stood on the table, keeping. ${fans ? `${esc(fans)} would be glad of it \u2014 take it round, it costs nothing.` : 'Take it round to somebody, or eat it yourself.'}</p>
      <p>${S.ateToday ? 'You have eaten today already. Tomorrow, then.' : 'Eating is free, once a day, and tomorrow has room for a fourth thing.'}</p>
      <div class="foot"><button id="sheet-cancel">Leave it there</button><button class="primary" id="dish-eat" ${S.ateToday ? 'disabled' : ''}>Eat it</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('dish-eat').addEventListener('click', () => { closeSheet(); eatDish(i); });
  }

  // Seed packets sit out on the table, and only when there is seed to sit there.
  function renderPackets() {
    const el = $('packets');
    let html = '';
    let k = 0;
    S.sill.forEach((o, i) => {
      if (o.kind !== 'seeds') return;
      const c = ITEMS[o.crop];
      const n = o.n || 1;
      html += `<button class="packet" data-packet-at="${i}" style="--tilt:${((k * 5) % 7) - 3}deg" title="${esc(c.name)} seed from ${esc(o.from)}${n > 1 ? `, ${n} packets` : ''}">
        <span class="ico">${c.icon}</span><span class="lbl">${esc(c.name.toLowerCase())}</span>${n > 1 ? `<span class="count">\u00d7${n}</span>` : ''}</button>`;
      k += 1;
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-packet-at]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openSillItem(Number(b.dataset.packetAt)); }));
  }

  // --------------------------------------------------------------- actions

  function openCookSheet() {
    const seasonal = seasonalRecipes();
    const known = S.known.filter((id) => seasonal.includes(id)).concat(S.known.filter((id) => !seasonal.includes(id)));
    const unknown = Object.keys(RECIPES).filter((id) => !S.known.includes(id));
    const total = Object.keys(RECIPES).length;
    let html = `<h2>The cookbook</h2><p>${S.known.length} of ${total} recipes written in. Cooking one takes an action. Eating a dish is free, and tomorrow you will have energy for a fourth thing.</p><div class="options">`;
    for (const id of known) {
      const r = RECIPES[id];
      const ok = hasItems(r.needs);
      const needs = Object.entries(r.needs).map(([iid, n]) => {
        const have = S.pantry[iid] || 0;
        return `<span class="${have >= n ? 'have' : 'missing'}">${ink(ITEMS[iid].icon)} ${have}/${n}</span>`;
      }).join(' · ');
      const fans = FOLK.filter((f) => f.likes.includes(id)).map((f) => f.name).join(', ');
      const off = !seasonal.includes(id);
      html += `<button class="opt ${off ? 'off-season' : ''}" data-recipe="${id}" ${ok ? '' : 'disabled'}>
        <span class="icon">${r.icon}</span>
        <span><span class="t">${r.name}</span><br><span class="d">${needs}${fans ? ` &nbsp;·&nbsp; loved by ${fans}` : ''}${off ? ' &nbsp;·&nbsp; not this season\'s page, but it keeps' : ''}</span></span>
        <span class="r ${ok ? 'good' : ''}">${ok ? 'cook' : 'short'}</span>
      </button>`;
    }
    html += '</div>';
    if (unknown.length) {
      html += `<h3>Pages still blank</h3><p>Neighbours share a recipe when you bring them what they asked for. Or put things together on the chopping board and see.</p><div class="options">`;
      for (const id of unknown) {
        const r = RECIPES[id];
        const teachers = FOLK.filter((f) => f.likes.includes(id)).map((f) => f.name);
        const who = teachers.length ? `${teachers.slice(0, -1).join(', ')}${teachers.length > 1 ? ' or ' : ''}${teachers[teachers.length - 1]} might share it` : 'Somebody in the village knows it';
        html += `<div class="opt unknown"><span class="icon">📜</span><span><span class="t">${r.name}</span><br><span class="d">${who} · ${Object.keys(r.needs).length} things</span></span><span class="r">?</span></div>`;
      }
      html += '</div>';
    }
    html += `<div class="foot"><button id="sheet-cancel">Close the book</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-recipe]').forEach((btn) => btn.addEventListener('click', () => {
      if (!canAct()) return;
      if (S.shelf.length >= SHELF_MAX) { toast('No room on the table for another dish. Eat something or give it away.'); return; }
      closeSheet();
      cookRecipe(btn.dataset.recipe, 'book');
    }));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function eatDish(idx) {
    if (S.ateToday) { toast('Already had a proper meal today.'); return; }
    const id = S.shelf.splice(idx, 1)[0];
    S.ateToday = true;
    S.wellFed = true;
    diary(`Ate the ${RECIPES[id].name.toLowerCase()} at the table like a civilised person. Feel like I could do more tomorrow.`, 'warm');
    save();
    render();
  }

  // A visit is two different things now. Sitting down with somebody is the day's one chat,
  // and it costs an action. Handing over a thing you happen to have does not — you can go
  // round with a bag of potatoes as often as you like, they just stop being impressed.
  function openVisitSheet(id) {
    if (!S.flags.greeted[id]) { openHelloSheet(id); return; }
    const f = FOLK.find((x) => x.id === id);
    const st = S.folk[id];
    const req = st.request;
    const already = S.gifted[id] || 0;
    let html = `<h2>${ink(f.face)} ${f.name}</h2><p>${esc(f.role)} · ${tierOf(st.friendship).toLowerCase()}</p>`;
    if (req) {
      const have = haveRequestItem(req);
      html += `<div class="speech">"${reqLine(f, req)}"</div>`;
      html += `<p>${have ? 'You have what they need, as it happens.' : `Not something you have on you. ${waitLine(req.left)}`}</p>`;
    }
    html += `<div class="options">`;

    const chatBlock = S.chatted === id ? 'You have already sat down with them today.'
      : S.chatted ? `Today's chat went to ${FOLK.find((x) => x.id === S.chatted).name}. There's only one of you.`
        : S.actions <= 0 ? 'Nothing left in you today.' : '';
    html += `<button class="opt" data-visit="chat" ${chatBlock ? 'disabled' : ''}>
      <span class="icon">☕</span>
      <span><span class="t">Stop for a chat</span><br><span class="d">${chatBlock || `One sit-down a day, with one person. They will likely send you home with ${ITEMS[f.gives].name.toLowerCase()}.`}</span></span>
      <span class="r">${chatBlock ? '—' : 'an afternoon'}</span></button>`;

    if (req && haveRequestItem(req)) {
      html += `<button class="opt" data-visit="fulfil">
        <span class="icon">${itemIcon(req.item)}</span>
        <span><span class="t">Bring what they asked for</span><br><span class="d">${askText(req)} · they give ${ITEMS[f.gives].name.toLowerCase()} back, and often a recipe card or seed for the shed</span></span>
        <span class="r good">over the gate</span></button>`;
    }
    S.shelf.forEach((dish, i) => {
      const liked = f.likes.includes(dish);
      const v = giftValue(f, dish, already);
      html += `<button class="opt" data-visit="gift" data-dish="${i}">
        <span class="icon">${RECIPES[dish].icon}</span>
        <span><span class="t">Bring the ${RECIPES[dish].name.toLowerCase()}</span><br><span class="d">${liked ? 'One of their favourites.' : 'A kind thought.'}${v ? '' : ' They have had plenty off you today.'}</span></span>
        <span class="r ${v ? 'good' : ''}">${v ? 'over the gate' : 'if you like'}</span></button>`;
    });
    html += `</div>`;

    const spare = Object.keys(S.pantry).filter((k) => S.pantry[k] > 0);
    if (spare.length) {
      html += `<h3>Out of the pantry</h3>
        <p>Hand over anything you are not using — free, as often as you like. ${already ? `They have taken ${already} thing${already === 1 ? '' : 's'} off you today, so the next one counts for less.` : 'The first thing of the day counts for most.'}</p>
        <div class="chips gift-chips">`;
      for (const iid of spare.sort((a, b) => giftValue(f, b, already) - giftValue(f, a, already))) {
        const v = giftValue(f, iid, already);
        html += `<button class="chip ${ITEMS[iid].kind}${v >= 6 ? ' wanted' : ''}${v ? '' : ' plenty'}" data-give="${iid}" title="${v >= 6 ? `${f.name} would be glad of that` : v ? `${f.name} would take it kindly` : `${f.name} will take it, but they have had plenty off you today`}">
          ${ink(ITEMS[iid].icon)} ${ITEMS[iid].name} <b>${S.pantry[iid]}</b>${v >= 6 ? ' <em>✦</em>' : ''}</button>`;
      }
      html += `</div>`;
    }

    html += `<div class="foot"><button class="primary" id="sheet-cancel">${already || S.chatted === id ? 'Head home' : 'Not today'}</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-visit]').forEach((btn) => btn.addEventListener('click', () => {
      visit(id, btn.dataset.visit, btn.dataset.dish);
    }));
    $('sheet').querySelectorAll('[data-give]').forEach((btn) => btn.addEventListener('click', () => {
      giveItem(id, btn.dataset.give);
    }));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  // What a thing is worth to somebody, given how much they have already had off you today.
  function giftValue(f, id, already) {
    const n = already == null ? (S.gifted[f.id] || 0) : already;
    const base = RECIPES[id]
      ? (f.likes.includes(id) ? 20 : 12)
      : id === f.gives ? 1
        : f.wants.some((w) => w.item === id) ? 6 : 3;
    return Math.floor(base / (n + 1));
  }

  function giveItem(id, iid) {
    if (!(S.pantry[iid] > 0)) return;
    const f = FOLK.find((x) => x.id === id);
    const st = S.folk[id];
    const v = giftValue(f, iid);
    takeItems({ [iid]: 1 });
    S.gifted[id] = (S.gifted[id] || 0) + 1;
    st.since = 0;
    bumpFriendship(id, v);
    const what = plural(1, iid).toLowerCase();
    diary(iid === f.gives
      ? `Took ${f.name} some ${what}. Which is, of course, what ${f.name} does. They took it anyway, laughing.`
      : v === 0 ? `${f.name} has had plenty off me today. Took the ${what} out of politeness and put it with the rest.`
        : v >= 6 ? `Brought ${f.name} the ${what}. That was the very thing. ${pick(f.thanks)}`
          : `Left ${f.name} some ${what}. ${pick(f.thanks)}`, v >= 6 ? 'good' : '');
    save();
    render();
    if (!checkUnlocks()) openVisitSheet(id); // still stood on the doorstep with the bag
  }

  function reqLine(f, req) {
    const what = askText(req);
    const lines = {
      ada: [`I'm short of ${what} for a bake. Could you?`, `If you ever come by ${what}, I'd be grateful.`],
      tomas: [`Need ${what}. Don't ask.`, `${what}, if you've got them. I'll sort you out.`],
      wren: [`Would you have ${what}? I'll trade you honey, obviously.`, `The bees and I are after ${what}.`],
      harold: [`Could do with ${what}. No rush. Well, some rush.`, `${what}. That's all I'm after.`],
      ines: [`I'm after ${what} and I've asked everyone else.`, `Any chance of ${what}? Marjorie's got nothing to do with it.`],
      poppy: [`Can I have ${what}? PLEASE. It's for a thing.`, `Gran says I can't ask. So I'm not asking. But ${what}.`],
    }[f.id];
    return lines[(req.n + req.item.length) % lines.length];
  }

  function visit(id, how, dishIdx) {
    const f = FOLK.find((x) => x.id === id);
    const st = S.folk[id];
    st.since = 0;

    if (how === 'chat') {
      if (S.chatted || !canAct()) return;
      S.chatted = id;
      S.stats.visits += 1;
      spend();
      bumpFriendship(id, 8);
      // Once somebody counts you a friend, the afternoons stop being small talk.
      diary(pick(st.friendship >= 55 && f.close ? f.close.concat(f.chat.slice(0, 1)) : f.chat));
      const chance = 0.55 + st.friendship / 200;
      if (Math.random() < chance) {
        const n = st.friendship >= 70 && Math.random() < 0.4 ? 2 : 1;
        addItem(f.gives, n);
        diary(`${f.name} pressed ${n > 1 ? 'a good lot of ' : ''}${ITEMS[f.gives].name.toLowerCase()} into my hands on the way out.`, 'good');
      }
      // Good friends sometimes write a favourite recipe out for you over tea.
      const unknown = f.likes.filter((r) => !S.known.includes(r));
      if (st.friendship >= 70 && unknown.length && Math.random() < 0.25) {
        const rid = pick(unknown);
        learnRecipe(rid, f);
        diary(`${f.name} wrote out how they make ${RECIPES[rid].name.toLowerCase()} and wouldn't hear no. Recipe card on the shed shelf.`, 'warm');
      }
    } else if (how === 'fulfil') {
      const req = st.request;
      if (!req || !haveRequestItem(req)) return;
      if (RECIPES[req.item]) S.shelf.splice(S.shelf.indexOf(req.item), 1);
      else takeItems({ [req.item]: req.n });
      const wasDish = !!RECIPES[req.item];
      st.request = null;
      S.stats.requests += 1;
      if (wasDish) S.stats.dishFavours += 1;
      bumpFriendship(id, 18);
      addItem(f.gives, 2);
      // ...and something for the shed: a recipe card if they have one you don't, else seed.
      let extra;
      const unknown = f.likes.filter((r) => !S.known.includes(r));
      if (unknown.length && Math.random() < 0.7 + st.friendship / 400) {
        const seasonal = unknown.filter((r) => RECIPES[r].seasons.includes(seasonName()));
        const rid = pick(seasonal.concat(unknown)); // weighted towards this season's pages
        learnRecipe(rid, f);
        extra = `And a recipe card in ${f.name}'s handwriting: ${RECIPES[rid].name.toLowerCase()}. It's on the shed shelf.`;
      } else {
        const crop = giveSeeds(f);
        if (crop) {
          extra = `And a paper packet of ${ITEMS[crop].name.toLowerCase()} seed, folded twice. On the shed shelf.`;
        } else {
          addItem(f.gives, 2);
          extra = pick(['More than I expected, actually.', "Wouldn't take no for an answer about the rest of it, either.", 'And then kept loading me up until I had to say stop.']);
        }
      }
      const note = noteFor(id);
      if (note) S.sill.splice(S.sill.indexOf(note), 1);
      diary(`Brought ${f.name} the ${plural(req.n, req.item).toLowerCase()}. ${pick(f.thanks)} Came home with ${ITEMS[f.gives].name.toLowerCase()}. ${extra}`, 'good');
    } else if (how === 'gift') {
      const dish = S.shelf.splice(Number(dishIdx), 1)[0];
      const liked = f.likes.includes(dish);
      const v = giftValue(f, dish);
      S.gifted[id] = (S.gifted[id] || 0) + 1;
      bumpFriendship(id, v);
      diary(liked
        ? `Took ${f.name} a ${RECIPES[dish].name.toLowerCase()}. Their face. ${pick(f.thanks)}`
        : `Dropped a ${RECIPES[dish].name.toLowerCase()} round to ${f.name}. ${pick(f.thanks)}`, 'good');
    }
    closeSheet();
    checkUnlocks();
    checkFete();
    save();
    render();
    if (how === 'chat' && S.actions <= 0) toast('That\'s the day done. Time for bed.');
  }

  // ------------------------------------------------------------------- the yard
  // Two things you earn rather than start with. Poppy stocks the old wire run with hens
  // once you have done the lane enough favours — and enough of them with something you
  // actually cooked. Wren will only put a hive on the stand for a good friend who has
  // grown something that flowers. Both are free to keep: no action ever goes on them.

  const coopEarned = () => S.stats.requests >= COOP_FAVOURS && S.stats.dishFavours >= COOP_DISHES;
  const henTarget = () => clamp(1 + Math.floor((S.stats.requests - COOP_FAVOURS) / COOP_STEP), 1, COOP_MAX);
  const apiaryEarned = () => S.folk.wren.friendship >= APIARY_FRIEND && S.stats.flowers >= APIARY_FLOWERS;
  const yardShown = () => S.coop.open || S.apiary.open || S.stats.requests > 0 || S.folk.wren.friendship >= 40;
  const eggsWaiting = () => S.coop.hens.filter((h) => h.egg).length;
  const hivesReady = () => S.apiary.hives.filter((h) => h.combs >= HIVE_COMBS).length;

  function addHen(from) {
    const spare = HEN_NAMES.filter((nm) => !S.coop.hens.some((h) => h.name === nm));
    const hen = { name: spare.length ? pick(spare) : 'Hen', from, laid: 0, egg: false };
    S.coop.hens.push(hen);
    return hen;
  }

  // Called wherever a favour, a gift or a pick might have tipped something over.
  // Returns true if it put a sheet up, so the caller doesn't put its own on top.
  function checkUnlocks() {
    let sheet = null;
    if (!S.coop.open && coopEarned()) {
      S.coop.open = true;
      const hen = addHen('Poppy');
      diary(`Poppy came up the path with a hen under one arm and a face that said no arguing. ${hen.name}, apparently. The old run has a tenant again.`, 'warm');
      sheet = `<h2>🐔 A hen for the run</h2>
        <p class="lead ink">"You've been feeding this whole lane all season," said Poppy, "so now you get a hen. Gran says. This is ${hen.name}. She's the sensible one."</p>
        <p>The wire run behind the shed has stood empty since the last tenant. It holds four, and another turns up every few favours you do the lane.</p>
        <p>Scatter a handful of feed each day and there is an egg to collect in the morning. Feeding and collecting cost you nothing at all.</p>`;
    } else if (S.coop.open && S.coop.hens.length < henTarget()) {
      while (S.coop.hens.length < henTarget()) {
        const f = pick(FOLK.filter((x) => S.flags.greeted[x.id] && x.id !== 'poppy')) || FOLK[5];
        const hen = addHen(f.name);
        diary(`${f.name} turned up with another hen for the run. "She was surplus." She answers to ${hen.name} now.`, 'warm');
      }
    }
    if (!S.apiary.open && apiaryEarned()) {
      S.apiary.open = true;
      S.apiary.hives.push({ combs: 0, taken: 0 });
      diary('Wren carried a nucleus box up the lane on her hip and set it on the stand in the yard. I have bees now. I do not remember agreeing to this.', 'warm');
      sheet = `<h2>🐝 Wren brings the bees</h2>
        <p class="lead ink">"You've got things in flower and you've got the patience," said Wren, "so you're having a hive. Don't stand in front of the door and they'll never mind you."</p>
        <p>The bees draw out a frame or two a night — faster while something is flowering in the shed, and not at all in winter, when they cluster up and wait. ${HIVE_COMBS} frames capped and there is a jar of honey to take off.</p>
        <p>Nothing about them costs an action. If you keep the flowers coming, a swarm may well move into the spare box.</p>`;
    }
    if (!sheet) return false;
    save();
    render();
    openSheet(sheet + `<div class="foot"><button class="primary" id="sheet-cancel">Right then</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    return true;
  }

  // Feed is any handful out of the pantry a hen would look twice at.
  const feedable = () => Object.keys(S.pantry).filter((id) => {
    const it = ITEMS[id];
    return S.pantry[id] > 0 && it && (it.kind === 'crop' || it.kind === 'forage' || id === 'flour' || id === 'apple');
  });

  function openFeedSheet() {
    if (!S.coop.open) return;
    if (S.coop.fed) { toast('The hens have had their feed today.'); return; }
    const opts = feedable();
    let html = `<h2>🌾 Scatter feed</h2>
      <p>A handful of anything out of the pantry a hen would look at. Free, once a day — fed hens lay, hungry ones mostly sulk.</p>`;
    if (!opts.length) html += `<p class="ink">Nothing in the pantry a hen would thank you for. Pick something off the shed shelf, or take a walk down the lane.</p>`;
    html += `<div class="chips gift-chips">`;
    for (const id of opts) html += `<button class="chip ${ITEMS[id].kind}" data-feed="${id}">${ink(ITEMS[id].icon)} ${ITEMS[id].name} <b>${S.pantry[id]}</b></button>`;
    html += `</div><div class="foot"><button class="primary" id="sheet-cancel">Never mind</button></div>`;
    openSheet(html);
    $('sheet').querySelectorAll('[data-feed]').forEach((b) => b.addEventListener('click', () => feedHens(b.dataset.feed)));
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function feedHens(id) {
    if (S.coop.fed || !(S.pantry[id] > 0)) return;
    takeItems({ [id]: 1 });
    S.coop.fed = true;
    const one = S.coop.hens.length === 1;
    diary(`Scattered a handful of ${plural(2, id).toLowerCase()} in the run. ${one ? 'She came' : 'They came'} at a flat run, as always.`);
    closeSheet();
    save();
    render();
  }

  function collectEgg(i) {
    const hen = S.coop.hens[i];
    if (!hen) return;
    if (!hen.egg) { openHenSheet(i); return; }
    hen.egg = false;
    hen.laid += 1;
    S.stats.eggs += 1;
    addItem('egg', 1);
    toast(`🥚 Still warm. One of ${hen.name}'s, into the pantry.`);
    save();
    render();
  }

  function openHenSheet(i) {
    const hen = S.coop.hens[i];
    const origin = hen.from === 'Poppy' ? 'Poppy handed her over at the gate and would not hear a word against her.' : `${esc(hen.from)} brought her round, surplus to requirements.`;
    const laid = hen.laid ? `${hen.laid} egg${hen.laid === 1 ? '' : 's'} off her so far.` : 'Nothing off her yet.';
    openSheet(`<h2>🐔 ${esc(hen.name)}</h2>
      <p class="ink">${origin} ${laid}</p>
      <p>${S.coop.fed ? 'Fed today, so there should be something in the nest box in the morning.' : 'Not fed today. Scatter a handful and she will think better of you.'}</p>
      <div class="foot"><button class="primary" id="sheet-cancel">Leave her to it</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  function takeHoney(i) {
    const h = S.apiary.hives[i];
    if (!h) return;
    if (h.combs < HIVE_COMBS) { openHiveSheet(i); return; }
    h.combs = 0;
    h.taken += 1;
    S.stats.honey += 1;
    addItem('honey', 1);
    diary('Lifted a capped frame off the hive and spun it out in the kitchen. A jar of honey, and the bees barely looked up.', 'good');
    toast('🍯 A jar of honey into the pantry.');
    save();
    render();
  }

  function openHiveSheet(i) {
    const h = S.apiary.hives[i];
    const flowers = S.pots.filter((p) => p.crop && !p.wilted && FLOWERING.includes(p.crop)).length;
    const winter = seasonName() === 'Winter';
    const rate = winter ? 'Clustered up for the winter. Nothing until spring, and that is how it should be.'
      : flowers ? `${flowers} thing${flowers === 1 ? '' : 's'} in flower on the shelf, so they are drawing two frames a night.`
        : 'Nothing in flower in the shed just now, so they are slow — one frame a night.';
    openSheet(`<h2>🐝 The hive</h2>
      <p class="ink">${h.combs} of ${HIVE_COMBS} frames drawn. ${h.taken ? `${h.taken} jar${h.taken === 1 ? '' : 's'} off this one so far.` : 'Nothing off it yet.'}</p>
      <p>${rate}</p>
      <div class="foot"><button class="primary" id="sheet-cancel">Leave them be</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  // ------------------------------------------------------------------ the lane
  // Somewhere to spend an action on a day when the pots are all busy and the pantry is bare.

  const FORAGE = {
    Spring: ['nettles', 'nettles', 'nettles', 'mushroom'],
    Summer: ['berries', 'berries', 'berries', 'nettles'],
    Autumn: ['berries', 'mushroom', 'mushroom', 'chestnut', 'apple'],
    Winter: ['chestnut', 'chestnut', 'mushroom'],
  };
  const LANE_BLURB = {
    Spring: 'Nettles thick in the ditch, blackthorn out, and mud the whole way.',
    Summer: 'Brambles down the far end, and the hedge full of small hot birds.',
    Autumn: 'Windfalls under Tomas\'s tree, mushrooms in the churchyard grass, sloes going over.',
    Winter: 'Chestnuts still down under the big tree, if the crows have left any.',
  };
  const LANE_LINES = {
    Spring: ['Walked to the end of the lane and back the long way.', 'Down the lane before the dew was off.'],
    Summer: ['Out along the lane with the sun on the back of my neck.', 'Went as far as the meadow gate and stood about.'],
    Autumn: ['Kicked through the leaves as far as the bridge.', 'Out with a basket, home with a full one.'],
    Winter: ['Out along the lane, hands in sleeves.', 'Short walk. Short day.'],
  };

  function haulText(got) {
    const parts = Object.entries(got).map(([id, n]) => (ITEMS[id].kind === 'forage'
      ? `${n === 1 ? 'a handful' : `${n} handfuls`} of ${ITEMS[id].name.toLowerCase()}`
      : `${n} ${plural(n, id).toLowerCase()}`));
    return parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
  }

  function openLaneSheet() {
    const no = S.actions <= 0 ? 'Nothing left in you today' : '';
    openSheet(`<h2>🌾 Out along the lane</h2>
      <p class="lead ink">${LANE_BLURB[seasonName()]}</p>
      <p>A wander turns up whatever the season is giving — nettles, berries, mushrooms, chestnuts, windfall apples — and now and then seed gone wild over somebody's wall, or a neighbour coming the other way.</p>
      <p>${S.weather === 'rain' || S.weather === 'frost' ? 'Rough out there. You will not find much.' : S.weather === 'sunny' ? 'A good day for it. You will find more than usual.' : 'Fair enough out.'}</p>
      <div class="foot"><button id="sheet-cancel">Stay in</button><button class="primary" id="lane-go" ${no ? 'disabled' : ''}>${no || 'Go for a walk · 1 action'}</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('lane-go').addEventListener('click', walkTheLane);
  }

  function walkTheLane() {
    if (!canAct()) return;
    spend();
    S.stats.walks += 1;
    const pool = FORAGE[seasonName()];
    const n = clamp(2 + (S.weather === 'sunny' ? 1 : 0) - (S.weather === 'rain' || S.weather === 'frost' ? 1 : 0), 1, 3);
    const got = {};
    for (let k = 0; k < n; k++) { const it = pick(pool); got[it] = (got[it] || 0) + 1; addItem(it, 1); }
    diary(`${pick(LANE_LINES[seasonName()])} Came back with ${haulText(got)}.`, 'good');

    const wild = Math.random() < 0.3 ? seasonalCrop(true) : null;
    if (wild) {
      addSeeds(wild, 'the lane');
      diary(`Somebody's ${ITEMS[wild].name.toLowerCase()} had bolted and gone to seed over a wall. Took a twist of it home.`, 'good');
    }
    const met = FOLK.filter((x) => S.flags.greeted[x.id]);
    if (met.length && Math.random() < 0.3) {
      const f = pick(met);
      S.folk[f.id].since = 0;
      bumpFriendship(f.id, 3);
      diary(pick([
        `Passed ${f.name} coming the other way. We said the weather at each other and carried on.`,
        `${f.name} was at the gate. Two minutes of nothing much, which was plenty.`,
        `Waved at ${f.name} across the field. They waved back with both arms, which seemed excessive.`,
      ]));
    }
    if (Math.random() < 0.1 && S.sill.filter((o) => o.kind === 'keepsake' && o.from === 'the lane').length < 3) {
      sillAdd({ kind: 'keepsake', from: 'the lane', icon: pick(['🪶', '🍂', '🪨', '🐌']), name: 'Something off the lane', text: 'Picked up on a walk for no reason at all. It is in the shed now, for no reason at all.' });
      diary('Picked something up off the verge for no good reason. It has gone up in the shed.', 'warm');
    }
    closeSheet();
    checkUnlocks();
    finishAction();
  }

  function checkFete() {
    if (S.flags.fete) return;
    if (FOLK.every((f) => S.folk[f.id].friendship >= 70)) {
      S.flags.fete = true;
      diary('The whole lane turned up with chairs and a trestle table. Apparently it was for me.', 'warm');
      save();
      render();
      openSheet(`<h2>A fête on the lane</h2>
        <p class="lead ink">Ada brought bread. Tomas brought a table he made this morning. Wren brought honey, Harold brought fish, Ines brought Marjorie, and Poppy brought every hen.</p>
        <p>Six good friends in one small village. Nothing changes. Everything is a little easier.</p>
        <div class="foot"><button class="primary" id="sheet-cancel">Back to it</button></div>`);
      $('sheet-cancel').addEventListener('click', closeSheet);
    }
  }

  function finishAction() {
    save();
    render();
    if (S.actions <= 0) toast('That\'s the day done. Time for bed.');
  }

  // ------------------------------------------------------------------ night

  const NIGHT_LINES = [
    'Lamp out. The lane goes quiet.',
    'Bolted the door and wound the clock.',
    'Read four pages and gave up.',
    'The stove ticking as it cools.',
    'An owl somewhere, being obvious about it.',
    'Boots by the door, kettle filled for the morning.',
  ];
  const NIGHT_WEATHER = {
    rain: 'Rain on the shed roof, all the way down into sleep.',
    frost: 'Frost coming down hard. The glass holds its warmth.',
    heat: 'Too warm to sleep with the window shut.',
    windy: 'The gate complaining in the wind, on and off, all night.',
  };

  // The day turns over behind a dark screen, so it feels like something happened.
  let bedBusy = false;
  function goToBed() {
    if (!S || bedBusy) return;
    bedBusy = true;
    const el = $('night');
    const w = NIGHT_WEATHER[S.weather];
    $('night-line').textContent = w && Math.random() < 0.6 ? w : pick(NIGHT_LINES);
    $('night-day').textContent = '';
    $('night-day').classList.remove('in');
    $('btn-sleep').disabled = true;
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => {
      sleep();
      const now = WEATHER[S.weather];
      $('night-day').textContent = `${dayLabel()} · ${now.icon} ${now.name}`;
      $('night-day').classList.add('in');
    }, 700);
    setTimeout(() => el.classList.remove('on'), 1850);
    setTimeout(() => {
      el.classList.add('hidden');
      $('btn-sleep').disabled = false;
      bedBusy = false;
    }, 2350);
  }

  function sleep() {
    const early = S.actions > 0;
    if (early) diary(pick(['Early night.', 'Left the rest for tomorrow.', 'Feet up before dark.']));

    // shed pots: under cover, so no rain and no frost, but they still dry out (twice as fast in a heatwave)
    const heat = S.weather === 'heat';
    for (const p of S.pots) {
      if (!p.crop) continue;
      const c = ITEMS[p.crop];
      if (p.dry <= 1 && !p.wilted && p.progress < c.days) p.progress += 1;
      p.dry += heat ? 2 : 1;
      if (p.dry >= 5) {
        diary(`The ${c.name.toLowerCase()} on the shelf is past saving. Tipped it on the compost.`, 'bad');
        Object.assign(p, emptyPot());
      } else if (p.dry >= 3 && !p.wilted) {
        p.wilted = true;
        diary(`The ${c.name.toLowerCase()} on the shelf has wilted. It wants water today.`, 'bad');
      }
    }

    // the run: fed hens lay, hungry ones mostly sulk. Yesterday's egg waits to be collected.
    if (S.coop.open) {
      let laid = 0;
      for (const hen of S.coop.hens) {
        if (hen.egg) continue;
        if (Math.random() < (S.coop.fed ? 0.85 : 0.2)) { hen.egg = true; laid += 1; }
      }
      if (laid) diary(`${laid === 1 ? 'An egg' : `${laid} eggs`} in the nest box this morning.`, 'good');
      else if (!S.coop.fed) diary('Nothing in the nest box. Nobody got fed yesterday, mind.', 'bad');
      S.coop.fed = false;
    }

    // the hive: faster while the bench has something in flower, and nothing at all in winter
    if (S.apiary.open) {
      const flowers = S.pots.some((p) => p.crop && !p.wilted && FLOWERING.includes(p.crop));
      const gain = seasonName() === 'Winter' ? 0 : flowers ? 2 : 1;
      let capped = 0;
      for (const h of S.apiary.hives) {
        if (h.combs >= HIVE_COMBS) continue;
        h.combs = Math.min(HIVE_COMBS, h.combs + gain);
        if (h.combs >= HIVE_COMBS) capped += 1;
      }
      if (capped) diary(capped === 1 ? 'A frame capped over in the hive. Honey to take off.' : `${capped} hives capped over. Honey to take off.`, 'good');
    }

    // neighbours
    for (const f of FOLK) {
      const st = S.folk[f.id];
      st.since += 1;
      if (st.since > 7 && st.friendship > 0 && Math.random() < 0.5) st.friendship -= 1;
      if (st.request) {
        st.request.left -= 1;
        if (st.request.left <= 0) {
          if (S.flags.greeted[f.id]) diary(`${f.name} found ${plural(2, st.request.item).toLowerCase()} elsewhere. No hard feelings.`);
          st.request = null;
          const note = noteFor(f.id);
          if (note) S.sill.splice(S.sill.indexOf(note), 1);
        }
      } else if (Math.random() < 0.34) {
        const r = newRequest(f);
        if (r) { st.request = r; pinNote(f.id); if (S.flags.greeted[f.id]) diary(`${f.name} is after ${askText(r)}. It\'s on the pinboard.`); }
      }
    }

    // calendar
    S.day += 1;
    let seasonChanged = false;
    let yearEnded = false;
    if (S.day > DAYS_PER_SEASON) {
      S.day = 1;
      S.season += 1;
      seasonChanged = true;
      if (S.season >= SEASONS.length) { S.season = 0; S.year += 1; yearEnded = true; }
    }

    // morning
    S.weather = rollWeather();
    S.maxActions = S.wellFed ? 4 : 3;
    S.actions = S.maxActions;
    S.wellFed = false;
    S.ateToday = false;
    S.chatted = null;
    S.metToday = null;
    S.gifted = {};
    diaryDay();

    if (seasonChanged) {
      diary({
        Spring: 'Spring. The lane is loud with birds again.',
        Summer: 'Summer. Long evenings, warm soil, everything wants water.',
        Autumn: 'Autumn. Leaves in the gutters, pumpkins swelling.',
        Winter: 'Winter. Short days, hard ground, soup.',
      }[seasonName()], 'warm');
    }
    if (S.weather === 'rain') diary('Rain on the shed roof all night. The pots are in the dry, which is rather the point of a shed.');
    if (S.weather === 'frost') diary('Hard frost on the shed window. The pots are on the warm side of the glass and don\'t care.');
    if (S.weather === 'heat') diary('Heatwave. The pots will dry out twice as fast today.');
    if (S.weather === 'windy') diary('Wind all night. The gate has been complaining.');
    if (S.maxActions === 4) diary('Slept well on a full stomach. Room for one more thing today.', 'good');
    morningPost();

    save();
    render();
    if (yearEnded) openYearReview();
  }

  // Waking up ought to be worth something. Now and then the day has started without you.
  function morningPost() {
    // A second colony turns up on its own, if the flowers keep coming.
    if (S.apiary.open && S.apiary.hives.length < HIVE_MAX && seasonName() !== 'Winter' && S.stats.honey >= 3 && Math.random() < 0.15) {
      S.apiary.hives.push({ combs: 0, taken: 0 });
      diary('A swarm came over the wall and hung off the hedge like a bag of nails. Wren talked it into the spare box before lunch. Two hives now.', 'warm');
      return;
    }
    // Nothing to sow and a pot standing empty is a dead end, so the post office quietly fixes it.
    if (!anyPackets().length && emptyPots()) {
      const crop = seasonalCrop(false);
      addSeeds(crop, 'Ines');
      diary(`Ines had a packet of ${ITEMS[crop].name.toLowerCase()} seed at the back of the post office and no idea whose it was. It is mine now.`, 'good');
      return;
    }
    if (Math.random() > 0.34) return;
    const friends = FOLK.filter((f) => S.flags.greeted[f.id] && S.folk[f.id].friendship >= 30);
    const roll = friends.length ? rnd(3) : 2;
    if (roll === 0) {
      const f = pick(friends);
      addItem(f.gives, 1);
      S.folk[f.id].since = 0;
      diary(`Something on the step this morning: ${ITEMS[f.gives].name.toLowerCase()}, and ${f.name}'s handwriting on the bag.`, 'good');
    } else if (roll === 1) {
      const f = pick(friends);
      const crop = giveSeeds(f);
      if (crop) diary(`${f.name} put a twist of ${ITEMS[crop].name.toLowerCase()} seed through the door before I was up.`, 'good');
      else { addItem(f.gives, 1); S.folk[f.id].since = 0; diary(`${f.name} had left ${ITEMS[f.gives].name.toLowerCase()} on the step before I was up.`, 'good'); }
    } else {
      diary(pick([
        'Woke early. Lay there listening to the lane not doing anything.',
        'The kettle went on before I did.',
        'Somebody\'s dog has been across the step again.',
        'Post: a leaflet about a jumble sale. Kept it, for some reason.',
        'Marjorie the goat was on the wall at seven, looking in.',
      ]));
    }
  }

  // Something for the season, and by preference something you haven't got seed for.
  function seasonalCrop(preferNew) {
    const crops = Object.keys(ITEMS).filter((k) => ITEMS[k].kind === 'crop');
    const seasonal = crops.filter((k) => ITEMS[k].seasons.includes(seasonName()));
    let pool = seasonal.length ? seasonal : crops;
    if (preferNew) {
      pool = pool.filter((k) => !packetFor(k));
      if (!pool.length) return null;
    }
    return pick(pool);
  }

  function rollWeather() {
    const table = WEATHER_TABLE[seasonName()];
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  }

  // Mostly raw things off their own list — but the moment your cookbook has something
  // they love in it, they would far rather have the dish. Which is the point of the table.
  function newRequest(f) {
    const now = seasonName();
    const raw = f.wants.filter((w) => {
      const it = ITEMS[w.item];
      if (!it) return false;
      if (it.kind === 'crop' || it.kind === 'forage') return it.seasons.includes(now) || (S.pantry[w.item] || 0) >= w.n;
      if (it.kind === 'staple') return w.item !== f.gives;
      return false;
    });
    const dishes = f.likes.filter((r) => S.known.includes(r) && RECIPES[r].seasons.includes(now));
    if (dishes.length && (!raw.length || Math.random() < 0.4)) return { item: pick(dishes), n: 1, left: 8 };
    if (!raw.length) return null;
    const w = pick(raw);
    return { item: w.item, n: w.n, left: 7 };
  }

  // The turn of the year is the one page you write properly, and a page is prose. Numbers
  // are for ledgers; this is a diary, so it says "a good many" and means it.
  function openYearReview() {
    const st = S.stats;
    const ranked = FOLK.map((f) => [f, S.folk[f.id].friendship]).sort((a, b) => b[1] - a[1]);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];

    const kitchen = st.dishes === 0
      ? 'The kitchen table saw more post than cooking, if you are honest about it.'
      : st.dishes < 6 ? `You cooked a handful of things, and every one of them went somewhere.`
        : st.dishes < 20 ? `The stove was on most weeks. Enough dishes to have a favourite by now.`
          : `The stove was hardly ever cold. There is a way you do things in that kitchen now.`;
    const book = st.recipes === 0
      ? 'The cookbook is still the four pages you moved in with.'
      : `The cookbook has ${st.recipes === 1 ? 'one more page, and not in your hand' : st.recipes < 8 ? 'a few more pages, most of them in hands that are not yours' : 'a great many more pages, and you can tell whose hand wrote which'}.`;
    const glass = st.picks === 0
      ? 'Nothing came off the shed shelf worth carrying indoors. Next year.'
      : st.picks < 10 ? 'A few things came off the bench under the glass. Enough to know what you are doing.'
        : 'The bench under the glass fed you and half the lane besides.';
    const lane = st.walks === 0
      ? 'You never once went out along the lane for the sake of it.'
      : st.walks < 6 ? 'You walked the lane now and then and came back with your pockets full.'
        : 'You know that lane in all four seasons now, and which hedge has what in it.';
    const sitting = st.visits === 0
      ? 'You did not sit down with anybody all year, which the lane will have noticed.'
      : st.visits < 8 ? 'There were afternoons in other kitchens. Not many, but there were some.'
        : 'A great many afternoons went by in a chair that was not yours, and none of them were wasted.';
    const favours = st.requests === 0
      ? 'Nobody got what they asked you for.'
      : st.requests < 6 ? 'You fetched and carried for people when they asked.'
        : 'You have become the person this lane asks, which is a thing that takes a year.';

    const yard = [];
    if (S.coop.open) yard.push(st.eggs ? `There are hens in the run who know the sound of you coming.` : 'There are hens in the run, at least.');
    if (S.apiary.open) yard.push(st.honey ? `And a hive that gave up ${st.honey === 1 ? 'a jar' : 'more than one jar'} without much argument.` : 'And a hive on the stand, still settling in.');

    const closing = best[1] >= 70
      ? `If you had to say who you would knock for at ten at night, it would be ${best[0].name}.`
      : best[1] >= 40 ? `${best[0].name} would say you were a friend, and mean it in a small way.`
        : 'Nobody on this lane would call you a friend yet. They would call you the new one, still, and be perfectly nice about it.';
    const cold = worst[1] < 20 ? ` You have barely said two words to ${worst[0].name} all year.` : '';

    openSheet(`<h2>The end of year ${S.year - 1}</h2>
      <p class="lead ink">Four seasons at the cottage. You sat down and read the whole diary back, which took an evening.</p>
      <div class="year-page">
        <p>${kitchen} ${book}</p>
        <p>${glass} ${lane}</p>
        <p>${sitting} ${favours}${cold}</p>
        ${yard.length ? `<p>${yard.join(' ')}</p>` : ''}
        <p>${closing}</p>
      </div>
      <p>Spring again. The pots want turning out and starting over.</p>
      <div class="foot"><button class="primary" id="sheet-cancel">Another year</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
  }

  // ------------------------------------------------------------------ sheet

  function openSheet(html) {
    $('sheet').innerHTML = html;
    $('overlay').classList.remove('hidden');
  }
  function closeSheet() {
    $('overlay').classList.add('hidden');
    $('sheet').innerHTML = '';
  }

  function openIntro(existing) {
    let html = `<h2>The Garden Shed</h2>
      <p class="lead ink">A cottage at the end of a lane, a potting shed with a shelf of pots and a table to cook at, and six neighbours down the lane who have already noticed you.</p>
      <p>Days are short. You get three things done, then it's dark. Sow a pot, cook something, walk down the lane, sit with somebody. Handing things over your gate is free and always was.</p>`;
    if (existing) {
      html += `<p class="ink">There is a diary here already: <strong>${esc(existing.name)}</strong>, ${SEASONS[existing.season].toLowerCase()} of year ${existing.year}, day ${existing.day}.</p>
        <div class="foot"><button id="intro-new">Start fresh</button><button class="primary" id="intro-continue">Pick up the diary</button></div>`;
    } else {
      html += `<label class="label" for="intro-cottager">Who's moving in?</label>
        <input type="text" id="intro-cottager" name="cottager" maxlength="20" placeholder="Rosemary" autocomplete="off" autocapitalize="words" spellcheck="false" data-lpignore="true" data-1p-ignore data-form-type="other" />
        <div class="foot"><button class="primary" id="intro-begin">Move in</button></div>`;
    }
    openSheet(html);
    if (existing) {
      $('intro-continue').addEventListener('click', () => {
        S = existing;
        closeSheet();
        render();
      });
      $('intro-new').addEventListener('click', () => openIntro(null));
    } else {
      const begin = () => {
        const name = $('intro-cottager').value.trim() || 'You';
        S = freshState(name);
        diaryDay();
        diary(`Moved into the cottage at the end of the lane. The key sticks. The kettle works. Three things a day feels about right.`);
        diary('Three pots on the shed shelf, in the light off the window. Two already going — a lettuce and a strawberry — and a watering can with a dent in it.');
        diary('Three seed packets out on the table, left by whoever was here before. Nothing gets sown without seed.');
        diary('Four recipes in the cookbook. The rest of the pages are blank, and every few new ones seem to shake another pot onto the shed shelf.');
        diary('Six doors down the lane and not one of them knocked on yet. One a day is plenty; a week and I will know the whole lane.');
        save();
        closeSheet();
        render();
      };
      $('intro-begin').addEventListener('click', begin);
      $('intro-cottager').addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); });
      setTimeout(() => $('intro-cottager').focus(), 50);
    }
  }

  // A knock at one door. Free, and it can be walked away from; you hear who they are,
  // what they're after, and the note pins itself on the way home. One a day, though:
  // moving in takes a week, and a stranger keeps until tomorrow.
  function openHelloSheet(id) {
    const f = FOLK.find((x) => x.id === id);
    if (S.metToday && S.metToday !== id) {
      const other = FOLK.find((x) => x.id === S.metToday);
      openSheet(`<h2>${ink(f.door.icon)} ${esc(f.door.title)}</h2>
        <p class="lead ink">${esc(f.door.blurb)}</p>
        <p>You get a hand up to knock and think better of it. You introduced yourself to ${other ? other.name : 'somebody'} today, and that is quite enough new face for one afternoon.</p>
        <p>Whoever lives here will still live here tomorrow.</p>
        <div class="foot"><button class="primary" id="sheet-cancel">Another day</button></div>`);
      $('sheet-cancel').addEventListener('click', closeSheet);
      return;
    }
    const st = S.folk[id];
    const req = st.request;
    let html = `<h2>${ink(f.face)} ${f.name}</h2><p>${esc(f.role)}</p>
      <div class="speech">${esc(f.hello)}</div>`;
    if (req) {
      const have = haveRequestItem(req);
      html += `<div class="speech">"${reqLine(f, req)}"</div>
        <p>${f.name} would like <strong>${itemIcon(req.item)} ${askText(req)}</strong>.
        ${have ? 'You have that already. Bring it round when you visit.' : `${req.left} days before they find it elsewhere.`}
        A note pins itself on the shed board.</p>`;
    }
    html += `<div class="foot"><button id="sheet-cancel">Another day</button><button class="primary" id="hello-ok">Nice to meet you</button></div>`;
    openSheet(html);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('hello-ok').addEventListener('click', () => {
      S.flags.greeted[id] = true;
      S.metToday = id;
      st.since = 0;
      bumpFriendship(id, 4);
      diary(`Knocked at ${f.name}'s. ${f.hello}${req ? ` ${f.name} is after ${askText(req)}.` : ''}`);
      pinNote(id);
      if (!S.flags.hello && FOLK.every((x) => S.flags.greeted[x.id])) {
        S.flags.hello = true;
        diary('Six doors, six hellos. Everyone wants something, which is oddly reassuring.', 'warm');
      }
      closeSheet();
      save();
      render();
    });
  }

  function openHelp() {
    openSheet(`<h2>How to play</h2>
      <p class="lead ink">Three actions a day. Spend them, then go to bed. Giving things away costs nothing at all.</p>
      <h3>Getting around</h3>
      <ul>
        <li>You are stood in the <strong>shed</strong>, and everything is a thing in the room. The pots are on the shelf; the pantry is out on the counter; the board you chop on, the cookbook, the seed packets and the watering can are on the table; the pinboard is on the wall; what you have cooked stands on the table with everything else.</li>
        <li><strong>Click out through the open door</strong> to go down the lane to the village. The tabs top left change what you are looking at — the yard turns up there once you have earned it.</li>
        <li>The bar along the top has the day, the weather, the hours you have left, the <strong>diary</strong>, and the way to bed.</li>
      </ul>
      <h3>What an action buys</h3>
      <ul>
        <li>Sowing a pot, cooking a dish, a walk down the lane, or one sit-down chat with one neighbour.</li>
        <li>Free, and as often as you like: watering, picking, ticking notes, and dropping things round to people.</li>
      </ul>
      <h3>The cottage</h3>
      <ul>
        <li>Everything in the pantry is stood along the back of the table. <strong>Click one to put it in the first free place on the board</strong>, or drag it onto a particular one. Three places, then <em>Make it</em>. Two or three things that belong together become a dish (one action); wrong combinations cost nothing. Click a thing on the board to put it back.</li>
        <li>The red book on the table is the <strong>cookbook</strong>. You start with four recipes; the other pages are blank until a neighbour shares one, or you work it out on the board.</li>
        <li>Dishes stand along the back of the table with the pantry. Click one to eat it — free, once a day — and tomorrow you get a fourth action.</li>
      </ul>
      <h3>The shed</h3>
      <ul>
        <li>You start with three pots and nothing goes in one without a seed packet. <strong>Packets sit out on the table</strong>, and are only there when you have some. Seed comes from picking your own plants, from favours done, and from the lane.</li>
        <li><strong>Every third recipe you learn earns another pot</strong>, up to eight — a fuller cookbook wants more things growing.</li>
        <li>Anything grows on the shelf in any season (one action to sow) — the shed keeps the weather off. Watering and picking are free.</li>
        <li>Pick up the watering can, then click a pot. The can never runs dry. Soil goes wet, fine, thirsty, then the plant wilts; leave it two more days and it's gone. Heatwaves dry pots twice as fast.</li>
        <li>Plants glow when ready. Picking gives one to four depending on the crop, and usually saves you that crop's seed if you haven't got a packet of it. It grows back from half-way.</li>
        <li>The pinboard on the wall holds notes, recipe cards and keepsakes. Anything a neighbour asks for pins itself. Click a thing to look at it, pick it up, or drag it to rearrange; the pencil jots a note of your own.</li>
      </ul>
      <h3>The yard</h3>
      <ul>
        <li><strong>The run.</strong> Do the lane enough favours — and let a few of them be dishes you cooked — and Poppy arrives with a hen. Another follows every few favours after that, up to four.</li>
        <li>Scatter a handful of feed each day (free, anything a hen would look at). Fed hens lay overnight; hungry ones mostly don't. Click a hen to take her egg.</li>
        <li><strong>The hive.</strong> Wren gives bees to good friends who have grown something that flowers. They draw a frame a night, two while something is in flower on the shed shelf, nothing in winter. Four frames is a jar of honey.</li>
        <li>Nothing in the yard costs an action, ever.</li>
      </ul>
      <h3>The village</h3>
      <ul>
        <li>Out through the shed door, six doors down the lane. Knock on one to meet whoever lives there — free, in whatever order suits you, but <strong>one new face a day</strong>. It takes a week to meet the lane.</li>
        <li>Once your cookbook has something a neighbour loves in it, they will start asking for the dish rather than the ingredients. Cook it, keep it on the shelf, take it round.</li>
        <li><strong>One chat a day, with one person.</strong> It costs an action, and it's where they press their speciality on you: flour, apples, honey, fish, milk or eggs.</li>
        <li><strong>Giving is free.</strong> Bring anyone a dish or anything spare out of the pantry, any time, actions or none. The first thing of the day counts for most; after that they get politely full.</li>
        <li>Answering a request is free too, and pays best: they give their speciality back, plus a recipe card or a packet of seed.</li>
        <li>Requests expire in a week. Nobody holds a grudge.</li>
        <li><strong>Out along the lane</strong> is an action: a walk turns up nettles, berries, mushrooms, chestnuts or windfalls, sometimes seed gone wild over a wall, sometimes somebody coming the other way.</li>
        <li>Friendship drifts down a little if you leave someone alone for over a week. Good friends leave a keepsake on the pinboard.</li>
      </ul>
      <p>The day's happenings say themselves in the top corner and then leave you alone. There is no losing; the year just turns.</p>
      <div class="foot"><button id="help-reset">Start a new diary</button><button class="primary" id="sheet-cancel">Back</button></div>`);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('help-reset').addEventListener('click', () => {
      if (confirm('Throw away this diary and start again?')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
        openIntro(null);
      }
    });
  }

  // ------------------------------------------------------------ shed sheets

  function openSillItem(i) {
    const o = S.sill[i];
    if (!o) return;
    let html = '';
    if (o.kind === 'note') {
      html = `<h2>📌 A note</h2><div class="speech">${esc(o.text)}</div>
        <p>${o.done ? 'Ticked off.' : 'Still to do.'}${o.req && !o.done ? ' It comes off the board by itself when the favour is done.' : ''}</p>
        <div class="foot">${o.req && !o.done ? '' : '<button id="sill-bin">Throw it away</button>'}<button id="sill-hold">Pick it up</button><button class="primary" id="sill-tick">${o.done ? 'Untick it' : 'Tick it off'}</button></div>`;
    } else if (o.kind === 'seeds') {
      const c = ITEMS[o.crop];
      const [lo, hi] = yieldRange(o.crop);
      const free = S.pots.findIndex((pt) => !pt.crop);
      html = `<h2>${c.icon} ${c.name} seed${(o.n || 1) > 1 ? ` <span class="tiny-tag">×${o.n}</span>` : ''}</h2>
        <p class="ink">A paper packet from ${esc(o.from)}, folded twice. ${c.days} days to the first pick, then every ${regrowDays(o.crop)}, ${lo === hi ? lo : `${lo}–${hi}`} at a time.</p>
        <p>Nothing goes in a pot without one of these. ${free < 0 ? 'Every pot is busy just now.' : 'There is an empty pot waiting on the shelf.'}</p>
        <div class="foot"><button id="sheet-cancel">Leave it there</button>${free < 0 ? '' : '<button class="primary" id="sill-sow">Sow it · 1 action</button>'}</div>`;
    } else if (o.kind === 'recipe') {
      const r = RECIPES[o.recipe];
      const needs = Object.entries(r.needs).map(([iid, n]) => `${ink(ITEMS[iid].icon)} ${n} ${plural(n, iid).toLowerCase()}`).join(' &nbsp;·&nbsp; ');
      const fans = FOLK.filter((f) => f.likes.includes(o.recipe)).map((f) => f.name).join(', ');
      html = `<h2>${r.icon} ${r.name}</h2>
        <p class="ink">A recipe card in ${esc(o.from)}'s handwriting. It's already copied into the cookbook.</p>
        <div class="speech">${needs}</div>
        <p>${r.seasons.length === SEASONS.length ? 'Any season.' : `A ${r.seasons.map((s) => s.toLowerCase()).join(' or ')} recipe, though the chopping board doesn't mind.`}${fans ? ` Loved by ${fans}.` : ''}</p>
        <div class="foot"><button id="sill-hold">Pick it up</button><button class="primary" id="sill-bin">Tuck it in the cookbook</button></div>`;
    } else {
      html = `<h2>${o.icon} ${esc(o.name)}</h2><p class="ink">${esc(o.text)}</p><p>From ${esc(o.from)}. It stays.</p>
        <div class="foot"><button id="sill-hold">Pick it up</button><button class="primary" id="sheet-cancel">Close</button></div>`;
    }
    openSheet(html);
    $('sheet-cancel')?.addEventListener('click', closeSheet);
    $('sill-hold')?.addEventListener('click', () => { held = i; closeSheet(); render(); toast('Picked up. Click where it should go on the board, or Esc to put it back.'); });
    $('sill-bin')?.addEventListener('click', () => { S.sill.splice(i, 1); closeSheet(); save(); render(); });
    $('sill-tick')?.addEventListener('click', () => { o.done = !o.done; closeSheet(); save(); render(); });
    $('sill-sow')?.addEventListener('click', () => {
      const free = S.pots.findIndex((pt) => !pt.crop);
      if (free >= 0 && sowPot(free, o)) closeSheet();
    });
  }

  // The shed shelf and the pinboard, in a sheet — for a window with no wall to spare.
  function openNookSheet() {
    let html = '<h2>\u{1f4cc} The dishes and the board</h2>';
    html += '<h3>Cooked and keeping</h3>';
    if (S.shelf.length) {
      html += '<div class="options">';
      for (let i = 0; i < S.shelf.length; i++) {
        const r = RECIPES[S.shelf[i]];
        html += `<button class="opt" data-nook-dish="${i}"><span class="icon">${r.icon}</span>
          <span><span class="t">${esc(r.name)}</span></span>
          <span class="r ${S.ateToday ? '' : 'good'}">${S.ateToday ? 'eaten today' : 'eat it'}</span></button>`;
      }
      html += '</div>';
    } else {
      html += '<p>Nothing cooked yet.</p>';
    }
    const pinned = S.sill.filter((o) => o.kind !== 'seeds');
    html += '<h3>On the board</h3>';
    if (pinned.length) {
      html += '<div class="options">';
      S.sill.forEach((o, i) => {
        if (o.kind === 'seeds') return;
        const icon = o.kind === 'note' ? (o.done ? '\u2705' : '\u{1f4dd}') : o.kind === 'recipe' ? RECIPES[o.recipe].icon : o.icon;
        const name = o.kind === 'note' ? o.text : o.kind === 'recipe' ? RECIPES[o.recipe].name : o.name;
        html += `<button class="opt" data-nook-pin="${i}"><span class="icon">${icon}</span>
          <span><span class="t">${esc(name)}</span></span></button>`;
      });
      html += '</div>';
    } else {
      html += '<p>Nothing pinned up yet.</p>';
    }
    html += '<div class="foot"><button id="nook-jot">Jot a note</button><button class="primary" id="sheet-cancel">Close</button></div>';
    openSheet(html);
    $('sheet-cancel').addEventListener('click', closeSheet);
    $('nook-jot').addEventListener('click', openJotSheet);
    $('sheet').querySelectorAll('[data-nook-dish]').forEach((b) => b.addEventListener('click', () => openDishSheet(Number(b.dataset.nookDish))));
    $('sheet').querySelectorAll('[data-nook-pin]').forEach((b) => b.addEventListener('click', () => openSillItem(Number(b.dataset.nookPin))));
  }

  function openJotSheet() {
    openSheet(`<h2>📝 Jot a note</h2><p>Something to remember. It goes on the pinboard until you tick it off.</p>
      <input type="text" id="jot-text" maxlength="48" placeholder="Sow tomatoes when it warms up" autocomplete="off" />
      <div class="foot"><button id="sheet-cancel">Never mind</button><button class="primary" id="jot-ok">Pin it up</button></div>`);
    const ok = () => {
      const t = $('jot-text').value.trim();
      if (!t) { toast('Write something first.'); return; }
      sillAdd({ kind: 'note', text: t, done: false });
      closeSheet();
      save();
      render();
    };
    $('jot-ok').addEventListener('click', ok);
    $('jot-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    $('sheet-cancel').addEventListener('click', closeSheet);
    setTimeout(() => $('jot-text').focus(), 50);
  }

  function renderSill() {
    if (typeof held === 'number' && held >= S.sill.length) held = null;
    const scene = $('sill-scene');
    scene.dataset.weather = S.weather;
    $('sky-icon').textContent = WEATHER[S.weather].icon;
    renderPots();
    const el = $('sill');
    el.classList.toggle('placing', typeof held === 'number');
    const pinned = S.sill.filter((o) => o.kind !== 'seeds').length;
    el.innerHTML = S.sill.map((o, i) => {
      if (o.kind === 'seeds') return ''; // out on the table with the pots
      const cls = `sill-item ${o.kind}${o.done ? ' done' : ''}${held === i ? ' held' : ''}`;
      const attrs = `data-sill="${i}" draggable="true" style="--tilt:${((i * 7) % 5) - 2}deg"`;
      if (o.kind === 'note') return `<div class="${cls}" ${attrs} title="A note. Click to look at it."><button class="tick" data-tick="${i}" title="${o.done ? 'Untick' : 'Tick it off'}">${o.done ? '✓' : ''}</button><span class="txt">${esc(o.text)}</span></div>`;
      if (o.kind === 'recipe') return `<div class="${cls}" ${attrs} title="Recipe card: ${RECIPES[o.recipe].name}"><span class="ico">${RECIPES[o.recipe].icon}</span><span class="lbl">${RECIPES[o.recipe].name}</span><span class="from">${esc(o.from)}</span></div>`;
      return `<div class="${cls}" ${attrs} title="${esc(o.name)}"><span class="ico">${o.icon}</span></div>`;
    }).join('') + (pinned ? '' : '<span class="sill-empty">Nothing pinned up yet.</span>');

    el.querySelectorAll('[data-sill]').forEach((it) => {
      const i = Number(it.dataset.sill);
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        if (held === 'can') { toast('Put the can down first.'); return; }
        if (held !== null) {
          if (held !== i) sillMove(held, held < i ? i + 1 : i);
          held = null;
          save();
          render();
          return;
        }
        openSillItem(i);
      });
      it.addEventListener('dragstart', (e) => {
        dragIdx = i;
        it.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) { /* old browsers */ }
      });
      it.addEventListener('dragend', () => {
        dragIdx = null;
        it.classList.remove('dragging');
        el.querySelectorAll('.over').forEach((x) => x.classList.remove('over'));
      });
      it.addEventListener('dragover', (e) => { if (dragIdx === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; it.classList.add('over'); });
      it.addEventListener('dragleave', () => it.classList.remove('over'));
      it.addEventListener('drop', (e) => {
        if (dragIdx === null) return;
        e.preventDefault();
        e.stopPropagation();
        const from = dragIdx;
        dragIdx = null;
        if (from !== i) sillMove(from, from < i ? i + 1 : i);
        save();
        render();
      });
    });
    el.querySelectorAll('[data-tick]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (held !== null) return;
      const o = S.sill[Number(b.dataset.tick)];
      o.done = !o.done;
      save();
      render();
    }));

    // status lines: one for the pots, one for the pinboard
    const ready = S.pots.filter(potRipe).length;
    const thirsty = S.pots.filter((p) => p.crop && !p.wilted && p.dry >= 2).length;
    const wilted = S.pots.filter((p) => p.crop && p.wilted).length;
    const s = (n) => (n === 1 ? '' : 's');
    $('sill-note').textContent = held === 'can'
      ? 'Carrying the can. Click a pot to water it, or the can to put it down.'
      : [
        ready ? `${ready} ready to pick.` : '',
        wilted ? `${wilted} wilted, water ${wilted === 1 ? 'it' : 'them'}.` : '',
        thirsty ? `${thirsty} will wilt tonight without water.` : '',
      ].filter(Boolean).join(' ') || 'Pots dry out over a couple of days. Pick up the can and tip it over one.';
    const notes = S.sill.filter((o) => o.kind === 'note');
    const todo = notes.filter((o) => !o.done).length;
    const cards = S.sill.filter((o) => o.kind === 'recipe').length;
    $('board-note').textContent = typeof held === 'number'
      ? 'Something in hand. Click another thing to put it before that, or the board to put it last.'
      : [
        todo ? `${todo} thing${s(todo)} still to do.` : (notes.length ? 'Every note ticked.' : ''),
        cards ? `${cards} recipe card${s(cards)} to read.` : '',
      ].filter(Boolean).join(' ');
  }

  // ------------------------------------------------------------- yard render

  // Neither of these is a checklist on the wall. Poppy is watching how the lane takes to you;
  // Wren is watching whether there is anything here worth flying to.
  function runHint() {
    const favours = S.stats.requests;
    const cooked = S.stats.dishFavours;
    if (!favours) return 'The old wire run has been standing empty since before you came. Poppy looks at it every time she goes past.';
    if (favours < COOP_FAVOURS - 3) return 'Poppy has taken to counting your good turns on her fingers. She is not being subtle about the run.';
    if (cooked < COOP_DISHES) return 'Poppy says a person who cooks for the lane is the sort of person hens do well with. She said it twice.';
    return 'Poppy has been measuring the run with her arms. Something is being planned and you are not supposed to know.';
  }
  function standHint() {
    const warm = S.folk.wren.friendship >= APIARY_FRIEND;
    const flowers = S.stats.flowers;
    if (!warm && !flowers) return 'An empty stand where a hive would go. Wren has never mentioned it and keeps not mentioning it.';
    if (!warm) return 'Wren looked at the empty stand, then at you, and talked about the weather instead. Not yet, then.';
    if (flowers < APIARY_FLOWERS) return 'Wren says bees go where there are flowers, and that the shed shelf is all leaves. That was a hint.';
    return 'Wren keeps finding reasons to walk past the stand. It will not be long.';
  }

  function renderYard() {
    const panel = $('yard-panel');
    const show = yardShown();
    panel.classList.toggle('hidden', !show);
    if (!show) return;
    const s = (n) => (n === 1 ? '' : 's');
    const scene = $('yard-scene');

    let html = '<div class="yard-zone run">';
    if (S.coop.open) {
      html += '<span class="coop-house" aria-hidden="true"><i class="roof"></i><i class="door"></i></span>';
      html += S.coop.hens.map((h, i) => {
        const title = h.egg ? `${h.name} has left you an egg. Click to collect it.` : `${h.name}. ${S.coop.fed ? 'Fed today.' : 'Not fed today.'}`;
        return `<button class="hen${h.egg ? ' laying' : ''}" data-hen="${i}" style="--d:${(i * 0.8).toFixed(2)}s" title="${title}"><span class="bird">🐔</span>${h.egg ? '<span class="egg">🥚</span>' : ''}<span class="nm">${esc(h.name)}</span></button>`;
      }).join('');
    } else {
      html += '<span class="coop-house faded" aria-hidden="true"><i class="roof"></i><i class="door"></i></span><span class="yard-locked">an empty run</span>';
    }
    html += '</div><div class="yard-zone apiary">';
    if (S.apiary.open) {
      html += S.apiary.hives.map((h, i) => {
        const ready = h.combs >= HIVE_COMBS;
        const title = ready ? 'Capped and ready. Click to take the honey off.' : h.combs ? `${h.combs} frame${h.combs === 1 ? '' : 's'} drawn out so far.` : 'Nothing drawn out yet. Give them time.';
        return `<button class="hive${ready ? ' ready' : ''}" data-hive="${i}" title="${title}"><span class="bees" aria-hidden="true"></span><span class="box"><i></i><i></i><i></i></span><span class="nm">${ready ? 'honey' : h.combs ? 'filling' : 'settling'}</span></button>`;
      }).join('');
    } else {
      html += '<span class="stand" aria-hidden="true"></span><span class="yard-locked">an empty stand</span>';
    }
    html += '</div>';
    scene.innerHTML = html;
    scene.querySelectorAll('[data-hen]').forEach((el) => el.addEventListener('click', () => collectEgg(Number(el.dataset.hen))));
    scene.querySelectorAll('[data-hive]').forEach((el) => el.addEventListener('click', () => takeHoney(Number(el.dataset.hive))));

    const bits = [];
    if (S.coop.open) bits.push(`${S.coop.hens.length} hen${s(S.coop.hens.length)}`);
    if (S.apiary.open) bits.push(`${S.apiary.hives.length} hive${s(S.apiary.hives.length)}`);
    $('yard-sub').textContent = bits.join(' · ') || 'Standing empty';

    const feed = $('btn-feed');
    feed.classList.toggle('hidden', !S.coop.open);
    feed.disabled = S.coop.fed;
    feed.textContent = S.coop.fed ? 'Fed today' : 'Scatter feed';

    const eggs = S.coop.open ? eggsWaiting() : 0;
    const honey = S.apiary.open ? hivesReady() : 0;
    const lines = [];
    if (eggs) lines.push(`${eggs} egg${s(eggs)} to collect — click a hen.`);
    else if (S.coop.open && !S.coop.fed) lines.push('Nobody has been fed today.');
    if (honey) lines.push(`${honey} hive${s(honey)} capped — click it for the honey.`);
    if (!S.coop.open) lines.push(runHint());
    if (!S.apiary.open) lines.push(standHint());
    $('yard-note').textContent = lines.join(' ') || 'Fed, collected, and quiet.';
  }

  // ------------------------------------------------- the cottage, in windows
  // Everything you own opens over the world rather than sitting beside it: one window
  // at a time, and the dock button it came out of stays lit while it is up.

  let openWindow = null;

  function showWindow(id) {
    openWindow = id || null;
    document.querySelectorAll('.win').forEach((w) => w.classList.toggle('open', w.id === openWindow));
    $('winlayer').classList.toggle('hidden', !openWindow);
  }
  function closeWindow() { showWindow(null); }

  // the stage only ever looks at one place at a time
  function showView(id) {
    document.querySelectorAll('.stage .view').forEach((v) => v.classList.toggle('on', v.id === id));
    document.querySelectorAll('.stab').forEach((t) => t.classList.toggle('on', t.dataset.view === id));
  }

  // A badge is a thing you could do this minute, never a running total.
  // ----------------------------------------------------------------- render

  function render() {
    if (!S) return;
    document.body.dataset.season = seasonName();
    const noActions = S.actions <= 0;

    // hud
    $('hud-date').innerHTML = `<b>${seasonName()}</b> · day ${S.day} · year ${S.year}`;
    const w = WEATHER[S.weather];
    $('hud-weather').innerHTML = `${ink(w.icon)} ${esc(w.name)}`;
    let pips = '';
    for (let i = 0; i < S.maxActions; i++) pips += `<span class="pip ${i >= 3 ? 'bonus' : ''} ${i < S.actions ? 'on' : ''}"></span>`;
    $('hud-actions').innerHTML = `<span>${esc(S.name)}</span><span class="pips" title="${S.actions} of ${S.maxActions} actions left">${pips}</span>`;
    $('btn-sleep').classList.toggle('glow', noActions);

    // the table: prune anything the pantry no longer has, then lay it all out again
    for (const k of Object.keys(S.table)) {
      if (!ITEMS[k] || !(S.pantry[k] > 0)) delete S.table[k];
      else S.table[k] = Math.min(S.table[k], S.pantry[k]);
    }
    renderCounter();
    renderSlots();
    renderDishes();
    renderPackets();

    // the shed, and the yard behind it
    renderSill();
    renderYard();

    // village
    const met = FOLK.filter((f) => S.flags.greeted[f.id]).length;
    $('village-sub').textContent = met < FOLK.length
      ? (S.metToday ? `Met ${FOLK.find((x) => x.id === S.metToday).name} today · ${met} of ${FOLK.length} doors` : `${met} of ${FOLK.length} doors knocked on`)
      : S.chatted ? `Today's chat: ${FOLK.find((x) => x.id === S.chatted).name}` : 'Six doors, and one sit-down a day';
    $('folk').innerHTML = FOLK.map((f) => {
      const st = S.folk[f.id];
      // Nobody is introduced to you. A door is a door until you knock on it.
      if (!S.flags.greeted[f.id]) {
        return `<button class="person unmet${S.metToday ? ' waiting' : ''}" data-folk="${f.id}">
          <span class="face">${f.door.icon}</span>
          <span class="who"><b>${esc(f.door.title)}</b></span>
          <span class="req">${esc(f.door.blurb)} <em>${S.metToday ? 'Tomorrow — one new face a day.' : 'Knock — it\'s free.'}</em></span>
        </button>`;
      }
      let req = '<span class="req">Nothing needed right now.</span>';
      if (st.request) {
        const have = haveRequestItem(st.request);
        req = `<span class="req has">After ${itemIcon(st.request.item)} ${askText(st.request)} ${have ? '<span class="ok">· and you have it</span>' : `<span class="days">· ${waitWord(st.request.left)}</span>`}</span>`;
      }
      // never disabled: you can always drop something round, chat or no chat
      return `<button class="person${S.chatted === f.id ? ' chatted' : ''}" data-folk="${f.id}">
        <span class="face">${f.face}</span>
        <span class="who"><b>${f.name}</b><span class="tier">${S.chatted === f.id ? '☕ sat with today' : tierOf(st.friendship).toLowerCase()}</span></span>
        ${req}
      </button>`;
    }).join('') + `<button class="person lane" id="lane-card" ${noActions ? 'disabled' : ''}>
      <span class="face">🌾</span>
      <span class="who"><b>Out along the lane</b><span class="tier">an afternoon</span></span>
      <span class="req">${LANE_BLURB[seasonName()]}</span>
    </button>`;
    $('folk').querySelectorAll('[data-folk]').forEach((el) => el.addEventListener('click', () => openVisitSheet(el.dataset.folk)));
    $('lane-card').addEventListener('click', openLaneSheet);


    // the yard tab turns up on its own, and takes the stage with it if you are on it
    if ($('yard-panel').classList.contains('hidden') && $('view-yard').classList.contains('on')) showView('view-sill');
  }

  // ------------------------------------------------------------------- boot

  $('btn-sleep').addEventListener('click', goToBed);
  $('btn-cook').addEventListener('click', openCookSheet);
  $('btn-help').addEventListener('click', openHelp);
  $('btn-diary').addEventListener('click', () => { if (S) openDiary(); });
  $('btn-make').addEventListener('click', tableMake);
  $('btn-jot').addEventListener('click', (e) => { e.stopPropagation(); if (S) openJotSheet(); });
  $('btn-nook').addEventListener('click', () => { if (S) openNookSheet(); });
  $('btn-feed').addEventListener('click', () => { if (S) openFeedSheet(); });
  // the way out of the shed is the door, which is where a way out belongs
  $('btn-door').addEventListener('click', (e) => { e.stopPropagation(); if (S) showWindow('win-village'); });
  document.querySelectorAll('.win-x').forEach((b) => b.addEventListener('click', closeWindow));
  $('winscrim').addEventListener('click', closeWindow);
  document.querySelectorAll('.stab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  // blank sill: drop or place at the end
  $('sill').addEventListener('dragover', (e) => { if (dragIdx !== null) e.preventDefault(); });
  $('sill').addEventListener('drop', (e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    const from = dragIdx;
    dragIdx = null;
    sillMove(from, S.sill.length);
    save();
    render();
  });
  // a mouse wheel scrolls along the sill, since it only goes sideways
  $('sill').addEventListener('wheel', (e) => {
    const el = $('sill');
    if (el.scrollWidth <= el.clientWidth || e.deltaX || !e.deltaY) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  $('can').addEventListener('click', (e) => { e.stopPropagation(); if (S) takeCan(); });
  $('sill-scene').addEventListener('click', () => { if (held === 'can') { held = null; render(); } });
  $('sill').addEventListener('click', () => {
    if (typeof held !== 'number') return;
    sillMove(held, S.sill.length);
    held = null;
    save();
    render();
  });
  // only the intro can't be clicked away
  const sheetPinned = () => !!($('intro-begin') || $('intro-continue'));
  $('overlay').addEventListener('click', (e) => {
    if (e.target === $('overlay') && S && !sheetPinned()) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !S) return;
    if (held !== null) { held = null; render(); return; }
    if (!$('overlay').classList.contains('hidden')) { if (!sheetPinned()) closeSheet(); return; }
    closeWindow();
  });

  const existing = load();
  if (existing) { S = existing; pinAllNotes(); render(); }
  openIntro(existing);

  // Small hook for smoke tests.
  window.__cottage = { get S() { return S; }, ITEMS, RECIPES, FOLK, SEASONS, STARTER_RECIPES, FLOWERING, render };
})();
