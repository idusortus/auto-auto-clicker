// theme/lucky.ts — the SECOND theme: "Lucky", a golden retriever × husky.
//
// This theme is a real second implementer of the T1–T4 theme seam (text +
// colours + declared art). Its whole purpose is to prove the abstraction: the
// ONLY structural difference from `fantasy` is DISPLAY. Every identity value —
// achievement ids, gear `definitionId`s / `GearSlot` values, enemy ids,
// `ShinyKind` values, asset slot names and file names, the save schema — is
// unchanged, because a theme can never own identity.
//
// The fiction (mappings that must stay consistent everywhere they appear):
//   • Player            = Lucky (golden retriever × husky). You are the dog.
//   • `weapon`          = The Jaw (the bite is the DPS source).
//   • `ring1`/`ring2`   = dog tags (the two crit slots, naturally).
//   • `necklace`        = the bandana (gold/power).
//   • Enemy             = the mail carrier; boss = The Truck.
//   • Shiny             = a squirrel (frenzy = the chase, drop = buried tag,
//                         cache = treat stash).
//   • "Gold" currency   = kibble, because of course it is.
//
// Achievement copy is keyed by the SAME 30 stable ids and each description
// describes the SAME mechanical trigger the predicate implements (see
// `src/achievements.ts`). The ids and predicates are identity and are not
// repeated here — only the human wording is.

import type { Theme } from './types';

