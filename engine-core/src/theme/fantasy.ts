// theme/fantasy.ts — the DEFAULT theme ("Standard Fantasy RPG" starter).
//
// This theme reproduces the project's ORIGINAL wording VERBATIM. Extraction
// phases must not change tone; a later phase rewrites this file for voice.
// Treat every string here as the frozen baseline the snapshot proves against.

import type { Theme } from './types';

export const fantasy: Theme = {
  name: 'fantasy',

  // The colour scheme, VERBATIM from the stylesheet's `:root` block. `applyPalette`
  // in `/web` sets these as CSS custom properties at boot, so the default theme
  // reproduces the original rendered colours exactly.
  palette: {
    bg: '#08090c', // --ink-900
    surface: '#11141b', // --ink-800
    panel: '#171b24', // --ink-700
    surfaceRaised: '#1e2330', // --ink-600
    control: '#262c3a', // --ink-500
    line: '#262c39', // --line
    lineStrong: '#394152', // --line-strong
    text: '#eef1f7', // --text
    textDim: '#aeb7c8', // --text-dim
    textMuted: '#98a2b8', // --text-muted
    textDisabled: '#6b7688', // --text-disabled
    accent: '#ff9d3c', // --ember
    accentHi: '#ffb257', // --ember-hi
    accentLo: '#e07d15', // --ember-lo
    accentEdge: '#b8640a', // --ember-edge
    accentInk: '#1c1206', // --ember-ink
    dangerMuted: '#ff8f99', // --danger-dim
    hpHi: '#ff6f63', // --hp-hi
    hpLo: '#cf2a41', // --hp-lo
  },

  ui: {
    hud: {
      gold: 'Gold',
      stage: 'Stage',
      dps: 'DPS',
    },
    placeholder: '—',
    tapHint: 'Tap the enemy to attack.',
    equippedTitle: 'Equipped',
    upgradeButton: 'Upgrade',
    upgradeHint: 'Equip a weapon from your bag to upgrade it.',
    upgradeRow: {
      level: (level) => `Lv ${level}`,
      cost: (cost) => `Cost ${cost}`,
    },
    boost: {
      label: 'FRENZY',
      pill: (multiplier) => `FRENZY ×${multiplier}`,
      timer: (seconds) => `${seconds}s`,
    },
    splashKicker: 'Achievement unlocked',
    choice: {
      title: 'Choice',
      wait: 'Wait — free',
      watchAd: 'Watch ad — coming soon',
      watchAdTitle: 'Placeholder — ad integration is not wired in this build (see NOTES.md)',
      iap: 'Buy — coming soon',
      iapTitle: 'Placeholder — purchases are not wired in this build (see NOTES.md)',
      note: 'The free wait option always works. Ad and purchase paths are placeholders.',
    },
    offline: {
      title: 'Welcome back',
      dismiss: 'Continue',
      earned: (gold, duration) => `You earned ${gold} gold while away for about ${duration}.`,
      capped: ' Offline progress is capped.',
    },
    duration: {
      lessThanMinute: 'less than a minute',
      seconds: (seconds) => `${seconds} s`,
      minutes: (minutes) => `${minutes} min`,
      hours: (hours) => `${hours} h`,
      hoursMinutes: (hours, minutes) => `${hours} h ${minutes} min`,
    },
    bag: {
      title: 'Bag',
      countSuffix: ' items',
      empty: 'No drops yet — defeat enemies to find gear.',
      betterTag: '↑ Better',
      equip: 'Equip',
      level: (level) => `Level ${level}`,
      weaponSummary: (level, dps, click) => `${level} · DPS ${dps} · click ${click}`,
      ringSummary: (level, crit, critDamage) =>
        `${level} · crit ${crit} (raw) · crit dmg +${critDamage} (raw)`,
      necklaceSummary: (level, gold, power) =>
        `${level} · gold +${gold} (raw) · power +${power} (raw)`,
    },
  },

  slots: {
    display: {
      weapon: 'Weapon',
      ring1: 'Left ring',
      ring2: 'Right ring',
      necklace: 'Necklace',
    },
    noun: {
      weapon: 'weapon',
      ring: 'ring',
      necklace: 'necklace',
    },
    card: {
      weapon: (level) => `Weapon · level ${level}`,
      ring1: (level) => `Ring (left) · level ${level}`,
      ring2: (level) => `Ring (right) · level ${level}`,
      necklace: (level) => `Necklace · level ${level}`,
    },
    empty: {
      weapon: 'No weapon equipped',
      ring1: 'No left ring',
      ring2: 'No right ring',
      necklace: 'No necklace',
    },
    stats: {
      weapon: (dps, click, upgrades) =>
        `DPS ${dps} · click ${click} · upgrades ${upgrades}`,
      ring: (crit, critDamage, totalCrit, totalCritDamage) =>
        `crit ${crit} (raw) · crit dmg +${critDamage} (raw) · ` +
        `total crit ${totalCrit} · crit dmg +${totalCritDamage} (capped)`,
      necklace: (gold, power, totalGold, totalPower) =>
        `gold +${gold} (raw) · power +${power} (raw) · ` +
        `total gold +${totalGold} · power +${totalPower} (capped)`,
      empty: 'Equip a drop from your bag.',
    },
    milestone: {
      badge: (count, bonus) => `★ ×${count} — ${bonus}`,
      flourish: (slot, count, bonus) => `★ ${slot} milestone ×${count} — ${bonus}`,
      bonus: {
        separator: ' · ',
        crit: (percent) => `+${percent} crit`,
        critDamage: (percent) => `+${percent} crit dmg`,
        gold: (percent) => `+${percent} gold`,
        power: (percent) => `+${percent} power`,
      },
    },
  },

  enemy: {
    label: 'Enemy',
    boss: 'Boss',
    attackAria: 'Attack the enemy',
    hp: (current, max) => `${current} / ${max}`,
    bossCheck: 'Boss check',
    progressionWall: 'Progression wall',
    projectedKill: (ms) => ` Projected time to kill: ${ms} ms.`,
    bossCheckBody: (stage, projected) =>
      `Stage ${stage} is a boss check and you are below the boss timer.${projected}`,
    progressionWallBody: (stage, projected) =>
      `Stage ${stage} is a progression wall.${projected}`,
  },

  shiny: {
    name: 'Stray Goblin',
    catchAria: 'Catch the Stray Goblin',
    kind: {
      frenzy: 'FRENZY goblin!',
      drop: 'Ring goblin!',
      cache: 'Gold goblin!',
    },
    escape: "It got away. It's fine. You didn't want it anyway.",
    claimed: 'GOTCHA! Shiny claimed.',
    frenzyClaim: (multiplier) => `GOTCHA! FRENZY ×${multiplier}`,
    dropClaim: 'GOTCHA! Ring grabbed — check your bag.',
  },

  advisory: {
    kicker: 'Bag check',
    equipFallback: 'Equip it',
    equipCallout: (level, noun) => `Equip the Level ${level} ${noun}`,
    badge: (noun) => `↑ Better ${noun} in your bag`,
    emptySlot: (stage, duration, noun, bestLevel) =>
      `Stage ${stage} — ${duration} with no progress. Your ${noun} slot is empty and a ` +
      `Level ${bestLevel} ${noun} is sitting in your bag. It won't equip itself.`,
    betterSlot: (stage, duration, noun, bestLevel, ratio, currentLevel) =>
      `Stage ${stage} — ${duration} with no progress. The Level ${bestLevel} ${noun} in your bag ` +
      `is ${ratio}the power of the Level ${currentLevel} you're running. It won't equip itself.`,
  },

  achievements: {
    title: 'Achievements',
    catalog: {
      'first-blood': {
        title: 'First Blood',
        description: 'Kill your first enemy. Congratulations, you monster.',
      },
      'first-click': {
        title: 'Finger Guns',
        description: 'Deal damage by actually tapping the enemy. Feel that wrist.',
      },
      'boss-slayer': {
        title: 'Boss Slayer',
        description: 'Defeat your first boss. They had a family; you had a spreadsheet.',
      },
      'wall-hit': {
        title: 'The Wall',
        description: 'Hit your first progression wall. This is fine. Everything is fine.',
      },
      'choice-made': {
        title: 'Deal With It',
        description: 'Resolve your first boss-check or wall choice. Growth is uncomfortable.',
      },
      'stage-10': {
        title: 'Getting Somewhere',
        description: 'Reach stage 10. Momentum is a hell of a drug.',
      },
      'stage-25': {
        title: 'Deep Run',
        description: 'Reach stage 25. This is your life now.',
      },
      'stage-50': {
        title: 'Halfway to Nowhere',
        description: 'Reach stage 50. Congratulations on the absence of an ending.',
      },
      'geared-up': {
        title: 'Geared Up',
        description: "Equip your first piece of gear. Now you're somebody.",
      },
      'first-upgrade': {
        title: 'Cha-Ching',
        description: 'Buy your first upgrade. The gold-to-power pipeline is now open.',
      },
      'ring-bearer': {
        title: 'My Precious',
        description: "Equip a ring. It's not obsessive if it's enchanted.",
      },
      'double-ringed': {
        title: 'Double-Fisted',
        description: 'Wear a ring in both slots. Two hands, twice the commitment issues.',
      },
      bedazzled: {
        title: 'Bedazzled',
        description: "Acquire a necklace. It's heavy, it's gaudy, it's load-bearing.",
      },
      bling: {
        title: 'Bling Bling',
        description: 'Wear a necklace and at least one ring at once. Subtlety is for other games.',
      },
      'full-kit': {
        title: 'Dressed to Kill',
        description: 'Fill all four slots — weapon, both rings, necklace. Absolutely shredded.',
      },
      'big-iron': {
        title: 'Big Iron on His Hip',
        description: (level) => `Equip a weapon of item level ${level} or higher.`,
      },
      hoarder: {
        title: "It's Not Hoarding If It's Gear",
        description: (threshold) =>
          `Hold ${threshold} unequipped items in your bag. You may need them. You won't.`,
      },
      'bag-lady': {
        title: 'Bag Lady',
        description: "Fill every bag slot. It's not a problem, it's a collection.",
      },
      'crit-investor': {
        title: 'Crit Investor',
        description: 'Reach 25% total critical chance. Math is on your side.',
      },
      'crit-half': {
        title: 'Coin Flip',
        description: 'Reach 50% total critical chance. Half the time, it works every time.',
      },
      'crit-maxed': {
        title: 'Statistically Inevitable',
        description: (percent) =>
          `Reach the ${percent}% critical chance cap. The dice are rigged, and you rigged them.`,
      },
      'loose-change': {
        title: 'Loose Change',
        description: (gold) => `Bank ${gold} gold at once. Big spender energy.`,
      },
      'touch-grass': {
        title: 'Touch Grass',
        description: 'Play for 10 minutes straight. The grass remains untouched.',
      },
      'grass-30': {
        title: 'Have You Tried Touching More Grass?',
        description: 'Play for 30 minutes straight. The sun is, statistically, a myth.',
      },
      'milestone-first': {
        title: 'The Spike Is Real',
        description: 'Cross your first upgrade milestone. Same gold, but it finally did something.',
      },
      'upgrade-diversified': {
        title: 'Equal Opportunity Investor',
        description: 'Put at least one upgrade into every equipped slot. Diversify, they said.',
      },
      'upgrade-veteran': {
        title: 'Serial Upgrader',
        description: (levels) =>
          `Hold ${levels} total upgrade levels across your gear. Gold well spent, allegedly.`,
      },
      'shiny-claimed': {
        title: 'Ooh, Shiny',
        description: 'Claim your first Stray Goblin haul. It was carrying that for you the whole time.',
      },
      'shiny-frenzy': {
        title: 'Double-Dipping',
        description: 'Claim a Shiny while a frenzy is already running. Greed is a strategy.',
      },
      'shiny-escape': {
        title: 'No Shiny Left Behind',
        description: "Let a Stray Goblin escape. It's fine. You didn't want it anyway.",
      },
    },
    shelf: {
      countDefault: ' unlocked',
      count: (total) => ` of ${total} unlocked`,
      showDefault: 'Show hidden',
      show: (count) => `Show hidden ${count}`,
      hide: 'Hide hidden',
      teaser: '???',
      locked: 'Locked',
      empty: 'No achievements yet — go break something.',
    },
  },

  // Declared art contract (see theme/contract.ts). Names/dimensions are the
  // single source of truth there; this theme supplies the file names T4 will
  // load. No image is loaded or rendered yet.
  assets: {
    'player-idle': 'player-idle.png',
    'player-attack': 'player-attack.png',
    'player-hurt': 'player-hurt.png',
    'enemy-grunt-idle': 'enemy-grunt-idle.png',
    'enemy-grunt-attack': 'enemy-grunt-attack.png',
    'enemy-grunt-hurt': 'enemy-grunt-hurt.png',
    'enemy-grunt-death': 'enemy-grunt-death.png',
    'boss-grunt-idle': 'boss-grunt-idle.png',
    'boss-grunt-attack': 'boss-grunt-attack.png',
    'boss-grunt-hurt': 'boss-grunt-hurt.png',
    'boss-grunt-death': 'boss-grunt-death.png',
    'shiny-idle': 'shiny-idle.png',
    'shiny-frenzy': 'shiny-frenzy.png',
    'shiny-drop': 'shiny-drop.png',
    'shiny-cache': 'shiny-cache.png',
    'spawn-popup': 'spawn-popup.png',
    'gear-weapon-t1': 'gear-weapon-t1.png',
    'gear-weapon-t2': 'gear-weapon-t2.png',
    'gear-weapon-t3': 'gear-weapon-t3.png',
    'gear-weapon-t4': 'gear-weapon-t4.png',
    'gear-ring1-t1': 'gear-ring1-t1.png',
    'gear-ring1-t2': 'gear-ring1-t2.png',
    'gear-ring1-t3': 'gear-ring1-t3.png',
    'gear-ring1-t4': 'gear-ring1-t4.png',
    'gear-ring2-t1': 'gear-ring2-t1.png',
    'gear-ring2-t2': 'gear-ring2-t2.png',
    'gear-ring2-t3': 'gear-ring2-t3.png',
    'gear-ring2-t4': 'gear-ring2-t4.png',
    'gear-necklace-t1': 'gear-necklace-t1.png',
    'gear-necklace-t2': 'gear-necklace-t2.png',
    'gear-necklace-t3': 'gear-necklace-t3.png',
    'gear-necklace-t4': 'gear-necklace-t4.png',
  },

  // Animation cues (display-only). Each cue names a DECLARED asset slot above
  // and a millisecond duration the frame stays up; durations never reach the
  // engine or the sim.
  animation: {
    cues: {
      playerAttack: { slot: 'player-attack', durationMs: 180 },
      enemyHit: { slot: 'enemy-grunt-hurt', durationMs: 150 },
      enemyDeath: { slot: 'enemy-grunt-death', durationMs: 400 },
      bossHit: { slot: 'boss-grunt-hurt', durationMs: 180 },
      bossDeath: { slot: 'boss-grunt-death', durationMs: 500 },
      stageEntered: { slot: 'spawn-popup', durationMs: 350 },
      shinySpawn: { slot: 'shiny-idle', durationMs: 300 },
      shinyClaim: { slot: 'shiny-frenzy', durationMs: 250 },
    },
  },
};
