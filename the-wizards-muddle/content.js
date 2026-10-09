/* The Wizard's Muddle: the words. Every thing in the study, what it is (tags, for the owl
   to guess from), and the riddle the owl sets for it, with a plainer second clue for when
   the riddle is not enough. Nothing has a fixed place: the player puts things away
   wherever they like, on a shelf or the desk.

   A riddle points at one property and is written so that two or three other things in the
   room nearly answer it: "keeps time but has no hands" is the hourglass, past the pocket
   watch and the candle. A thing with clue null is never asked for, only tidied.

   w and h are its size in room pixels, standing upright; it is drawn in art.js by kind. */

export const THINGS = [
  // potions
  { kind: 'potion-red', name: 'red potion', w: 44, h: 58, tags: ['potion', 'drink', 'red', 'glass', 'bottle', 'liquid', 'round', 'cork'],
    clue: 'something you could drink, red as a cherry, if you were very brave', hint: 'A round flask with a cork in it.' },
  { kind: 'potion-blue', name: 'blue potion', w: 30, h: 74, tags: ['potion', 'drink', 'blue', 'glass', 'bottle', 'liquid', 'tall', 'thin', 'sea'],
    clue: 'something as blue as the sea, standing tall and thin', hint: 'A slim glass bottle.' },
  { kind: 'potion-green', name: 'bubbling green potion', w: 46, h: 64, tags: ['potion', 'drink', 'green', 'glass', 'bottle', 'bubbles', 'fizz', 'liquid'],
    clue: 'a potion that will not stop bubbling', hint: 'It is green, and fizzing over the top.' },
  { kind: 'potion-purple', name: 'heart-shaped potion', w: 42, h: 54, tags: ['potion', 'drink', 'purple', 'glass', 'bottle', 'heart', 'love', 'liquid'],
    clue: 'a bottle the colour of a plum, in the shape of a heart', hint: 'A love potion, perhaps.' },
  { kind: 'potion-gold', name: 'golden tonic', w: 28, h: 48, tags: ['potion', 'drink', 'yellow', 'gold', 'glass', 'bottle', 'small', 'liquid'],
    clue: null, hint: '' },

  // books and scrolls
  { kind: 'book-red', name: 'red spellbook', w: 48, h: 70, tags: ['book', 'read', 'spell', 'red', 'pages', 'clasp', 'gold', 'magic'],
    clue: 'something full of spells, shut tight with a golden clasp', hint: 'A book bound in red.' },
  { kind: 'book-green', name: 'green book', w: 44, h: 64, tags: ['book', 'read', 'green', 'pages', 'leaf', 'plants', 'moss'],
    clue: 'a book the colour of moss', hint: 'It has a leaf on its cover.' },
  { kind: 'book-blue', name: 'blue book', w: 40, h: 60, tags: ['book', 'read', 'blue', 'pages', 'star', 'moon'],
    clue: null, hint: '' },
  { kind: 'scroll', name: 'scroll', w: 52, h: 34, tags: ['paper', 'read', 'rolled', 'unroll', 'ribbon', 'letter', 'write'],
    clue: 'something you read by unrolling, not by turning pages', hint: 'Paper, tied with a red ribbon.' },
  { kind: 'map', name: 'treasure map', w: 48, h: 40, tags: ['paper', 'map', 'treasure', 'way', 'x', 'folded', 'island'],
    clue: 'something that shows the way to a place you have never been', hint: 'Folded paper, with an X on it.' },

  // shiny things
  { kind: 'crystal', name: 'purple crystal', w: 48, h: 58, tags: ['crystal', 'gem', 'purple', 'shiny', 'sparkle', 'pointed', 'stone', 'cave'],
    clue: 'something purple that grew in the dark, under a mountain', hint: 'A cluster of pointed crystals.' },
  { kind: 'gem', name: 'green gem', w: 32, h: 26, tags: ['gem', 'jewel', 'green', 'shiny', 'sparkle', 'emerald', 'small', 'stone'],
    clue: 'something small, green and sparkly that is not a frog', hint: 'A cut gem, like an emerald.' },
  { kind: 'ring', name: 'gold ring', w: 30, h: 22, tags: ['ring', 'gold', 'shiny', 'round', 'small', 'finger', 'jewel', 'circle'],
    clue: 'something shiny hiding in plain sight', hint: 'Round and golden, with a hole that fits a finger.' },
  { kind: 'coins', name: 'pile of gold coins', w: 44, h: 26, tags: ['coins', 'gold', 'money', 'shiny', 'round', 'treasure', 'pay'],
    clue: 'something you could pay a dragon with', hint: 'A little heap of gold coins.' },
  { kind: 'bell', name: 'golden bell', w: 38, h: 42, tags: ['bell', 'gold', 'shiny', 'ring', 'sound', 'noise', 'ding'],
    clue: 'something shiny and golden that speaks when you shake it', hint: 'Ding-a-ling.' },
  { kind: 'key-silver', name: 'silver key', w: 40, h: 18, tags: ['key', 'silver', 'shiny', 'metal', 'open', 'door', 'lock', 'small'],
    clue: 'something shiny that opens a door', hint: 'Silver, not brass.' },

  // growing things
  { kind: 'mushroom', name: 'spotted toadstool', w: 40, h: 44, tags: ['mushroom', 'toadstool', 'red', 'spots', 'grow', 'forest', 'plant'],
    clue: 'something red with white spots that grew overnight', hint: 'A toadstool.' },
  { kind: 'mandrake', name: 'mandrake in a pot', w: 50, h: 68, tags: ['plant', 'pot', 'alive', 'leaves', 'face', 'grow', 'green', 'root'],
    clue: 'something alive that lives in a pot, and must never be pulled up', hint: 'A plant with a grumpy face.' },
  { kind: 'frog', name: 'frog', w: 44, h: 32, tags: ['frog', 'green', 'alive', 'jump', 'animal', 'pond', 'ribbit'],
    clue: 'something green that jumps', hint: 'It says ribbit.' },
  { kind: 'egg', name: 'dragon egg', w: 34, h: 44, tags: ['egg', 'dragon', 'speckled', 'hatch', 'oval', 'alive'],
    clue: 'something speckled that something might hatch out of', hint: 'A dragon’s egg.' },
  { kind: 'pumpkin', name: 'little pumpkin', w: 48, h: 40, tags: ['pumpkin', 'orange', 'round', 'grow', 'vegetable', 'eat', 'autumn'],
    clue: 'something round and orange that grew on a vine', hint: 'A little pumpkin.' },

  // time and stars
  { kind: 'hourglass', name: 'hourglass', w: 36, h: 62, tags: ['time', 'clock', 'glass', 'sand', 'wood', 'timer'],
    clue: 'something that keeps time, but has no hands', hint: 'Turn it over and it starts all over again.' },
  { kind: 'watch', name: 'pocket watch', w: 36, h: 44, tags: ['time', 'clock', 'watch', 'gold', 'shiny', 'round', 'hands', 'tick', 'chain'],
    clue: 'something with a face and two hands that never waves hello', hint: 'Small, round and gold, and it ticks on a chain.' },
  { kind: 'candle', name: 'candle', w: 26, h: 60, tags: ['candle', 'flame', 'fire', 'light', 'wax', 'glow', 'hot', 'burn', 'shorter', 'melt'],
    clue: 'something that gets shorter the longer it works', hint: 'It wears a little flame for a hat.' },
  { kind: 'moonjar', name: 'jar of moonlight', w: 40, h: 52, tags: ['jar', 'moon', 'night', 'glow', 'light', 'glass', 'sky', 'star', 'silver'],
    clue: 'a piece of the night sky, caught and kept', hint: 'A glowing jar with a crescent inside.' },

  // seeing and finding
  { kind: 'orb', name: 'crystal ball', w: 46, h: 52, tags: ['ball', 'crystal', 'glass', 'round', 'future', 'see', 'magic', 'fortune'],
    clue: 'something you look into to see tomorrow', hint: 'Round and clear, on a little stand.' },
  { kind: 'magnifier', name: 'magnifying glass', w: 32, h: 58, tags: ['glass', 'lens', 'see', 'big', 'small', 'handle', 'round', 'look'],
    clue: 'something that makes small things look big', hint: 'A round glass with a handle.' },
  { kind: 'specs', name: 'spectacles', w: 46, h: 20, tags: ['glasses', 'spectacles', 'see', 'eyes', 'nose', 'round', 'wear', 'read'],
    clue: 'something that sits on a nose and helps the eyes behind it', hint: 'Two round windows joined by a bridge.' },
  { kind: 'telescope', name: 'telescope', w: 70, h: 28, tags: ['telescope', 'brass', 'see', 'far', 'stars', 'sky', 'look', 'tube', 'long'],
    clue: 'something that brings far-off stars up close', hint: 'A long brass tube, wider at one end.' },
  { kind: 'compass', name: 'compass', w: 36, h: 36, tags: ['compass', 'north', 'way', 'needle', 'round', 'brass', 'travel', 'direction'],
    clue: 'something that always knows which way is north', hint: 'A round case with a needle that will not sit still.' },
  { kind: 'lantern', name: 'lantern', w: 40, h: 64, tags: ['lantern', 'light', 'flame', 'fire', 'glow', 'metal', 'handle', 'carry'],
    clue: 'something that carries light about, with a handle on top', hint: 'A little metal house with a flame inside.' },

  // writing and tools
  { kind: 'quill', name: 'quill', w: 22, h: 72, tags: ['feather', 'quill', 'write', 'pen', 'bird', 'white'],
    clue: 'something that once helped a bird fly, and now helps a wizard write', hint: 'A long feather with a sharp nib.' },
  { kind: 'inkpot', name: 'ink pot', w: 34, h: 32, tags: ['ink', 'pot', 'jar', 'black', 'dark', 'write', 'glass', 'small', 'quill'],
    clue: 'something dark inside, that a quill drinks from', hint: 'A small squat jar of black.' },
  { kind: 'scissors', name: 'scissors', w: 28, h: 52, tags: ['scissors', 'cut', 'blades', 'metal', 'silver', 'paper', 'sharp', 'loops'],
    clue: 'something with two blades and two loops that only ever eats paper', hint: 'Open and close it to cut.' },
  { kind: 'wand', name: 'magic wand', w: 14, h: 66, tags: ['wand', 'magic', 'stick', 'wood', 'spell', 'sparkle', 'star'],
    clue: 'a little stick you should never wave carelessly', hint: 'Wooden, with a sparkle at its tip.' },
  { kind: 'spoon', name: 'wooden spoon', w: 18, h: 66, tags: ['spoon', 'wood', 'stir', 'cook', 'cauldron', 'kitchen', 'soup'],
    clue: 'something that goes round and round in the cauldron', hint: 'Wooden, with a bowl at one end.' },

  // odds and ends
  { kind: 'hat', name: 'wizard’s hat', w: 62, h: 66, tags: ['hat', 'wizard', 'pointed', 'stars', 'wear', 'blue', 'tall', 'head'],
    clue: 'something tall and pointed with stars on it, that you would wear', hint: 'A wizard’s hat.' },
  { kind: 'sock', name: 'odd sock', w: 34, h: 50, tags: ['sock', 'wear', 'foot', 'striped', 'lost', 'wool', 'odd'],
    clue: 'something that lost its partner in the wash', hint: 'One striped sock.' },
  { kind: 'horseshoe', name: 'horseshoe', w: 38, h: 38, tags: ['horseshoe', 'luck', 'lucky', 'iron', 'metal', 'horse', 'u', 'hoof', 'shoe', 'wear'],
    clue: 'something lucky that used to live on a hoof', hint: 'A U of iron.' },
  { kind: 'skull', name: 'little skull', w: 40, h: 40, tags: ['skull', 'bone', 'head', 'white', 'grin', 'spooky', 'teeth'],
    clue: 'something that used to have a face and now only grins', hint: 'A little skull.' },
  { kind: 'key-brass', name: 'old brass key', w: 50, h: 22, tags: ['key', 'brass', 'old', 'metal', 'open', 'door', 'lock', 'big'],
    clue: 'something old that a lock has been waiting for', hint: 'A big brass key with a round bow.' },

  // tea things
  { kind: 'teacup', name: 'teacup', w: 46, h: 30, tags: ['cup', 'tea', 'drink', 'hot', 'saucer', 'handle', 'warm'],
    clue: 'something that holds something warm and has only one ear', hint: 'A cup on a saucer.' },
  { kind: 'apple', name: 'apple', w: 34, h: 36, tags: ['apple', 'eat', 'fruit', 'red', 'round', 'food'],
    clue: 'something red and round that you could eat', hint: 'One a day keeps the healer away.' },
  { kind: 'cheese', name: 'wedge of cheese', w: 44, h: 30, tags: ['cheese', 'eat', 'food', 'yellow', 'holes', 'mouse', 'wedge'],
    clue: 'something a mouse would love', hint: 'A yellow wedge with holes in it.' },
  { kind: 'mortar', name: 'mortar and pestle', w: 46, h: 46, tags: ['bowl', 'stone', 'crush', 'grind', 'herbs', 'stick', 'mortar', 'pestle'],
    clue: 'a bowl that is for crushing, not for eating from', hint: 'A stone bowl with a stick in it.' },
  { kind: 'dice', name: 'die', w: 26, h: 26, tags: ['dice', 'die', 'cube', 'chance', 'game', 'spots', 'six', 'white'],
    clue: 'something with six faces that decides things by chance', hint: 'A white cube with spots.' },
  { kind: 'shell', name: 'snail shell', w: 34, h: 28, tags: ['shell', 'snail', 'spiral', 'empty', 'house', 'swirl'],
    clue: 'a spiral house with nobody home', hint: 'An empty snail shell.' },

  // found treasures
  { kind: 'feather', name: 'blue feather', w: 44, h: 16, tags: ['feather', 'blue', 'light', 'bird', 'soft', 'jay', 'air'],
    clue: 'something as light as air and as blue as a jay', hint: 'A loose blue feather, not a quill.' },
  { kind: 'acorn', name: 'acorn', w: 24, h: 28, tags: ['acorn', 'nut', 'hat', 'tree', 'oak', 'brown', 'seed', 'small'],
    clue: 'a tiny nut that wears a hat', hint: 'A whole oak tree is waiting inside it.' },
  { kind: 'pinecone', name: 'pine cone', w: 28, h: 36, tags: ['pine', 'cone', 'tree', 'scales', 'brown', 'forest', 'evergreen'],
    clue: 'something scaly that fell from an evergreen tree', hint: 'A pine cone.' },
  { kind: 'scallop', name: 'scallop shell', w: 36, h: 30, tags: ['shell', 'sea', 'seaside', 'beach', 'pink', 'fan', 'ridged'],
    clue: 'something pink and ridged from the seaside', hint: 'A shell shaped like a fan.' },

  // the cat's toys
  { kind: 'mouse', name: 'toy mouse', w: 38, h: 22, tags: ['mouse', 'toy', 'grey', 'tail', 'cat', 'chase', 'squeak'],
    clue: 'something the cat loves to chase, that will never run away', hint: 'A grey toy mouse.' },
  { kind: 'yarn', name: 'ball of yarn', w: 32, h: 30, tags: ['yarn', 'wool', 'ball', 'round', 'pink', 'knit', 'string', 'cat'],
    clue: 'something round and woolly that the cat loves to unravel', hint: 'A ball of yarn.' },
  { kind: 'duck', name: 'rubber duck', w: 32, h: 30, tags: ['duck', 'yellow', 'bath', 'float', 'toy', 'squeak', 'bird'],
    clue: 'something yellow that floats in the bath', hint: 'It squeaks.' },

  // more potions and books
  { kind: 'potion-black', name: 'bottle of poison', w: 34, h: 56, tags: ['potion', 'poison', 'black', 'dark', 'skull', 'bottle', 'glass', 'danger', 'drink'],
    clue: 'a bottle you must never, ever drink from', hint: 'It has a skull on its label.' },
  { kind: 'potion-pink', name: 'pink potion', w: 26, h: 60, tags: ['potion', 'drink', 'pink', 'glass', 'bottle', 'tall', 'thin', 'liquid'], clue: null, hint: '' },
  { kind: 'potion-teal', name: 'teal potion', w: 40, h: 50, tags: ['potion', 'drink', 'teal', 'blue', 'green', 'glass', 'bottle', 'round', 'liquid'], clue: null, hint: '' },
  { kind: 'book-purple', name: 'purple book', w: 42, h: 58, tags: ['book', 'read', 'purple', 'pages', 'star'], clue: null, hint: '' },
  { kind: 'book-open', name: 'open book', w: 60, h: 22, tags: ['book', 'open', 'pages', 'read', 'spell', 'flat', 'words'],
    clue: 'a book that is already open at the right page', hint: 'Lying flat, with its pages spread.' },
  { kind: 'ship', name: 'ship in a bottle', w: 58, h: 30, tags: ['ship', 'boat', 'bottle', 'glass', 'sail', 'sea', 'tiny'],
    clue: 'a ship that will never sail', hint: 'It is inside a bottle.' },

  // more light, more sparkle
  { kind: 'candelabra', name: 'candelabra', w: 54, h: 66, tags: ['candle', 'candles', 'flame', 'fire', 'light', 'brass', 'gold', 'three', 'glow'],
    clue: 'something that holds three flames at once', hint: 'A brass candle-holder with three arms.' },
  { kind: 'star', name: 'fallen star', w: 34, h: 34, tags: ['star', 'sky', 'night', 'glow', 'yellow', 'gold', 'fallen', 'shiny', 'light'],
    clue: 'a piece of the night sky that fell down', hint: 'A fallen star, still glowing.' },
  { kind: 'ruby', name: 'ruby', w: 28, h: 24, tags: ['gem', 'jewel', 'red', 'shiny', 'sparkle', 'ruby', 'small', 'stone'],
    clue: 'something red that sparkles, but you could not eat it', hint: 'A cut red gem.' },
  { kind: 'crown', name: 'crown', w: 46, h: 32, tags: ['crown', 'gold', 'king', 'queen', 'wear', 'head', 'shiny', 'jewel', 'points'],
    clue: 'something a king would wear', hint: 'Golden, with points.' },

  // more growing things
  { kind: 'mushroom-blue', name: 'blue toadstool', w: 30, h: 34, tags: ['mushroom', 'toadstool', 'blue', 'spots', 'grow', 'forest'], clue: null, hint: '' },
  { kind: 'cactus', name: 'cactus', w: 34, h: 50, tags: ['cactus', 'plant', 'pot', 'prickly', 'spiky', 'sharp', 'green', 'desert', 'grow'],
    clue: 'something green that would prick you if you hugged it', hint: 'A little cactus in a pot.' },
  { kind: 'vase', name: 'vase of flowers', w: 34, h: 64, tags: ['flower', 'flowers', 'vase', 'water', 'smell', 'petals', 'pretty', 'grow'],
    clue: 'something that smells sweet and stands in water', hint: 'Flowers in a vase.' },
  { kind: 'snail', name: 'snail', w: 40, h: 26, tags: ['snail', 'alive', 'slow', 'shell', 'slimy', 'animal', 'spiral', 'house'],
    clue: 'something slow that carries its house on its back', hint: 'A snail, and this one is at home.' },
  { kind: 'spider', name: 'spider', w: 30, h: 22, tags: ['spider', 'legs', 'eight', 'web', 'black', 'alive', 'spooky', 'animal', 'creepy'],
    clue: 'something with eight legs', hint: 'A little spider.' },

  // more to eat and drink
  { kind: 'cupcake', name: 'cupcake', w: 32, h: 34, tags: ['cake', 'cupcake', 'sweet', 'eat', 'cherry', 'icing', 'food', 'pink'],
    clue: 'something sweet with a cherry on top', hint: 'A cupcake.' },
  { kind: 'bread', name: 'loaf of bread', w: 50, h: 28, tags: ['bread', 'loaf', 'eat', 'baked', 'crust', 'food', 'brown'],
    clue: 'something baked, with a crust', hint: 'A loaf of bread.' },
  { kind: 'carrot', name: 'carrot', w: 46, h: 18, tags: ['carrot', 'orange', 'vegetable', 'eat', 'underground', 'pointy', 'food', 'rabbit'],
    clue: 'something orange and pointed that grew underground', hint: 'For a rabbit, or a snowman.' },
  { kind: 'teapot', name: 'teapot', w: 56, h: 40, tags: ['tea', 'pot', 'teapot', 'pour', 'spout', 'lid', 'hot', 'drink', 'handle'],
    clue: 'something that pours, with a spout and a lid', hint: 'A teapot.' },

  // more tools
  { kind: 'hammer', name: 'hammer', w: 58, h: 20, tags: ['hammer', 'tool', 'bang', 'nail', 'wood', 'metal', 'hit'],
    clue: 'something that bangs nails in', hint: 'A hammer.' },
  { kind: 'paintbrush', name: 'paintbrush', w: 14, h: 60, tags: ['brush', 'paint', 'art', 'colour', 'bristles', 'wood', 'blue'],
    clue: 'something that paints, but is not a painter', hint: 'A paintbrush with blue on its tip.' },
  { kind: 'duster', name: 'feather duster', w: 30, h: 70, tags: ['feather', 'duster', 'clean', 'dust', 'tidy', 'handle', 'colourful'],
    clue: 'something for dusting the shelves', hint: 'A feather duster.' },
  { kind: 'cog', name: 'cog', w: 34, h: 34, tags: ['cog', 'gear', 'wheel', 'teeth', 'metal', 'machine', 'round'],
    clue: 'a wheel with teeth that never bites', hint: 'A cog from a machine.' },
  { kind: 'magnet', name: 'magnet', w: 34, h: 34, tags: ['magnet', 'red', 'metal', 'stick', 'pull', 'iron', 'u'],
    clue: 'something red and U-shaped that clings to iron', hint: 'A magnet, not a horseshoe.' },
  { kind: 'padlock', name: 'padlock', w: 30, h: 38, tags: ['lock', 'padlock', 'metal', 'brass', 'closed', 'keyhole', 'shut'],
    clue: 'something shut tight, waiting for its key', hint: 'A padlock.' },
  { kind: 'globe', name: 'globe', w: 40, h: 56, tags: ['globe', 'world', 'earth', 'map', 'round', 'spin', 'blue', 'green'],
    clue: 'the whole world, small enough to spin', hint: 'A globe on a stand.' },
  { kind: 'envelope', name: 'sealed letter', w: 42, h: 28, tags: ['letter', 'envelope', 'paper', 'seal', 'wax', 'mail', 'post', 'red'],
    clue: 'something sealed with wax, waiting to be opened', hint: 'A letter.' },

  // more to wear
  { kind: 'boot', name: 'boot', w: 40, h: 50, tags: ['boot', 'wear', 'foot', 'leather', 'brown', 'walk', 'shoe'],
    clue: 'something you wear on a foot, but not a sock', hint: 'An old leather boot.' },
  { kind: 'glove', name: 'woolly glove', w: 34, h: 40, tags: ['glove', 'wear', 'hand', 'fingers', 'wool', 'green', 'warm'],
    clue: 'something with five fingers and no bones', hint: 'A woolly glove.' },

  // more to play with
  { kind: 'teddy', name: 'teddy bear', w: 40, h: 46, tags: ['bear', 'teddy', 'toy', 'soft', 'brown', 'hug', 'cuddly'],
    clue: 'something soft and brown that wants a hug', hint: 'A teddy bear.' },
  { kind: 'top', name: 'spinning top', w: 30, h: 34, tags: ['top', 'spin', 'toy', 'point', 'stripes', 'round'],
    clue: 'something that spins on its point until it falls over', hint: 'A spinning top.' },
  { kind: 'ball', name: 'rubber ball', w: 30, h: 30, tags: ['ball', 'red', 'round', 'bounce', 'toy', 'rubber'],
    clue: 'something round that bounces', hint: 'A red rubber ball.' },
  { kind: 'flute', name: 'flute', w: 64, h: 12, tags: ['flute', 'music', 'blow', 'wood', 'holes', 'instrument', 'tune'],
    clue: 'something you blow into to make music', hint: 'A wooden flute.' },
  { kind: 'drum', name: 'little drum', w: 40, h: 34, tags: ['drum', 'music', 'bang', 'beat', 'instrument', 'red', 'loud'],
    clue: 'something you hit to keep the beat', hint: 'A little drum.' },
  { kind: 'cards', name: 'playing cards', w: 34, h: 26, tags: ['cards', 'playing', 'game', 'king', 'queen', 'deck', 'heart'],
    clue: 'a little stack of kings and queens', hint: 'Playing cards.' },
  { kind: 'knight', name: 'chess knight', w: 26, h: 40, tags: ['chess', 'horse', 'knight', 'game', 'black', 'piece'],
    clue: 'a horse that only ever moves in an L', hint: 'A chess piece.' },
  // jars
  { kind: 'jar-eyes', name: 'jar of eyeballs', w: 34, h: 44, tags: ['jar', 'eyes', 'eyeballs', 'glass', 'spooky', 'look', 'watch', 'creepy'],
    clue: 'something that is looking at you from inside a jar', hint: 'A jar of eyeballs. Ew.' },
  { kind: 'jar-honey', name: 'jar of honey', w: 34, h: 40, tags: ['jar', 'honey', 'sticky', 'sweet', 'gold', 'yellow', 'bee', 'eat', 'food'],
    clue: 'something sticky and golden, made by bees', hint: 'A jar of honey.' },
  { kind: 'jar-fireflies', name: 'jar of fireflies', w: 34, h: 46, tags: ['jar', 'fireflies', 'glow', 'light', 'bugs', 'insects', 'night', 'alive', 'glass'],
    clue: 'a jar of little lights that buzz', hint: 'Fireflies, not moonlight.' },
  { kind: 'jar-buttons', name: 'jar of buttons', w: 32, h: 38, tags: ['jar', 'buttons', 'sewing', 'colourful', 'glass', 'coat', 'round'],
    clue: 'a jar of little things that keep a coat shut', hint: 'A jar of buttons.' },
  { kind: 'jar-marbles', name: 'jar of marbles', w: 32, h: 38, tags: ['jar', 'marbles', 'glass', 'balls', 'round', 'game', 'colourful'],
    clue: 'a jar of little glass balls to roll', hint: 'A jar of marbles.' },

  // about the house
  { kind: 'broom', name: 'broomstick', w: 26, h: 90, tags: ['broom', 'broomstick', 'sweep', 'witch', 'fly', 'wood', 'tall', 'clean'],
    clue: 'something a witch flies on', hint: 'A broomstick.' },
  { kind: 'umbrella', name: 'umbrella', w: 30, h: 70, tags: ['umbrella', 'rain', 'dry', 'wet', 'handle', 'purple'],
    clue: 'something that keeps the rain off', hint: 'A rolled-up umbrella.' },
  { kind: 'clock', name: 'mantel clock', w: 44, h: 52, tags: ['clock', 'time', 'tick', 'hands', 'face', 'bedtime', 'wood', 'chime'],
    clue: 'something that ticks on the mantelpiece and tells you it is bedtime', hint: 'A wooden clock.' },
  { kind: 'mirror', name: 'hand mirror', w: 28, h: 56, tags: ['mirror', 'reflection', 'face', 'look', 'see', 'glass', 'silver', 'shiny', 'handle'],
    clue: 'something that shows you your own face', hint: 'A hand mirror.' },
  { kind: 'comb', name: 'comb', w: 46, h: 14, tags: ['comb', 'hair', 'teeth', 'tidy', 'brush'],
    clue: 'something with teeth that only ever tidies hair', hint: 'A comb.' },
  { kind: 'scales', name: 'brass scales', w: 54, h: 50, tags: ['scales', 'weigh', 'balance', 'brass', 'gold', 'heavy', 'measure'],
    clue: 'something that tells you which is heavier', hint: 'A pair of brass scales.' },
  { kind: 'gift', name: 'wrapped present', w: 40, h: 40, tags: ['present', 'gift', 'box', 'bow', 'ribbon', 'birthday', 'wrapped', 'surprise'],
    clue: 'something wrapped up with a bow on top', hint: 'A present.' },

  // to eat and drink
  { kind: 'lollipop', name: 'lollipop', w: 26, h: 56, tags: ['lollipop', 'sweet', 'candy', 'stick', 'swirl', 'eat', 'sugar'],
    clue: 'a sweet on a stick', hint: 'A swirly lollipop.' },
  { kind: 'lemon', name: 'lemon', w: 34, h: 26, tags: ['lemon', 'yellow', 'sour', 'fruit', 'eat', 'juice'],
    clue: 'something yellow and sour', hint: 'A lemon.' },
  { kind: 'banana', name: 'banana', w: 48, h: 22, tags: ['banana', 'yellow', 'fruit', 'peel', 'eat', 'monkey', 'curved'],
    clue: 'something yellow that you peel', hint: 'A banana.' },
  { kind: 'donut', name: 'donut', w: 38, h: 22, tags: ['donut', 'doughnut', 'sweet', 'cake', 'hole', 'round', 'eat', 'pink', 'sprinkles'],
    clue: 'a cake with a hole in the middle', hint: 'A pink donut.' },
  { kind: 'pie', name: 'pie', w: 52, h: 24, tags: ['pie', 'baked', 'crust', 'eat', 'food', 'apple', 'lattice', 'dish'],
    clue: 'something baked, with a lattice on top', hint: 'A pie.' },
  { kind: 'milk', name: 'bottle of milk', w: 22, h: 50, tags: ['milk', 'bottle', 'white', 'drink', 'glass', 'cow'],
    clue: 'something white that you could drink', hint: 'A bottle of milk.' },
  { kind: 'apple-gold', name: 'golden apple', w: 34, h: 36, tags: ['apple', 'gold', 'golden', 'shiny', 'round', 'fruit', 'magic'],
    clue: 'an apple you could never eat', hint: 'It is made of gold.' },

  // creatures and toys
  { kind: 'bone', name: 'bone', w: 50, h: 18, tags: ['bone', 'dog', 'white', 'bury', 'skeleton'],
    clue: 'something a dog would bury in the garden', hint: 'A bone.' },
  { kind: 'fishbowl', name: 'goldfish bowl', w: 46, h: 44, tags: ['fish', 'goldfish', 'bowl', 'water', 'glass', 'swim', 'pet', 'orange', 'alive'],
    clue: 'a little round house for something that swims', hint: 'A goldfish in its bowl.' },
  { kind: 'bat', name: 'toy bat', w: 50, h: 26, tags: ['bat', 'wings', 'toy', 'black', 'night', 'spooky', 'fly'],
    clue: 'something that would sleep upside down', hint: 'A little toy bat.' },
  { kind: 'bunny', name: 'toy bunny', w: 32, h: 48, tags: ['bunny', 'rabbit', 'toy', 'soft', 'ears', 'white', 'cuddly', 'hop'],
    clue: 'something soft with long ears, to cuddle', hint: 'A toy bunny.' },
  { kind: 'ladybird', name: 'ladybird', w: 28, h: 22, tags: ['ladybird', 'ladybug', 'beetle', 'red', 'spots', 'black', 'alive', 'bug', 'insect', 'fly'],
    clue: 'something red with black spots that can fly', hint: 'A ladybird, not a toadstool.' },
  { kind: 'butterfly', name: 'butterfly', w: 40, h: 30, tags: ['butterfly', 'wings', 'colourful', 'fly', 'alive', 'insect', 'pretty', 'flutter'],
    clue: 'something with painted wings', hint: 'A butterfly.' },
  { kind: 'robot', name: 'tin robot', w: 32, h: 48, tags: ['robot', 'toy', 'tin', 'metal', 'machine', 'walk', 'grey'],
    clue: 'a toy made of tin that walks by itself', hint: 'A wind-up robot.' },
  { kind: 'rocket', name: 'toy rocket', w: 26, h: 54, tags: ['rocket', 'toy', 'space', 'moon', 'fly', 'red', 'fins'],
    clue: 'something that wants to fly to the moon', hint: 'A toy rocket.' },
  { kind: 'plane', name: 'paper plane', w: 46, h: 20, tags: ['plane', 'paper', 'fly', 'fold', 'white', 'throw', 'aeroplane'],
    clue: 'something that flies but has no feathers and no engine', hint: 'A paper plane.' },
  { kind: 'snowglobe', name: 'snow globe', w: 36, h: 44, tags: ['snow', 'globe', 'glass', 'winter', 'shake', 'cold', 'christmas', 'tree'],
    clue: 'a little winter you can shake', hint: 'A snow globe.' },

  // growing
  { kind: 'leaf', name: 'autumn leaf', w: 36, h: 26, tags: ['leaf', 'autumn', 'orange', 'fall', 'tree', 'red'],
    clue: 'something that falls from a tree in autumn', hint: 'An orange leaf.' },
  { kind: 'rose', name: 'red rose', w: 22, h: 60, tags: ['rose', 'flower', 'red', 'thorns', 'smell', 'love', 'petals'],
    clue: 'something red and sweet-smelling, with thorns', hint: 'A single rose.' },

  // writing and art
  { kind: 'pencil', name: 'pencil', w: 12, h: 60, tags: ['pencil', 'write', 'draw', 'yellow', 'lead', 'rubber', 'wood', 'point'],
    clue: 'something that writes, and can be rubbed out', hint: 'A yellow pencil, not a quill.' },
  { kind: 'palette', name: 'paint palette', w: 50, h: 24, tags: ['palette', 'paint', 'colours', 'art', 'wood', 'blobs'],
    clue: 'a board full of colours for a painter', hint: 'A paint palette.' },
  { kind: 'horn', name: 'brass horn', w: 56, h: 30, tags: ['horn', 'trumpet', 'brass', 'music', 'blow', 'loud', 'instrument', 'gold'],
    clue: 'something brass that you blow, very loudly', hint: 'A horn, not a flute.' },

  // prizes
  { kind: 'trophy', name: 'trophy', w: 34, h: 50, tags: ['trophy', 'cup', 'gold', 'win', 'prize', 'shiny', 'winner'],
    clue: 'something golden that you get for winning', hint: 'A trophy.' },
  { kind: 'medal', name: 'medal', w: 26, h: 42, tags: ['medal', 'gold', 'ribbon', 'win', 'prize', 'round', 'shiny', 'winner'],
    clue: 'something golden that hangs from a ribbon', hint: 'A medal.' },
];