export const lucky: Theme = {
  name: 'lucky',

  // A sunlit-lawn scheme: pale green housing, dark forest text, and a warm
  // amber accent. Deliberately a light scheme, which is what exercises the
  // palette seam for real (the fantasy palette is dark). `dangerMuted`/`hpHi`/
  // `hpLo` stay red-ish: enemy HP is the one reserved red channel.
  palette: {
    bg: '#f4f9ea',
    surface: '#eaf3da',
    panel: '#dfeec8',
    surfaceRaised: '#ffffff',
    control: '#d2e5ad',
    line: '#bcd79a',
    lineStrong: '#8cb35f',
    text: '#182a0d',
    textDim: '#3a5020',
    textMuted: '#4f6830',
    textDisabled: '#87996a',
    accent: '#d98a06',
    accentHi: '#f0a53a',
    accentLo: '#b56200',
    accentEdge: '#8a4a00',
    accentInk: '#241300',
    dangerMuted: '#b02534',
    hpHi: '#ff6a48',
    hpLo: '#cf1f38',
  },

  ui: {
    hud: {
      gold: 'Kibble',
      stage: 'Block',
      dps: 'Chomp',
    },
    placeholder: '—',
    tapHint: 'Tap the mail carrier. Bite.',
    equippedTitle: 'Wearing',
    upgradeButton: 'Train',
    upgradeHint: 'You need something in your jaw before you can train it.',
    upgradeRow: {
      level: (level) => `Lv ${level}`,
      cost: (cost) => `Cost ${cost}`,
    },
    boost: {
      label: 'ZOOMIES',
      pill: (multiplier) => `ZOOMIES ×${multiplier}`,
      timer: (seconds) => `${seconds}s`,
    },
    splashKicker: 'Trophy earned',
    choice: {
      title: 'Decision time',
      wait: 'Wait it out — free',
      watchAd: 'Watch ad — not yet',
      watchAdTitle: 'Placeholder — no ad wiring in this build (see NOTES.md).',
      iap: 'Buy — not yet',
      iapTitle: 'Placeholder — no purchases wired in this build (see NOTES.md).',
      note: 'Waiting is free and always works. The ad and buy buttons are placeholders.',
    },
    offline: {
      title: 'You woke up',
      dismiss: 'Stretch',
      earned: (gold, duration) =>
        `You dreamed of squirrels and earned ${gold} kibble over about ${duration}.`,
      capped: ' Offline dreams are capped.',
    },
    duration: {
      lessThanMinute: 'less than a minute',
      seconds: (seconds) => `${seconds} s`,
      minutes: (minutes) => `${minutes} min`,
      hours: (hours) => `${hours} h`,
      hoursMinutes: (hours, minutes) => `${hours} h ${minutes} min`,
    },
    bag: {
      title: 'The stash',
      countSuffix: ' buried',
      empty: "Nothing buried yet — go ruin a mail carrier's day.",
      betterTag: '↑ Better',
      equip: 'Wear',
      level: (level) => `Level ${level}`,
      weaponSummary: (level, dps, click) => `${level} · damage ${dps} · chomp ${click}`,
      ringSummary: (level, crit, critDamage) =>
        `${level} · crit ${crit} (raw) · crit dmg +${critDamage} (raw)`,
      necklaceSummary: (level, gold, power) =>
        `${level} · kibble +${gold} (raw) · power +${power} (raw)`,
    },
  },

  slots: {
    display: {
      weapon: 'The Jaw',
      ring1: 'Left tag',
      ring2: 'Right tag',
      necklace: 'Bandana',
    },
    noun: {
      weapon: 'jaw',
      ring: 'tag',
      necklace: 'bandana',
    },
    card: {
      weapon: (level) => `The Jaw · level ${level}`,
      ring1: (level) => `Tag (left) · level ${level}`,
      ring2: (level) => `Tag (right) · level ${level}`,
      necklace: (level) => `Bandana · level ${level}`,
    },
    empty: {
      weapon: 'No jaw. Just vibes',
      ring1: 'No left tag',
      ring2: 'No right tag',
      necklace: 'No bandana',
    },
    stats: {
      weapon: (dps, click, upgrades) =>
        `Damage ${dps} · chomp ${click} · upgrades ${upgrades}`,
      ring: (crit, critDamage, totalCrit, totalCritDamage) =>
        `crit ${crit} (raw) · crit dmg +${critDamage} (raw) · ` +
        `total crit ${totalCrit} · crit dmg +${totalCritDamage} (capped)`,
      necklace: (gold, power, totalGold, totalPower) =>
        `kibble +${gold} (raw) · power +${power} (raw) · ` +
        `total kibble +${totalGold} · power +${totalPower} (capped)`,
      empty: 'Dig something out of the stash.',
    },
    milestone: {
      badge: (count, bonus) => `★ ×${count} — ${bonus}`,
      flourish: (slot, count, bonus) => `★ ${slot} step ×${count} — ${bonus}`,
      bonus: {
        separator: ' · ',
        crit: (percent) => `+${percent} crit`,
        critDamage: (percent) => `+${percent} crit dmg`,
        gold: (percent) => `+${percent} kibble`,
        power: (percent) => `+${percent} power`,
      },
    },
  },

  enemy: {
    label: 'Mail carrier',
    boss: 'The Truck',
    attackAria: 'Attack the mail carrier',
    hp: (current, max) => `${current} / ${max}`,
    bossCheck: 'Truck check',
    progressionWall: 'The fence',
    projectedKill: (ms) => ` Projected time to kill: ${ms} ms.`,
    bossCheckBody: (stage, projected) =>
      `Block ${stage} is a truck check and you are below the timer.${projected}`,
    progressionWallBody: (stage, projected) => `Block ${stage} is the fence.${projected}`,
  },

  shiny: {
    name: 'A squirrel',
    catchAria: 'Catch the squirrel',
    kind: {
      frenzy: 'CHASE MODE',
      drop: 'Buried tag',
      cache: 'Treat stash',
    },
    escape: "It made the fence. You'll be replaying that miss at 3am for a week.",
    claimed: 'GOT IT! Squirrel caught.',
    frenzyClaim: (multiplier) => `GOT IT! ZOOMIES ×${multiplier}`,
    dropClaim: 'GOT IT! Dug up a tag — check your stash.',
  },

  advisory: {
    kicker: 'Stash check',
    equipFallback: 'Wear it',
    equipCallout: (level, noun) => `Wear the Level ${level} ${noun}`,
    badge: (noun) => `↑ Better ${noun} in your stash`,
    emptySlot: (stage, duration, noun, bestLevel) =>
      `Block ${stage} — ${duration} with no progress. Your ${noun} slot is empty and a ` +
      `Level ${bestLevel} ${noun} is buried in your stash. Nobody is putting it on for you.`,
    betterSlot: (stage, duration, noun, bestLevel, ratio, currentLevel) =>
      `Block ${stage} — ${duration} with no progress. The Level ${bestLevel} ${noun} in your stash ` +
      `is ${ratio}the power of the Level ${currentLevel} you're wearing. It won't put itself on.`,
  },

  achievements: {
    title: 'Trophies',
    catalog: {
      'first-blood': {
        title: 'First Bite',
        description:
          'Kill your first mail carrier. He was only doing his job. So, in fairness, were you.',
      },
      'first-click': {
        title: 'Teeth First',
        description: 'Deal damage by actually biting — sorry, tapping — the enemy. Feel that jaw.',
      },
      'boss-slayer': {
        title: 'Truck Wrecked',
        description: 'Take down your first boss. He had a route. You had unresolved feelings.',
      },
      'wall-hit': {
        title: 'The Fence',
        description:
          'Hit your first progression wall. You cannot dig under it. Believe me, you have tried.',
      },
      'choice-made': {
        title: 'Made A Call',
        description:
          'Resolve your first boss-check or fence decision. Growth is uncomfortable; so is the mail.',
      },
      'stage-10': {
        title: 'End Of The Block',
        description: 'Reach stage 10. Momentum is one hell of a drug. So is the mail carrier.',
      },
      'stage-25': {
        title: 'Deep In The Neighbourhood',
        description: 'Reach stage 25. This is your life now. The leash is off.',
      },
      'stage-50': {
        title: 'Halfway To Nowhere',
        description: 'Reach stage 50. Congratulations on the complete absence of an ending.',
      },
      'geared-up': {
        title: 'Fit Check',
        description: "Equip your first piece of gear. Now you're somebody's dog.",
      },
      'first-upgrade': {
        title: 'Bought In',
        description: 'Buy your first upgrade. The kibble-to-power pipeline is now open.',
      },
      'ring-bearer': {
        title: 'Tagged',
        description: "Equip a dog tag. It's not a collar if it's load-bearing.",
      },
      'double-ringed': {
        title: 'Double Tagged',
        description: 'Wear a tag on both sides. Two tags, twice the identity crisis.',
      },
      bedazzled: {
        title: 'Bandana Acquisition',
        description:
          "Get your paws on a bandana, worn or buried in the stash. Heavy, gaudy, load-bearing.",
      },
      bling: {
        title: 'Business Casual',
        description:
          'Wear a bandana and at least one dog tag at the same time. Subtlety is for cats.',
      },
      'full-kit': {
        title: 'Fully Dressed',
        description: 'Fill all four slots — jaw, both tags, bandana. Absolutely shredded, for a dog.',
      },
      'big-iron': {
        title: 'Big Jaw On The Block',
        description: (level) => `Wear a jaw of item level ${level} or higher. An absolute unit of a bite.`,
      },
      hoarder: {
        title: "It's Not Hoarding If It's Stashed",
        description: (threshold) =>
          `Bury ${threshold} unequipped items in your stash. You might need them. You absolutely will not.`,
      },
      'bag-lady': {
        title: 'Stash Goblin',
        description: "Fill every stash slot. It's not a problem, it's a curated collection.",
      },
      'crit-investor': {
        title: 'Tag Investor',
        description:
          'Reach 25% total critical chance from your tags. The maths is on your side, for once.',
      },
      'crit-half': {
        title: 'Coin Flip',
        description: 'Reach 50% total critical chance. Half the time it works every time.',
      },
      'crit-maxed': {
        title: 'Statistically Inevitable',
        description: (percent) =>
          `Reach the ${percent}% critical chance cap. The dice are rigged, and you chewed them.`,
      },
      'loose-change': {
        title: 'Loose Kibble',
        description: (gold) => `Bank ${gold} kibble at once. Big spender energy. Small dog wallet.`,
      },
      'touch-grass': {
        title: 'Touch Grass',
        description: 'Play for 10 minutes straight. The grass, criminally, remains unsniffed.',
      },
      'grass-30': {
        title: 'Have You Tried Touching More Grass?',
        description: 'Play for 30 minutes straight. The sun, at this point, is an unverified rumour.',
      },
      'milestone-first': {
        title: 'The Step Is Real',
        description: 'Cross your first upgrade step. Same kibble, but it finally did something.',
      },
      'upgrade-diversified': {
        title: 'Equal Opportunity Chewer',
        description: 'Put at least one upgrade into every equipped slot. Diversify, they said.',
      },
      'upgrade-veteran': {
        title: 'Serial Upgrader',
        description: (levels) =>
          `Hold ${levels} total upgrade levels across your gear. Kibble well spent, allegedly.`,
      },
      'shiny-claimed': {
        title: 'Ooh, Squirrel',
        description: 'Claim your first squirrel haul. It was burying that for you the entire time.',
      },
      'shiny-frenzy': {
        title: 'Double-Dipping',
        description: 'Claim a squirrel while the zoomies are already running. Greed is a strategy.',
      },
      'shiny-escape': {
        title: 'The One That Got Away',
        description: 'Let a squirrel escape. It was faster. You are thinking about it right now.',
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
      empty: 'No trophies yet — go break something.',
    },
  },

  // Same 32 declared slots as every theme (names + dimensions are owned by
  // `contract.ts`). The folder is per-theme, so the file NAMES are identical —
  // only the files differ.
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
};
