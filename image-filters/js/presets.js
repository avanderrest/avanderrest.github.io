/*
 * Built-in presets for Image Studio. A preset is a whole look - the layer
 * stack for Both, Foreground and Background - in the same shape the Save
 * current button writes to localStorage:
 *
 *   { name, group, note, regions: { both: [layer...], fg: [...], bg: [...] } }
 *
 * A layer is { filter, params, opacity, blend, srcColour, enabled } or a
 * colour map { kind: 'colormap', intensity, shadow, mid, high }. Params that
 * are left out take the style's default.
 */
(function () {
  'use strict';

  // The Presets tab shows the built-ins under these headings, in this order;
  // a preset names its heading with its group field.
  window.StudioPresetGroups = [
    'Soft & dreamy',
    'Sunny & vivid',
    'Painterly & moody',
    'Graphic',
    'Neon & glitch'
  ];

  window.StudioPresets = [
    {
      name: 'Candy Cutout',
      group: 'Soft & dreamy',
      // Graded from a dim indoor photo towards an animated-film still. Tones
      // were fitted numerically at the studio's 1200px working size against the
      // target and a bright photo at once (Auto Tone first, so it lands the same
      // from either end); colour, glow and smoothing were fitted on the pair and
      // then held, because a free fit games the statistics - it drew a hard seam
      // across the frame to match the top-to-bottom profile. The fit came out
      // matte and milky next to the target, so the fade was taken back out and
      // the colour pushed by eye: deeper blacks, warmer peach highlights,
      // Saturate 140 (170 went neon on greens).
      note: 'Glowing cut-paper illustration: soft torn-paper shapes in bright candy colour, blue-slate shadows and peachy light',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 13, black: 9, white: 0, clip: 1, amount: 100 } },
          // Cut the picture into paper layers straight after the tone is set,
          // taking only their shading and edges (Source colour 100). Early, so
          // the grade, glow and smoothing below run over the cut shapes and
          // pull them together; placed last, its edges sat on top, harsh and noisy.
          { filter: 'paper-cut', params: { layers: 6, simplify: 35, smooth: 3, shadow: 60, outline: 0 }, srcColour: 100 },
          { filter: 'shadows-highlights', params: { shadows: 39, highlights: 100, midtones: 4 } },
          { filter: 'matte-fade', params: { lift: 8, rolloff: 0, fade: 6, warmth: 36 } },
          { filter: 'white-balance', params: { temp: -18, tint: 10, preserve: 70 } },
          { filter: 'split-tone', params: { shadowHue: 208, highlightHue: 25, balance: 50, strength: 42, saturation: 60 } },
          { filter: 'saturate', params: { amount: 140 } },
          { filter: 'graduated', params: { amount: 40, hue: 153, tint: 30, tintHue: 199, position: 44, softness: 25, angle: 0 } },
          { filter: 'bloom', params: { amount: 16, threshold: 84, radius: 1, soften: 30 } },
          { filter: 'portrait-smooth', params: { amount: 85, smooth: 2, texture: 44, everywhere: 100, glow: 20, warmth: 0 } }
        ],
        // A foreground-only Clarity layer kept the cars crisp on the pair, but
        // on a soft photo the hard mask edge cut visible patches out of the
        // bokeh, so this look stays on Both.
        fg: [],
        bg: []
      }
    },
    {
      name: 'Neon Dream',
      group: 'Neon & glitch',
      // After a neon cloudscape on a black void. Built on the Subject split:
      // the background drops to near-black, the subject is smoothed, given
      // strong light and shade (contrast + clarity) and gradient-mapped deep
      // teal -> hot pink -> gold, so shaded sides go teal and lit ones glow.
      // A Split Tone on top repainted everything purple-pink; the map alone,
      // fed enough contrast, carries all three colours.
      note: 'The subject glows teal, hot pink and gold out of a black void',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 50, black: 0, white: 0, clip: 1, amount: 100 } }
        ],
        fg: [
          { filter: 'portrait-smooth', params: { amount: 90, smooth: 3, texture: 25, everywhere: 100, glow: 30, warmth: 0 } },
          { filter: 'clarity', params: { clarity: 50, tiles: 6, structure: 10 } },
          { filter: 'exposure', params: { exposure: -15, contrast: 50, black: 0 } },
          { filter: 'saturate', params: { amount: 180 } },
          { kind: 'colormap', enabled: true, intensity: 85, shadow: '#0c5566', mid: '#ff3a7a', high: '#ffe070' },
          { filter: 'saturate', params: { amount: 140 } },
          { filter: 'bloom', params: { amount: 60, threshold: 55, radius: 14, soften: 30 } }
        ],
        bg: [
          { kind: 'colormap', enabled: true, intensity: 100, shadow: '#000000', mid: '#06020b', high: '#1a0822' }
        ]
      }
    },
    {
      name: 'Pastel Peaks',
      group: 'Graphic',
      // After a flat geometric landscape: the photo faceted into triangles,
      // gradient-mapped indigo -> teal -> pale mint, with a graduated filter
      // turning the lower half dusty rose like the reference's ground.
      note: 'Faceted low-poly shapes, teal and mint above fading to a dusty rose ground',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 45, black: 4, white: 0, clip: 1, amount: 100 } },
          { filter: 'low-poly', params: { cell: 40, jitter: 70, edges: 0, seed: 5 } },
          { kind: 'colormap', enabled: true, intensity: 100, shadow: '#262a4e', mid: '#5aaec2', high: '#e4fbf8' },
          { filter: 'graduated', params: { amount: 35, hue: 185, tint: 100, tintHue: 352, position: 55, softness: 30, angle: 0 } },
          { filter: 'saturate', params: { amount: 130 } },
          { filter: 'film-grain', params: { amount: 10, seed: 7 } }
        ],
        fg: [],
        bg: []
      }
    },
    // ---------- from the moodboard (Screenshot 2026-08-24 124514) ----------
    // One per tile. Colour-map stops started from each tile's measured palette
    // (the mean colour of its darkest 20%, middle band and brightest 15%);
    // styles were picked by eye for the tile's technique, then tuned on three
    // photos - a dim indoor one, a bright macro and a busy close-up.
    {
      name: 'Balloon Dawn',
      group: 'Soft & dreamy',
      note: 'Golden-hour haze: warm peach light glowing up from the bottom, soft blooming highlights',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 50, black: 2 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 20, black: 0 } },
          { kind: 'colormap', enabled: true, intensity: 40, shadow: '#71403f', mid: '#e4c5a7', high: '#feefbd' },
          { filter: 'graduated', params: { amount: 45, hue: 38, tint: 40, tintHue: 20, position: 55, softness: 60, angle: 180 } },
          { filter: 'matte-fade', params: { lift: 6, rolloff: 10, fade: 0, warmth: 60 } },
          { filter: 'saturate', params: { amount: 140 } },
          { filter: 'bloom', params: { amount: 50, threshold: 60, radius: 14, soften: 35 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Glitch Bloom',
      group: 'Neon & glitch',
      note: 'Hot magenta and teal, smeared and glitched with a chromatic split',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 50, black: 2 } },
          { filter: 'saturate', params: { amount: 180 } },
          { filter: 'split-tone', params: { shadowHue: 320, highlightHue: 175, balance: 50, strength: 55, saturation: 90 } },
          { filter: 'glitch', params: { brush: 3, glow: 60, smear: 45, glitch: 45, seed: 42, blend: 85 } },
          { filter: 'chromatic', params: { offset: 6 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Steel Mist',
      group: 'Painterly & moody',
      note: 'Cool silver-blue, pared-back colour and crisp detail',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 52, black: 8 } },
          { filter: 'white-balance', params: { temp: -45, tint: 0, preserve: 70 } },
          { filter: 'saturate', params: { amount: 60 } },
          { kind: 'colormap', enabled: true, intensity: 60, shadow: '#3d4c5f', mid: '#7d869d', high: '#c6d3ec' },
          { filter: 'clarity', params: { clarity: 40, tiles: 8, structure: 25 } },
          { filter: 'matte-fade', params: { lift: 14, rolloff: 10, fade: 8, warmth: -30 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Pixel Paradise',
      group: 'Graphic',
      note: 'Pixel-art postcard: cyan, candy pink and lilac',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 56, black: 8 } },
          { filter: 'saturate', params: { amount: 120 } },
          { kind: 'colormap', enabled: true, intensity: 45, shadow: '#1a6e9a', mid: '#8ab8ec', high: '#fbe6ff' },
          { filter: 'split-tone', params: { shadowHue: 195, highlightHue: 325, balance: 60, strength: 30, saturation: 60 } },
          { filter: 'posterize', params: { levels: 6, warmth: 0, blend: 50 } },
          { filter: 'pixel-art', params: { blockSize: 6 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Autumn Pixel Park',
      group: 'Graphic',
      note: 'Redrawn as pixel art in gold, orange and red, with dark outlines',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 54, black: 6 } },
          { filter: 'pixel-scene', params: { blockSize: 6, colors: 22, outline: 85, vivid: 45, autumn: 90 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Deep Coast',
      group: 'Painterly & moody',
      note: 'Deep contrasty ocean blues with bright white highlights',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 40, black: 0 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 45, black: 0 } },
          { kind: 'colormap', enabled: true, intensity: 55, shadow: '#141918', mid: '#2e678b', high: '#e2e6e9' },
          { filter: 'clarity', params: { clarity: 50, tiles: 8, structure: 30 } },
          { filter: 'vignette', params: { amount: 40, feather: 60 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Voxel Pink',
      group: 'Graphic',
      note: 'Chunky blocks in rose, mint and violet',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 45, black: 6 } },
          { filter: 'pixel-art', params: { blockSize: 10 } },
          { filter: 'posterize', params: { levels: 5, warmth: 50, blend: 70 } },
          { kind: 'colormap', enabled: true, intensity: 50, shadow: '#2f303e', mid: '#c05a80', high: '#a8e8a0' },
          { filter: 'saturate', params: { amount: 150 } },
          { filter: 'chromatic', params: { offset: 3 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Night Glitch',
      group: 'Neon & glitch',
      note: 'Midnight blue city glitch: dark, streaked and scanlined',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 38, black: 0 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 30, black: 0 } },
          { kind: 'colormap', enabled: true, intensity: 70, shadow: '#0b0624', mid: '#2e5a6e', high: '#d2f0f4' },
          { filter: 'motion-blur', params: { length: 10, angle: 90, mix: 40 } },
          { filter: 'glitch', params: { brush: 2, glow: 40, smear: 70, glitch: 35, seed: 11, blend: 80 } },
          { filter: 'film-grain', params: { amount: 25, seed: 7 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Crimson Skyline',
      group: 'Neon & glitch',
      note: 'Red and navy, streaked sideways like a long exposure',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 38, black: 2 } },
          { kind: 'colormap', enabled: true, intensity: 82, shadow: '#121a3a', mid: '#d02a3a', high: '#f4c8a8' },
          { filter: 'split-tone', params: { shadowHue: 215, highlightHue: 355, balance: 40, strength: 55, saturation: 75 } },
          { filter: 'saturate', params: { amount: 135 } },
          { filter: 'motion-blur', params: { length: 18, angle: 0, mix: 55 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Autumn Oils',
      group: 'Painterly & moody',
      note: 'Oil-painted autumn: rust, teal shadows and a peach sky glow',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 45, black: 4 } },
          { filter: 'oil-painting', params: { brush: 5 } },
          { kind: 'colormap', enabled: true, intensity: 40, shadow: '#1b1b18', mid: '#5a4a5a', high: '#f0b89a' },
          { filter: 'split-tone', params: { shadowHue: 190, highlightHue: 25, balance: 50, strength: 50, saturation: 75 } },
          { filter: 'saturate', params: { amount: 150 } },
          { filter: 'bloom', params: { amount: 35, threshold: 65, radius: 12, soften: 30 } },
          { filter: 'vignette', params: { amount: 35, feather: 60 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Dusk Teal',
      group: 'Soft & dreamy',
      note: 'Calm teal sky fading into a warm horizon, soft and minimal',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 52, black: 6 } },
          { filter: 'portrait-smooth', params: { amount: 70, smooth: 3, texture: 40, everywhere: 100, glow: 20, warmth: 0 } },
          { kind: 'colormap', enabled: true, intensity: 55, shadow: '#394143', mid: '#6a9091', high: '#f0d9c5' },
          { filter: 'graduated', params: { amount: 30, hue: 185, tint: 80, tintHue: 25, position: 62, softness: 50, angle: 0 } },
          { filter: 'matte-fade', params: { lift: 20, rolloff: 10, fade: 10, warmth: 0 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Stormy Romance',
      group: 'Painterly & moody',
      note: 'Painted storm: plum shadows, dusty mauve and peach light',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 48, black: 2 } },
          { filter: 'oil-painting', params: { brush: 4 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 25, black: 0 } },
          { kind: 'colormap', enabled: true, intensity: 82, shadow: '#281c34', mid: '#8a6680', high: '#f4bc98' },
          { filter: 'saturate', params: { amount: 115 } },
          { filter: 'bloom', params: { amount: 30, threshold: 65, radius: 12, soften: 30 } },
          { filter: 'film-grain', params: { amount: 15, seed: 3 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Ocean Eye',
      group: 'Sunny & vivid',
      note: 'Saturated sea teals and bright whites, crisp and deep',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 50, black: 4 } },
          { filter: 'clarity', params: { clarity: 70, tiles: 8, structure: 30 } },
          { filter: 'saturate', params: { amount: 170 } },
          { kind: 'colormap', enabled: true, intensity: 70, shadow: '#05404c', mid: '#22a0b0', high: '#f4f8fa' },
          { filter: 'hdr', params: { strength: 40, detail: 50, radius: 6, saturation: 110 } },
          { filter: 'vignette', params: { amount: 25, feather: 60 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Warp Speed',
      group: 'Graphic',
      note: 'Diagonal light streaks in violet, coral and cream',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 50, black: 2 } },
          { filter: 'motion-blur', params: { length: 30, angle: 35, mix: 70 } },
          { filter: 'posterize', params: { levels: 5, warmth: 50, blend: 45 } },
          { kind: 'colormap', enabled: true, intensity: 60, shadow: '#26122c', mid: '#ce6b4f', high: '#f8ebb0' },
          { filter: 'split-tone', params: { shadowHue: 265, highlightHue: 45, balance: 40, strength: 45, saturation: 70 } },
          { filter: 'saturate', params: { amount: 125 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Sepia Dream',
      group: 'Painterly & moody',
      note: 'Faded storybook: slate teal shadows and parchment highlights',
      regions: {
        both: [
          { filter: 'saturate', params: { amount: 50 } },
          { kind: 'colormap', enabled: true, intensity: 75, shadow: '#223844', mid: '#767c77', high: '#e6d4a5' },
          { filter: 'portrait-smooth', params: { amount: 70, smooth: 3, texture: 40, everywhere: 100, glow: 20, warmth: 0 } },
          { filter: 'clarity', params: { clarity: 20, tiles: 8, structure: 20 } },
          { filter: 'vignette', params: { amount: 40, feather: 60 } },
          { filter: 'film-grain', params: { amount: 12, seed: 4 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Paper Sunset',
      group: 'Graphic',
      note: 'Layered cut-paper illustration: ink navy, dusty rose and cream',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 48, black: 0 } },
          { filter: 'paper-cut', params: { layers: 5, simplify: 40, smooth: 3, shadow: 70, outline: 0 }, srcColour: 100 },
          { kind: 'colormap', enabled: true, intensity: 70, shadow: '#050818', mid: '#9a5a6a', high: '#f8e4bc' },
          { filter: 'saturate', params: { amount: 130 } },
          { filter: 'graduated', params: { amount: 30, hue: 20, tint: 20, tintHue: 220, position: 45, softness: 60, angle: 0 } }
        ],
        fg: [],
        bg: []
      }
    },
    // ---------- from edits\best (animated-film restyles) ----------
    // One per image. Palettes measured as for the moodboard; the high-key ones
    // kept fogging up (Portrait Smooth glow + low-threshold bloom + a shadow
    // lift, and measured shadow stops that were themselves mid-grey), so glow
    // is light and the pastel looks get a darker shadow stop in the same hue.
    {
      name: 'Storybook Isle',
      group: 'Sunny & vivid',
      note: 'Fairy-tale postcard: vivid teal water, lush green and crisp sunny detail',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 52, black: 4 } },
          { filter: 'saturate', params: { amount: 140 } },
          { filter: 'split-tone', params: { shadowHue: 195, highlightHue: 45, balance: 50, strength: 40, saturation: 65 } },
          { filter: 'clarity', params: { clarity: 45, tiles: 8, structure: 25 } },
          { filter: 'portrait-smooth', params: { amount: 50, smooth: 3, texture: 35, everywhere: 100, glow: 7, warmth: 0 } },
          { filter: 'bloom', params: { amount: 15, threshold: 82, radius: 10, soften: 25 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Glossy Pop',
      group: 'Soft & dreamy',
      note: 'Bright, glossy and high-key: pastel sky blues with punchy colour accents',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 54, black: 4, white: 4 } },
          { filter: 'white-balance', params: { temp: -20, tint: 0, preserve: 70 } },
          { filter: 'saturate', params: { amount: 145 } },
          { kind: 'colormap', enabled: true, intensity: 30, shadow: '#2e3a46', mid: '#a7c9c5', high: '#f4f8f7' },
          { filter: 'portrait-smooth', params: { amount: 80, smooth: 3, texture: 35, everywhere: 100, glow: 14, warmth: 0 } },
          { filter: 'bloom', params: { amount: 24, threshold: 72, radius: 14, soften: 30 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Cloud Kite',
      group: 'Sunny & vivid',
      note: 'Wide-open sky: cool blues, bright whites and crisp airy detail',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 62, black: 10 } },
          { filter: 'white-balance', params: { temp: -30, tint: 0, preserve: 70 } },
          { kind: 'colormap', enabled: true, intensity: 50, shadow: '#46699a', mid: '#9ab4c8', high: '#f6f8f8' },
          { filter: 'clarity', params: { clarity: 35, tiles: 8, structure: 25 } },
          { filter: 'saturate', params: { amount: 130 } },
          { filter: 'bloom', params: { amount: 18, threshold: 77, radius: 12, soften: 25 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Duckpond Glow',
      group: 'Sunny & vivid',
      note: 'Calm teal water and warm golden bokeh, soft and gentle',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 48, black: 4 } },
          { filter: 'split-tone', params: { shadowHue: 178, highlightHue: 32, balance: 55, strength: 40, saturation: 60 } },
          { filter: 'saturate', params: { amount: 125 } },
          { filter: 'portrait-smooth', params: { amount: 70, smooth: 3, texture: 35, everywhere: 100, glow: 10, warmth: 0 } },
          { filter: 'bloom', params: { amount: 27, threshold: 72, radius: 16, soften: 35 } },
          { filter: 'vignette', params: { amount: 30, feather: 60 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Cast Brass',
      group: 'Graphic',
      // After a brass Monopoly token: the whole picture cast as one embossed
      // antique-brass plaque - Bas Relief for the raised form and catch-lights,
      // a dark olive-brass map, extra contrast for the oxidised recesses and a
      // vignette for an aged-medal edge. A paler brass read as cream, and more
      // polish tipped it into bright yellow.
      note: 'The whole picture embossed in antique brass: raised forms, deep recesses and bright catch-lights',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 50, black: 2 } },
          { filter: 'bas-relief', params: { relief: 80, polish: 50, patina: 55 } },
          { kind: 'colormap', enabled: true, intensity: 100, shadow: '#120e06', mid: '#6e6030', high: '#ecd88c' },
          { filter: 'exposure', params: { exposure: 0, contrast: 35, black: 0 } },
          { filter: 'clarity', params: { clarity: 30, tiles: 8, structure: 25 } },
          { filter: 'bloom', params: { amount: 30, threshold: 78, radius: 8, soften: 20 } },
          { filter: 'vignette', params: { amount: 35, feather: 60 } }
        ],
        fg: [],
        bg: []
      }
    },
    // ---------- five more: filling gaps in the set ----------
    // Black and white, retro film, comic, light watercolour and stained glass -
    // none of which the set had. Built from existing styles and tuned on the
    // same four photos. Pop Art Comic rests on Flat Illustration (k-means), so
    // it is the slowest preset to render - a few seconds at full size.
    {
      name: 'Film Noir',
      group: 'Painterly & moody',
      note: 'Hard black and white: crushed blacks, bright highlights, heavy grain and a dark vignette',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 45, black: 0 } },
          { filter: 'saturate', params: { amount: 0 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 55, black: 0 } },
          { filter: 'clarity', params: { clarity: 25, tiles: 8, structure: 20 } },
          { filter: 'film-grain', params: { amount: 22, seed: 11 } },
          { filter: 'vignette', params: { amount: 55, feather: 55 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Instant Film',
      group: 'Soft & dreamy',
      note: 'Faded 70s instant print: milky blacks, warm cream highlights, cyan shadows and a light leak',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 55, black: 4 } },
          { filter: 'matte-fade', params: { lift: 35, rolloff: 35, fade: 22, warmth: 45 } },
          { filter: 'split-tone', params: { shadowHue: 185, highlightHue: 40, balance: 50, strength: 35, saturation: 60 } },
          { filter: 'saturate', params: { amount: 85 } },
          { filter: 'light-leak', params: { amount: 60, hue: 22, variation: 40, spread: 70, count: 1, haze: 25, seed: 3 } },
          { filter: 'film-grain', params: { amount: 20, seed: 5 } },
          { filter: 'vignette', params: { amount: 20, feather: 70 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Pop Art Comic',
      group: 'Graphic',
      note: 'Bold flat colours, halftone dots and dark ink outlines, like a comic panel',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 52, black: 2 } },
          { filter: 'flat-illustration', params: { colors: 6, sat: 120, smooth: 3, edges: 90 } },
          { filter: 'halftone', params: { dotSize: 8 }, opacity: 35, blend: 'multiply' },
          { filter: 'saturate', params: { amount: 150 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Watercolour Sketch',
      group: 'Painterly & moody',
      note: 'Soft bleeding watercolour washes with loose ink lines on textured paper',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 62, black: 12 } },
          { filter: 'watercolour', params: { bleed: 4, wet: 60, levels: 8, pigment: 40, edges: 35, paper: 70 } },
          { filter: 'ink-sketch', params: { detail: 11, lines: 45, threshold: 95, lineWeight: 1 }, opacity: 25, blend: 'multiply' },
          { filter: 'saturate', params: { amount: 80 } },
          { filter: 'matte-fade', params: { lift: 15, rolloff: 20, fade: 8, warmth: 15 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Stained Glass',
      group: 'Graphic',
      note: 'Panes of glowing colour held in bold dark leading that follows the shapes in the picture',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 52, black: 2 } },
          { filter: 'paper-cut', params: { layers: 6, simplify: 45, smooth: 3, shadow: 10, outline: 100 }, srcColour: 100 },
          { filter: 'saturate', params: { amount: 210 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 20, black: 0 } },
          { filter: 'bloom', params: { amount: 50, threshold: 55, radius: 14, soften: 30 } }
        ],
        fg: [],
        bg: []
      }
    },
    {
      name: 'Infrared',
      group: 'Neon & glitch',
      // False-colour infrared film (Aerochrome): true greens swung round to
      // crimson with Hue Shift, keeping their brightness so foliage stays
      // luminous, then contrast, a soft halation glow and a little grain. The
      // range is kept to real greens (centred 112, 60 wide) - wider, and
      // yellows went magenta too (yellow cars, lizard skin).
      note: 'False-colour infrared film: green foliage turns crimson and pink, everything else keeps its colour',
      regions: {
        both: [
          { filter: 'auto-tone', params: { brightness: 52, black: 2 } },
          { filter: 'hue-shift', params: { shift: -125, target: 112, width: 60, saturation: 110, keep: 70 } },
          { filter: 'exposure', params: { exposure: 0, contrast: 25, black: 0 } },
          { filter: 'saturate', params: { amount: 90 } },
          { filter: 'bloom', params: { amount: 35, threshold: 65, radius: 16, soften: 40 } },
          { filter: 'film-grain', params: { amount: 8, seed: 4 } }
        ],
        fg: [],
        bg: []
      }
    }
  ];
})();