// Colour variants: more of the same kinds of thing in other colours. They are never asked
// for; they are the near-misses and the clutter. art.js paints them from `base`.
const VARIANT_SETS = [
  ['book', [['orange', 40, 56], ['teal', 44, 60], ['brown', 46, 64], ['pink', 38, 54], ['grey', 42, 58], ['navy', 48, 66], ['maroon', 44, 62], ['olive', 40, 56], ['black', 46, 62], ['white', 38, 52], ['yellow', 42, 58], ['lavender', 40, 60]]],
  ['tallpotion', [['orange', 26, 58], ['lime', 28, 64], ['violet', 24, 54], ['cyan', 26, 62], ['rose', 24, 56], ['amber', 28, 60]]],
  ['roundpotion', [['green', 38, 48], ['indigo', 42, 52], ['coral', 36, 46], ['silver', 40, 50], ['yellow', 34, 44]]],
  ['toadstool', [['purple', 28, 32], ['orange', 32, 36], ['yellow', 26, 30], ['pink', 30, 34]]],
  ['gem', [['blue', 26, 22], ['purple', 28, 24], ['yellow', 24, 20], ['aqua', 26, 22], ['black', 24, 20]]],
  ['candle', [['red', 22, 52], ['blue', 22, 56], ['green', 20, 48], ['purple', 22, 54]]],
  ['ball', [['blue', 28, 28], ['green', 26, 26], ['yellow', 30, 30]]],
  ['yarn', [['blue', 30, 28], ['green', 32, 30], ['yellow', 28, 26]]],
  ['sock', [['blue', 32, 48], ['green', 34, 50], ['purple', 32, 46]]],
  ['feather', [['red', 42, 16], ['green', 40, 16], ['gold', 44, 16]]],
  ['scroll', [['blue', 50, 32], ['green', 48, 30]]],
  ['teacup', [['blue', 44, 30], ['green', 44, 30]]],
  ['apple', [['green', 32, 34]]],
  ['key', [['copper', 42, 18]]],
];
const BASE_NAME = { book: 'book', tallpotion: 'potion', roundpotion: 'potion', toadstool: 'toadstool', gem: 'gem', candle: 'candle', ball: 'ball', yarn: 'ball of yarn', sock: 'sock', feather: 'feather', scroll: 'scroll', teacup: 'teacup', apple: 'apple', key: 'key' };
const BASE_TAGS = {
  book: ['book', 'read', 'pages'], tallpotion: ['potion', 'drink', 'glass', 'bottle', 'tall', 'liquid'], roundpotion: ['potion', 'drink', 'glass', 'bottle', 'round', 'liquid'],
  toadstool: ['mushroom', 'toadstool', 'spots', 'grow'], gem: ['gem', 'jewel', 'shiny', 'sparkle', 'small', 'stone'], candle: ['candle', 'flame', 'fire', 'light', 'wax', 'glow'],
  ball: ['ball', 'round', 'bounce', 'toy'], yarn: ['yarn', 'wool', 'ball', 'round', 'knit'], sock: ['sock', 'wear', 'foot', 'striped', 'wool'], feather: ['feather', 'light', 'bird', 'soft'],
  scroll: ['paper', 'read', 'rolled', 'ribbon'], teacup: ['cup', 'tea', 'drink', 'saucer', 'handle'], apple: ['apple', 'eat', 'fruit', 'round', 'food'], key: ['key', 'metal', 'open', 'door', 'lock'],
};
export const VARIANTS = {};
for (const [base, list] of VARIANT_SETS) for (const [col, w, h] of list) {
  const kind = `${base}-${col}`;
  VARIANTS[kind] = { base, col };
  THINGS.push({ kind, name: `${col} ${BASE_NAME[base]}`, w, h, tags: [...BASE_TAGS[base], col], clue: null, hint: '' });
}

