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
    roster: {
      grunt: {
        name: 'Grunt',
        catchphrases: {
          spawn: ['You again. I have a shield and everything.', 'Form up, it is one of those clicking types.', 'I drew the short straw for this stage.', 'Nothing personal, adventurer. Just payroll.'],
          defeat: ['Tell my family I was a number on a spreadsheet.', 'I was two hits from retirement. Maybe one.', 'Worth it. Probably not.', 'Back to the barracks. Again.'],
          bossDefeat: ['I had a health bar THIS wide and you clicked it.', 'A boss! Beaten by a person with a mouse!', 'The title was temporary anyway.', 'So this is what a death frame feels like.'],
          wall: ['Stuck? I could stand here all day. I literally do.', 'Swing harder. I believe in you. Barely.', 'Your numbers are bad and you should feel bad.', 'I am not even dodging. This is just me.'],
          shiny: ['Ooh, a shiny. Go on, chase it. I will wait.', 'That goblin has better loot than me. Rude.', 'While you stare at that, I am healing. Or napping.', 'Do not let it get away. Actually, do.'],
          ambient: ['I have been standing here for forty-five seconds.', 'Is it just me or is this arena a bit dark?', 'I practise my idle animation in the mirror.', 'Any day now. No rush. I am salaried.'],
        },
      },
      goblin: {
        name: 'Goblin',
        catchphrases: {
          spawn: ['Shiny things! Give them here!', 'I smell loot. Mostly yours.', 'Ten gold says you miss the first tap.', 'I was hiding behind a slightly smaller rock.'],
          defeat: ['My gold... my beautiful, imaginary gold...', 'You looted me. That is my whole personality.', 'I regret nothing. Except this.', 'Curse you and your functional wrists!'],
          bossDefeat: ['I had a crown and everything. A paper one.', 'Boss goblin, slain by a browser tab.', 'Keep the crown. It was itchy.', 'You will never find my secret stash. It is right here. Take it.'],
          wall: ['Stuck? I could sell you a hint. Cheap.', 'Your gear is worse than what I stole this morning.', 'You cannot afford me. Literally, check your gold.', 'I will just keep counting my coins. Slowly.'],
          shiny: ['Ha! That goblin is shinier than me. Traitor.', 'Grab it quick before I do. I will, you know.', 'Two goblins in one arena. This is a scam.', 'Ignore it. It is probably cursed. Grab it anyway.'],
          ambient: ['I have a coupon for one free stabbing.', 'Do you take gold? I only take gold.', 'I was told there would be pockets to pick.', 'The economy is fake and I am thriving.'],
        },
      },
      wolf: {
        name: 'Wolf',
        catchphrases: {
          spawn: ['I have been howling for five minutes. Where were you?', 'Fresh meat. Metaphorically. Mostly.', 'My pack is... just me. Do not make it weird.', 'I smell fear and, faintly, kibble.'],
          defeat: ['Awoooo. That is a sad awooo, by the way.', 'I only wanted to play. Roughly.', 'My fur was magnificent. Was.', 'Tell the moon I said goodbye.'],
          bossDefeat: ['I was the alpha. Emphasis on was.', 'A whole boss, taken down by pointing and clicking.', 'My howl echoed. Now I do not.', 'The moon will hear of this. Faintly.'],
          wall: ['You run slower than I thought. And I am standing still.', 'Keep swinging. I will keep licking my paw.', 'Your damage per second is more like damage per year.', 'I have personally eaten bigger numbers than you.'],
          shiny: ['Squirrel? SQUIRREL. Wait, wrong theme. Still.', 'That shiny is mine. Everything is mine.', 'Chase it. I dare you. I will chase too.', 'I would grab that, but I am contractually an enemy.'],
          ambient: ['I am not a dog. I am a wolf. There is a difference.', 'I howl at things. It is a whole thing.', 'My breath is fine. Yours is questionable.', 'Stop staring. Start clicking. Or do not.'],
        },
      },
      bat: {
        name: 'Cave Bat',
        catchphrases: {
          spawn: ['Eeeeee! Sorry, that is just my voice.', 'I hang from the ceiling. It is a lifestyle.', 'I do not see well. I mostly guess and commit.', 'Flap flap. That is the sound. Flap.'],
          defeat: ['Eeeeee... a quieter eeeeee.', 'I was upside down this whole time.', 'Fell off the ceiling. For the last time.', 'Blind, but not blind enough to miss that hit.'],
          bossDefeat: ['A boss bat? I was the boss of a very small cave.', 'Eeeeee! That is my dramatic death eeeee.', 'I ruled the rafters. Past tense.', 'You clicked a bat. A boss bat. Congratulations.'],
          wall: ['Lost? I could guide you. I cannot see either.', 'Keep flapping those fingers. Nothing is happening.', 'I am a wall? No, YOU are the wall. Wait.', 'Eeeee. That was a bored eeeee.'],
          shiny: ['Shiny? Where? I cannot see it. Describe it.', 'Is it moving? Everything moves to me.', 'Grab it. I will watch. Poorly.', 'Eeeee! New thing! Same confusion!'],
          ambient: ['Fun fact: I am three bats in a trench coat.', 'I navigate by screaming. It works. Mostly.', 'Ceiling is home. Floor is lava. This is fine.', 'Eeeeeeeeee. No reason. Just eeeeee.'],
        },
      },
      slime: {
        name: 'Slime',
        catchphrases: {
          spawn: ['Squish. Welcome. Squish.', 'I am mostly water and bad decisions.', 'Ooze in. Ooze is the only verb I know.', 'Do not mind the puddle. The puddle is me.'],
          defeat: ['I am... melting. This is normal for me though.', 'Glub. That was my last glub.', 'Spread out. Become a floor. Classic slime move.', 'You popped me. Rude, but effective.'],
          bossDefeat: ['The big slime... reduced to a small puddle.', 'I was a boss. Now I am a stain.', 'Glub. A boss glub. My final glub.', 'All that ooze, and it ends like this.'],
          wall: ['Stuck? I have been stuck to this floor for ages.', 'My HP is not going down. Mostly because I am ooze.', 'Hit me again. I will absorb it. I always do.', 'You are not progressing. I can tell. I am a wall.'],
          shiny: ['A shiny! I want to absorb it. That is how I show love.', 'Ooh. Sparkly. I am also sparkly. Slightly wet.', 'Catch it. Or do not. I cannot move fast enough to help.', 'It slipped past me. Everything slips past me.'],
          ambient: ['Squish. That is the whole quote.', 'I contain multitudes. And water. Mostly water.', 'Someone stepped in me once. We are still in touch.', 'I ooze, therefore I am. Slowly.'],
        },
      },
      bandit: {
        name: 'Bandit',
        catchphrases: {
          spawn: ['Stand and deliver. Your gold, specifically.', 'This is a robbery. I have done this before.', 'Empty your pockets. Slowly. Dramatically.', 'I have a knife and a business plan.'],
          defeat: ['You just mugged the mugger. Is that allowed?', 'All that gold... going to the good guy...', 'I pickpocketed the wrong spreadsheet.', 'Take my gold. It is basically yours already.'],
          bossDefeat: ['The boss bandit. Robbed by a first-person nobody.', 'I had a whole crime syndicate. It was me.', 'Extortion, out the window. Literally my window.', 'You cannot loot a legend. Apparently you can.'],
          wall: ['Stuck? I could loan you gold. At my rates.', 'You are poor AND stuck. Impressive.', 'I would help, but it would cost you everything.', 'Pay me and maybe your numbers improve. Maybe.'],
          shiny: ['A shiny? That is my retirement fund, running away.', 'Grab it before some OTHER goblin does.', 'Sparkly gold. My one weakness. And also my goal.', 'I would chase it, but I am on the clock.'],
          ambient: ['Crime does not pay, but it is a steady gig.', 'I rob people. It is not honest work. I make it look honest.', 'Have you considered a life of banditry? No? Fair.', 'My hideout is right behind this barely-camouflaged rock.'],
        },
      },
      spider: {
        name: 'Giant Spider',
        catchphrases: {
          spawn: ['Welcome to my web. It is load-bearing.', 'Eight legs. Zero patience.', 'I knit. It is a hobby and a weapon.', 'You walked into the right alley. Wrongly.'],
          defeat: ['My web... all that hard work...', 'I was going to have you for dinner. Now look.', 'Squashed. On brand for a spider, honestly.', 'Eight legs, all of them giving up.'],
          bossDefeat: ['I was the queen of this web. A very small web.', 'A boss spider. Felled by a thumb.', 'Wrap it up, they said. I got wrapped up.', 'My reign was sticky and brief.'],
          wall: ['Tangled? Good. That is the point.', 'Keep struggling. It only makes the web tighter.', 'You are stuck. I find that deeply satisfying.', 'Stay a while. I will be over here, being patient.'],
          shiny: ['A shiny in my web? Mine now. I mean, go get it.', 'It is caught. Or it will be. Give it a moment.', 'Do not touch my shiny. Or do. I am an enemy.', 'Sparkly. Wrapped in silk. Delicious.'],
          ambient: ['I have woven the same web three times today.', 'Flies are unreliable. Enemies, apparently, are not.', 'Eight legs are a lot to keep track of, honestly.', 'Please do not tell anyone I am afraid of shoes.'],
        },
      },
      wraith: {
        name: 'Wraith',
        catchphrases: {
          spawn: ['I have returned. Also I never really left.', 'Bound by unspoken things. Mostly unpaid invoices.', 'My form is mist and unfinished business.', 'OooOOoo. That is the sound. OooOOoo.'],
          defeat: ['Back to the void. It is fine. Great, even.', 'I am already dead. This is just embarrassing.', 'My mist is dispersing. Rude.', 'Fading... again... as is tradition.'],
          bossDefeat: ['A boss wraith, undone by a living person with a phone.', 'I haunted a spreadsheet. It did not prepare me for this.', 'Back to the great beyond. It has better wifi.', 'Death was merely the tutorial.'],
          wall: ['You are stuck here with me. Forever. Or until a tap.', 'My HP refuses to fall. Spirit is stubborn.', 'I could pass through you. Instead I will judge you.', 'The wall is real. So am I. Mostly.'],
          shiny: ['A shiny. Souls love shinies. Wait, that is not right.', 'It glows. I also glow. We are alike.', 'Catch it before it joins the afterlife.', 'I would haunt it, but it is already mysterious.'],
          ambient: ['I died of a paper cut. No further questions.', 'Mist is a full-time job. I do not get breaks.', 'I watched you click for an hour. It was fine.', 'OooOOoo. I do that to pass the time.'],
        },
      },
      ogre: {
        name: 'Ogre',
        catchphrases: {
          spawn: ['Ogre smash. Ogre also forget. Ogre forgive, maybe.', 'Big. Angry. Simple. Ogre.', 'You point, Ogre growl. Good trade.', 'Ogre here now. Ogre do not know why.'],
          defeat: ['Ogre... fall over... now.', 'Ogre see stars. Ogre forgot stars were there.', 'Ogre was just following orders. Ogre made them up.', 'Bye bye, Ogre. Ogre say bye bye.'],
          bossDefeat: ['Boss Ogre. That is just Ogre with a hat.', 'Ogre was king of the hill. Ogre fell off.', 'Big Ogre, small click. That is story.', 'Ogre do not understand. Ogre still lose.'],
          wall: ['Ogre not move. You not move. Same.', 'Hit Ogre. Ogre does not mind. Ogre forgets to mind.', 'Ogre bored. Ogre also bored of you.', 'Your hits are small. Ogre thoughts are also small.'],
          shiny: ['Ogre want shiny. Ogre not allowed. Ogre sad.', 'Little sparkle. Ogre like little sparkle.', 'Catch it. Ogre will cheer. Ogre cheer by standing.', 'Shiny fast. Ogre slow. Sad combination.'],
          ambient: ['Ogre is a people person. There are no people.', 'Ogre hobby is standing exactly here.', 'Ogre thought about thinking. Too hard.', 'Ogre hungry. Ogre always hungry. That is Ogre.'],
        },
      },
      harpy: {
        name: 'Harpy',
        catchphrases: {
          spawn: ['SCREEE! That is my inside voice!', 'I perch, I swoop, I screech. Mostly screech.', 'The skies belong to me. This arena, apparently, also.', 'Wings spread. Opinions louder.'],
          defeat: ['Falling... this is NOT a dive attack...', 'My feathers! Mind the feathers!', 'Grounded. The one thing a harpy fears.', 'SCREEE... a small, sad screee.'],
          bossDefeat: ['A boss harpy! Defeated mid-screech!', 'I ruled the thermals. I ruled nothing.', 'My majestic wingspan... crumpled.', 'SCREEEE! For dramatic effect.'],
          wall: ['Stuck on the ground? Join the club. Wings up.', 'I would dive-bomb you, but you are already down.', 'Weak hits. I have taken worse from the weather.', 'SCREEE. That was a mocking screee.'],
          shiny: ['Sparkly! I must have it for my nest!', 'It flaps. It is not a bird. I am offended.', 'Catch it. I cannot. My talons are busy.', 'Ooh, treasure. My nest is a mess anyway.'],
          ambient: ['I once stole a whole sandwich. Peak of my career.', 'Thermals are lovely. This cave is not a thermal.', 'SCREEE. That was unprompted. As usual.', 'I am part songbird. The song is screaming.'],
        },
      },
      golem: {
        name: 'Stone Golem',
        catchphrases: {
          spawn: ['I am built from stone and patience.', 'I move slowly. My HP does not move at all.', 'Ancient. Grumpy. Load-bearing.', 'You woke me. That was a mistake for both of us.'],
          defeat: ['Cracking... finally... a decent rest...', 'I was a wall. Now I am gravel.', 'Two thousand years, undone in a few hundred clicks.', 'Dust returns to dust. On schedule.'],
          bossDefeat: ['A boss golem. Reduced to landscaping.', 'I held up a temple once. Now I hold up nothing.', 'The mountain falls. The mountain is me.', 'Astonishing. I have seen empires do less damage.'],
          wall: ['We are the same, you and I. Neither of us is moving.', 'I am the wall. You are also the wall. This is a meeting.', 'I will outlast you. I have outlasted mountains.', 'Continue clicking. I will continue existing.'],
          shiny: ['A shiny. I will not chase it. I am a boulder.', 'It glitters. So did the treasure I was built to guard.', 'Fetch it, tiny creature. Or do not. I do not.', 'Sparkles. I remember sparkles. Fondly. Barely.'],
          ambient: ['I have been here for four ages. The wifi is new.', 'Someone carved a face on me. Rude. Accurate.', 'I do not age. I just get shorter. Structurally.', 'Ohm. That was a stone noise. Please applaud.'],
        },
      },
      dragonling: {
        name: 'Dragonling',
        catchphrases: {
          spawn: ['A dragon! A small one! Still a dragon!', 'Do not be fooled by the size. Be fooled by the ambition.', 'I hoard gold. I have three coins. Do not touch them.', 'Roar. It is a small roar, but it is a roar.'],
          defeat: ['My hoard... all three coins...', 'I was forty feet tall. In my head.', 'A dragon does not fall. A dragonling, apparently, does.', 'This will not be on my Wikipedia page.'],
          bossDefeat: ['Boss dragonling! The smallest boss with the biggest ego!', 'I was going to rule the skies. The skies are small.', 'My flame was a warm draft. And it is out.', "Slain by a tap. A dragon's nightmare."],
          wall: ['Stuck at a wall? How humiliating. For you, I mean.', 'I could help. I will not. Dragon code.', 'Your DPS is a rounding error. My hoard is a rounding error. Match.', 'Keep going. I am counting your failures. Three so far.'],
          shiny: ['Shiny! Mine! I mean, go get it. It is yours. Ugh.', 'A rival for the hoard. Catch it first.', 'It glitters like my three coins. Almost.', 'Dragons love shiny things. This is accurate. Go.'],
          ambient: ['I am technically a legendary encounter. Technically.', 'I breathe fire. My fire is a warm breeze. It still counts.', 'Do not tell the big dragons about this stage.', 'One day, the hoard will be enormous. Today is not that day.'],
        },
      },
    },
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
    'player-idle': ['player-idle-0.png', 'player-idle-1.png'],
    'player-attack': ['player-attack-0.png', 'player-attack-1.png'],
    'player-hurt': ['player-hurt-0.png', 'player-hurt-1.png'],
    'enemy-grunt-idle': ['enemy-grunt-idle-0.png', 'enemy-grunt-idle-1.png'],
    'enemy-grunt-attack': ['enemy-grunt-attack-0.png', 'enemy-grunt-attack-1.png'],
    'enemy-grunt-hurt': ['enemy-grunt-hurt-0.png', 'enemy-grunt-hurt-1.png'],
    'enemy-grunt-death': ['enemy-grunt-death-0.png', 'enemy-grunt-death-1.png', 'enemy-grunt-death-2.png'],
    'boss-grunt-idle': ['boss-grunt-idle-0.png', 'boss-grunt-idle-1.png'],
    'boss-grunt-attack': ['boss-grunt-attack-0.png', 'boss-grunt-attack-1.png'],
    'boss-grunt-hurt': ['boss-grunt-hurt-0.png', 'boss-grunt-hurt-1.png'],
    'boss-grunt-death': ['boss-grunt-death-0.png', 'boss-grunt-death-1.png', 'boss-grunt-death-2.png'],
    'shiny-idle': ['shiny-idle-0.png', 'shiny-idle-1.png'],
    'shiny-frenzy': ['shiny-frenzy-0.png', 'shiny-frenzy-1.png'],
    'shiny-drop': ['shiny-drop-0.png', 'shiny-drop-1.png'],
    'shiny-cache': ['shiny-cache-0.png', 'shiny-cache-1.png'],
    'spawn-popup': ['spawn-popup-0.png'],
    'gear-weapon-t1': ['gear-weapon-t1-0.png'],
    'gear-weapon-t2': ['gear-weapon-t2-0.png'],
    'gear-weapon-t3': ['gear-weapon-t3-0.png'],
    'gear-weapon-t4': ['gear-weapon-t4-0.png'],
    'gear-ring1-t1': ['gear-ring1-t1-0.png'],
    'gear-ring1-t2': ['gear-ring1-t2-0.png'],
    'gear-ring1-t3': ['gear-ring1-t3-0.png'],
    'gear-ring1-t4': ['gear-ring1-t4-0.png'],
    'gear-ring2-t1': ['gear-ring2-t1-0.png'],
    'gear-ring2-t2': ['gear-ring2-t2-0.png'],
    'gear-ring2-t3': ['gear-ring2-t3-0.png'],
    'gear-ring2-t4': ['gear-ring2-t4-0.png'],
    'gear-necklace-t1': ['gear-necklace-t1-0.png'],
    'gear-necklace-t2': ['gear-necklace-t2-0.png'],
    'gear-necklace-t3': ['gear-necklace-t3-0.png'],
    'gear-necklace-t4': ['gear-necklace-t4-0.png'],
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