/* What a thing looks like, for the owl. A player describing the rubber duck may well
   describe a duck ("something that quacks", "something that loves bread"), so the rubber
   duck also answers, a little more weakly, to a duck's words. `as` is the lookalike's name,
   `tags` what it is and does, `likes` what it wants: words that follow "loves", "likes",
   "wants" or "eats" in a description are matched against `likes` and nothing else, so
   "something that loves food" means the duck and not the apple. A real creature carries
   only `likes`. */
export const LOOKS = {
  duck: { as: 'duck', tags: ['bird', 'quack', 'swim', 'pond', 'beak', 'feathers', 'water', 'waddle', 'wings'], likes: ['bread', 'food', 'water', 'pond', 'swimming', 'worms', 'rain'] },
  mouse: { as: 'mouse', tags: ['animal', 'squeak', 'whiskers', 'tail', 'small', 'scurry', 'nibble', 'hole'], likes: ['cheese', 'food', 'crumbs', 'seeds', 'nibbling'] },
  teddy: { as: 'bear', tags: ['animal', 'fur', 'furry', 'growl', 'forest', 'cave', 'wild', 'paws', 'claws'], likes: ['honey', 'food', 'fish', 'berries', 'hugs', 'sleep', 'picnic'] },
  knight: { as: 'horse', tags: ['animal', 'gallop', 'mane', 'ride', 'neigh', 'hooves', 'pony', 'stable'], likes: ['hay', 'carrot', 'apple', 'food', 'oats', 'grass', 'running'] },
  egg: { as: 'dragon', tags: ['fire', 'wings', 'scales', 'fly', 'monster', 'lizard', 'baby'], likes: ['treasure', 'gold', 'fire', 'warmth', 'food'] },
  mandrake: { as: 'little person', tags: ['face', 'grumpy', 'angry', 'scream', 'cross', 'frown', 'person', 'head', 'alive'], likes: ['water', 'soil', 'quiet', 'sunshine'] },
  skull: { as: 'head', tags: ['face', 'bones', 'brain', 'pirate', 'dead', 'skeleton', 'smile', 'teeth'] },
  pumpkin: { as: 'jack-o-lantern', tags: ['halloween', 'spooky', 'face', 'carve', 'autumn'] },
  moonjar: { as: 'moon', tags: ['night', 'sky', 'crescent', 'silver', 'wolf', 'space', 'dark'] },
  star: { as: 'star', tags: ['twinkle', 'wish', 'space', 'shine', 'sky', 'night'] },
  globe: { as: 'world', tags: ['planet', 'earth', 'countries', 'oceans', 'home', 'everyone', 'travel'] },
  ship: { as: 'ship', tags: ['sail', 'sea', 'pirate', 'captain', 'waves', 'boat', 'anchor', 'voyage'] },
  crown: { as: 'king', tags: ['royal', 'castle', 'throne', 'rule', 'queen', 'prince', 'princess'] },
  coins: { as: 'treasure', tags: ['rich', 'pirate', 'dragon', 'buy', 'pay', 'money', 'chest'] },
  teapot: { as: 'kettle', tags: ['boil', 'steam', 'whistle', 'hot', 'water'] },
  cog: { as: 'clockwork', tags: ['clock', 'tick', 'machine', 'robot', 'factory', 'turn'] },
  scallop: { as: 'seaside', tags: ['beach', 'waves', 'mermaid', 'sand', 'sea', 'holiday'] },
  shell: { as: 'snail', tags: ['slow', 'slimy', 'garden', 'creature'] },
  yarn: { as: 'knitting', tags: ['knit', 'scarf', 'jumper', 'granny', 'needles', 'wool'] },
  feather: { as: 'bird', tags: ['fly', 'wing', 'sky', 'nest', 'sing', 'tweet', 'flutter'] },
  quill: { as: 'bird', tags: ['fly', 'wing', 'goose', 'swan', 'white'] },
  duster: { as: 'peacock', tags: ['rainbow', 'colourful', 'bird', 'tail', 'feathers'] },
  cactus: { as: 'desert', tags: ['hot', 'sand', 'dry', 'camel', 'sun'], likes: ['sunshine', 'sun', 'heat', 'dry'] },
  hat: { as: 'wizard', tags: ['magic', 'spells', 'witch', 'beard', 'sorcerer'] },
  sock: { as: 'foot', tags: ['feet', 'toes', 'walk', 'smelly', 'warm'] },
  boot: { as: 'foot', tags: ['feet', 'toes', 'walk', 'stomp', 'puddle', 'mud'] },
  glove: { as: 'hand', tags: ['hands', 'fingers', 'wave', 'hold', 'clap', 'thumb'] },
  lantern: { as: 'little house', tags: ['house', 'window', 'roof', 'home'] },
  cupcake: { as: 'party', tags: ['birthday', 'celebrate', 'treat', 'baking'] },
  bread: { as: 'baker', tags: ['toast', 'sandwich', 'bakery', 'oven', 'dough'] },
  orb: { as: 'fortune teller', tags: ['future', 'fortune', 'tomorrow', 'predict', 'mystic', 'tell'] },
  magnet: { as: 'horseshoe', tags: ['u', 'horse', 'lucky'] },
  horseshoe: { as: 'horse', tags: ['animal', 'gallop', 'hooves', 'ride', 'pony'] },
  crystal: { as: 'cave', tags: ['mountain', 'underground', 'rock', 'mine', 'dark'] },
  bat: { as: 'bat', tags: ['animal', 'cave', 'upside', 'down', 'squeak', 'vampire'], likes: ['fruit', 'insects', 'bugs', 'night', 'dark', 'food'] },
  bunny: { as: 'rabbit', tags: ['animal', 'hop', 'ears', 'burrow', 'fluffy', 'tail'], likes: ['carrot', 'carrots', 'lettuce', 'grass', 'food', 'hopping'] },
  fishbowl: { likes: ['food', 'flakes', 'worms', 'swimming', 'water'] },
  ladybird: { likes: ['leaves', 'flowers', 'aphids', 'garden', 'sunshine'] },
  butterfly: { likes: ['flowers', 'nectar', 'sunshine', 'garden'] },
  robot: { as: 'robot', tags: ['machine', 'beep', 'computer', 'metal', 'buttons'] },
  rocket: { as: 'spaceship', tags: ['space', 'stars', 'astronaut', 'launch', 'blast'] },
  plane: { as: 'aeroplane', tags: ['fly', 'sky', 'wings', 'travel', 'pilot'] },
  snowglobe: { as: 'winter', tags: ['snow', 'cold', 'christmas', 'ice', 'snowman'] },
  'jar-eyes': { as: 'eyes', tags: ['look', 'stare', 'watching', 'spooky'] },
  broom: { as: 'witch', tags: ['magic', 'fly', 'hat', 'spells'] },
  'apple-gold': { as: 'treasure', tags: ['rich', 'gold', 'magic', 'fairy', 'tale'] },
  frog: { likes: ['flies', 'bugs', 'insects', 'food', 'pond', 'water', 'jumping', 'lilypad', 'rain'] },
  snail: { likes: ['leaves', 'lettuce', 'rain', 'garden', 'food', 'damp'] },
  spider: { likes: ['flies', 'bugs', 'insects', 'webs', 'corners', 'food', 'dark'] },
};

// Words a player might use for a tag, so the owl can tell "sparkly" means shiny.
export const SYNONYMS = {
  shiny: ['sparkly', 'sparkles', 'glitter', 'glittery', 'gleaming', 'gleams', 'bright', 'twinkly', 'glints', 'shines', 'shine'],
  gold: ['golden', 'yellow'], silver: ['grey', 'gray', 'metal'],
  glow: ['glowing', 'glows', 'light', 'lit', 'bright', 'shining'],
  flame: ['fire', 'burning', 'burns', 'hot', 'flames'],
  time: ['clock', 'hour', 'hours', 'minutes', 'tick', 'ticks', 'late', 'early', 'timer'],
  drink: ['drinking', 'sip', 'liquid', 'potion', 'brew'],
  eat: ['food', 'eating', 'tasty', 'snack', 'yummy', 'edible', 'hungry'],
  read: ['reading', 'words', 'story', 'pages', 'learn'],
  write: ['writing', 'pen', 'letters', 'draw'],
  see: ['look', 'looking', 'eyes', 'eye', 'watch', 'view', 'spy', 'seeing', 'sight'],
  round: ['circle', 'circular', 'ball', 'sphere', 'roundish'],
  alive: ['living', 'lives', 'breathes', 'animal', 'creature', 'grows'],
  grow: ['grows', 'growing', 'garden', 'nature'],
  open: ['unlock', 'unlocks', 'opens', 'lock', 'door'],
  wear: ['wearing', 'clothes', 'worn', 'put', 'on'],
  magic: ['magical', 'spell', 'spells', 'wizard', 'enchanted', 'witch'],
  sound: ['noise', 'loud', 'ring', 'rings', 'music', 'jingle'],
  sharp: ['pointy', 'pointed', 'cut', 'cuts'],
  small: ['tiny', 'little', 'wee'], big: ['large', 'huge'], tall: ['long', 'high'],
  luck: ['lucky', 'fortune'], spooky: ['scary', 'creepy', 'halloween', 'dead'],
  red: ['crimson', 'scarlet', 'cherry'], blue: ['navy', 'sky', 'sea', 'ocean'], green: ['emerald', 'lime'],
  purple: ['violet', 'lilac', 'plum'], orange: ['amber'], white: ['pale', 'cream'],
  glass: ['clear', 'see-through', 'transparent', 'jar', 'bottle'], wood: ['wooden'], metal: ['iron', 'steel', 'metallic'],
  paper: ['parchment', 'paper'], feather: ['bird', 'feathery'], bubbles: ['bubbling', 'bubbly', 'fizzy', 'fizzing'],
  poison: ['poisonous', 'deadly', 'toxic'], prickly: ['prick', 'pricks', 'spines', 'ouch'], dust: ['dusting', 'dusty', 'cleaning'], music: ['musical', 'song', 'tune', 'noise'],
  stir: ['stirring', 'stirs', 'mix', 'mixing', 'round'], dark: ['black', 'shadow'], shorter: ['short', 'smaller', 'melts', 'melting'],
  stars: ['star', 'starry', 'space', 'night'], moon: ['crescent', 'lunar'],
};
