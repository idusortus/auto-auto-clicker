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
    tapHint: 'Bite the mail carrier.',
    equippedTitle: 'Wearing',
    upgradeButton: 'Train',
    upgradeHint: 'Nothing in your jaw to train. Put something in your jaw.',
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
        `You dreamed about the squirrel again and made ${gold} kibble over about ${duration}.`,
      capped: ' Dreams are capped. Deal with it.',
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
      empty: 'Nothing buried. Somewhere out there a mail carrier is having a normal day.',
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
    roster: {
      grunt: {
        name: 'Mail carrier',
        catchphrases: {
          spawn: ['Mail delivery! Special delivery of getting barked at.', 'I have a parcel and no fear. Worse: no training.', 'You again. The pepper spray is on my OTHER hip.', 'Sign here, please. Or do not. I am used to it.'],
          defeat: ['I am going to lose this job. Again.', 'The parcel was fragile. So am I.', 'Tell the post office I died doing what I loved. Walking.', 'You win this round. There is always tomorrow on this route.'],
          bossDefeat: ['A boss mail carrier! The mail does not stop, but I do.', 'I had a route. Now I have a therapy appointment.', 'First the dog, now the whole universe. Typical.', 'Keep the package. It was a phone book this whole time.'],
          wall: ['Stuck? First time? I have been stuck at this gate for years.', 'You are not even defending. I am just standing on the porch.', 'Keep growling. The parcel is not going anywhere. Neither are you.', 'I would ring the bell, but I cannot reach it either.'],
          shiny: ['A squirrel? On MY route? Grab it before I have to.', 'Sparkly thing. You lose your mind over those. I have watched.', 'Catch it. I am not chasing that. Wait, I have to.', 'Shiny. Great. Now we are both distracted. Typical Tuesday.'],
          ambient: ['I have a package, a dog, and a bad back. Bring it on.', 'Do you know how many stairs my route has? I do. Fifty-one.', 'The trick is to walk fast and make no eye contact.', 'I am just a guy doing a job that gets barked at hourly.'],
        },
      },
      goblin: {
        name: 'Package courier',
        catchphrases: {
          spawn: ['Courier! Different courier! The cool one!', 'Two-day shipping. It has been two days. It is not here. Not my fault.', 'I have your kibble subscription and zero patience.', 'Left at the door? I wish. I got barked at.'],
          defeat: ['My delivery metrics... they will never forgive me...', 'I was going to make the truck. I never make the truck.', 'The dog won this time. And last time. And the time before.', 'Take the box. It is just a box of training pads anyway.'],
          bossDefeat: ['A boss courier. Felled by a good boy. This is on my record.', 'I had a route optimisation handbook. It is in shreds. Literally.', 'The package is delivered. The courier is not.', 'On-time delivery, one hundred percent. Dying on time.'],
          wall: ['Stuck? Same. The van left without me. Again.', 'I could help you, but this parcel is heavy and I am weak.', 'Keep at it. Your numbers are as poor as my route planning.', 'I will be here. Waiting. Like a parcel on the porch.'],
          shiny: ['A squirrel! Ooh. Sorry, was I supposed to fight you?', 'Sparkly. I have a box with sparkly tape. Want it?', 'Catch it. I will tell my manager I lost it. Again.', 'Shiny! I will just... sort of watch. That is my thing.'],
          ambient: ['If I knock and you bark, does anyone get paid?', 'I have held this parcel for six blocks. My arms are gone.', 'The tracking says delivered. The tracking is a liar.', 'I am in a union. That is the only reason I am still here.'],
        },
      },
      wolf: {
        name: 'Backyard cat',
        catchphrases: {
          spawn: ['The mail again. You expect me to care. I do not.', 'I live here. You do not. Simple as that.', 'I am on the fence. Emotionally and literally.', 'Hiss. That is your warning. It is a short warning.'],
          defeat: ['Fine. The dog wins one. The dog tells no one.', 'I let you. For my own reasons. Napping.', 'I am not hurt. I am resting. Dramatically.', 'This fence was mine. Now it is a crime scene.'],
          bossDefeat: ['The boss of the yard? It was a small yard.', 'You got me. I still have nine lives. Redistributing them.', 'I have ruled this backyard for nine years. It ends on a Tuesday.', 'The dog wins. Tell no one. Actually, tell everyone. I am too tired.'],
          wall: ['Stuck? I could knock your numbers off the ledge. Tempting.', 'You are slow. I have watched paint dry. It was faster.', 'I am the wall. You are the dog barking at the wall. Classic.', 'Keep going. I will sit here and judge. My favourite hobby.'],
          shiny: ['A squirrel! I ignore those. You do not. Interesting.', 'Shiny. I have no interest. Unless it is a nap. Then yes.', 'Catch it, dog. I will watch from this warm spot.', 'Sparkly. Great. The one thing louder than your barking.'],
          ambient: ['I am the villain here. Fitting. I am also the landlord.', 'I cleaned that fence with my tongue. It is mine.', 'You bark at the mail carrier. I bark at you. The system works.', 'Napping is a full-time job. I am excellent at it.'],
        },
      },
      bat: {
        name: 'Pigeon',
        catchphrases: {
          spawn: ['Coo. Coo. That is pigeon for, get off my sidewalk.', 'I walked into the park. You walked into me. Mutual.', 'Wings of chaos. Head of questions.', 'I have bread. You have a problem with bread.'],
          defeat: ['Coo... a quieter, sadder coo...', 'I was going to eat that bread. It was mostly gravel.', 'Felled by a dog. Again. Statistics are cruel.', 'Tell the flock. Tell them I was brave. Tell them I had bread.'],
          bossDefeat: ['Pigeon boss. The coop most feared. And least loved.', 'I ruled the fountain square. Briefly. It is a small square.', 'Wings down. Dramatically. For the audience. There is no audience.', 'A boss pigeon. The bread line has lost its leader.'],
          wall: ['Stuck? I have lived here since the summer. Join me.', 'I am the wall. I also stand on the wall. It is a whole thing.', 'Keep flapping, dog. Make the numbers. Or do not.', 'I could fly away. I choose not to. Out of spite.'],
          shiny: ['A squirrel. Also tiny. Also fast. Different genre.', 'Shiny? I peck at it. Nothing happens. Classic.', 'Catch it. I will coo passive-aggressively.', 'Sparkly. I once found a shiny chip. It was a crisp packet.'],
          ambient: ['I am not a bat. I am a pigeon. Common mistake. Rude.', 'Bread is my life. This is not a metaphor.', 'I have no natural predators. Except that one cafe.', 'Coo. That was filler. I do that.'],
        },
      },
      slime: {
        name: 'Sprinkler',
        catchphrases: {
          spawn: ['Sprinkler on! Take that, lawn!', 'Water everywhere. My purpose is unclear but wet.', 'You stepped on my hose. Now we are enemies forever.', 'Hiss. Sssspray. That is my battle cry.'],
          defeat: ['Pssssh... the pressure is... leaking...', 'All that water... for this lawn...', 'I was only trying to help the grass. The grass did not ask.', 'Broken. Right in the middle of a heatwave. Classic.'],
          bossDefeat: ['The boss sprinkler. Defeated mid-spray.', 'I watered the whole street. My legacy. Gone.', 'The hose is dead. Long live the hose.', 'A lifetime of service. Ended by a golden retriever with zoomies.'],
          wall: ['Stuck? I have been stuck to this spot since spring.', 'You cannot outlast me. I run on water and spite.', 'Keep trying. I will keep spinning. Slowly. Mockingly.', 'I am the wall. A wet, disappointing wall.'],
          shiny: ['A squirrel! It drinks from me! Rude!', 'Shiny. Probably a hose fitting. I lost one of those.', 'Catch it. I will spray in celebration. Or error.', 'Sparkly water. That is my whole thing. You are welcome.'],
          ambient: ['I spray in a circle. It is art. The neighbours disagree.', 'I have watered this one dandelion for three years.', 'Rain makes me redundant. I take it personally.', 'Psssssh. That was idle. I idle loudly.'],
        },
      },
      bandit: {
        name: 'Porch pirate',
        catchphrases: {
          spawn: ['I am here for the package. And the doormat. And the vibe.', 'Porch pirate. It is like a regular pirate, but lazier.', 'No witnesses, just a dog. A very loud dog.', 'I took your box. I will be back for the second box.'],
          defeat: ['The box... it was empty... all along...', 'Beaten by a dog on its own porch. Low point.', 'Tell the neighbourhood I went out swinging. I did not.', 'Keep the doormat. It had your dirt on it anyway.'],
          bossDefeat: ['The boss porch pirate. Foiled by a golden retriever.', 'I had a whole cul-de-sac. A whole cul-de-sac!', 'My empire was three driveways and a mailbox.', 'The porch was mine. It was never really mine.'],
          wall: ['Stuck? I could steal your numbers. I would, too.', 'I have taken emptier porches than this.', 'Keep clicking. I will keep lurking. It is what I do.', 'I am the wall. The wall has a van running outside.'],
          shiny: ['A squirrel? I will fence that. Good money.', 'Shiny. I take those. That is literally my job.', 'Grab it first. I am casing a different porch.', 'Sparkly. Bet it is worth a box of treats. To someone.'],
          ambient: ['Delivery times are suggestions. So is the law.', 'I have a van. I have a plan. The plan is the van.', 'Doormats are unappreciated art. I am a collector.', 'Stealth is easy. Everyone expects a delivery van.'],
        },
      },
      spider: {
        name: 'Ceiling fan',
        catchphrases: {
          spawn: ['Whirrr. It is hot. I am doing my best.', 'You looked up. That was your first mistake.', 'I spin. I cool. I menace. Multitasking.', 'Cobweb? That is patina. It is intentional.'],
          defeat: ['Whiiirrr... slowing... down...', 'All those summers... for nothing...', 'I was the breeze. Now I am decor.', 'Dust. Endless dust. And now this.'],
          bossDefeat: ['The boss fan. Brought down mid-rotation.', 'I cooled this living room for a decade. A decade.', 'The wobble was always there. I ignored it. Fatal.', 'A dog jumped and I fell. This is the whole obituary.'],
          wall: ['Stuck? I have been stuck on this ceiling since 2019.', 'You cannot reach me. I cannot help you. Balance.', 'Keep jumping, dog. Nothing will happen. Statistically.', 'I rotate. You stagnate. We are not the same.'],
          shiny: ['A squirrel?! Indoors?! Turn me faster, I must chase!', 'Shiny. I reflect. That is my whole aesthetic.', 'Catch it. I will cheer. I cheer by rotating.', 'Sparkly. I have a bulb like that. It flickers. Foreshadowing.'],
          ambient: ['I have a pull chain. No one ever pulls it. I dangle hopefully.', 'My blades are dustier than my soul.', 'I am technically three objects spinning. We are a team.', 'Whirrr. Sorry. That was the wind. I absorb it.'],
        },
      },
      wraith: {
        name: 'The vacuum',
        catchphrases: {
          spawn: ['VROOOOM. I have returned. And I will not be stopped.', 'I eat crumbs. I fear nothing but long fur.', 'The closet could not hold me forever.', 'I have been waiting behind the couch. Patiently. Loudly.'],
          defeat: ['The cord... got... yanked...', 'I was only going to do the rug. I always do.', 'Fur. Endless fur. I died as I lived: clogged.', 'Vrrr... a small, disappointed vrrr...'],
          bossDefeat: ['The boss vacuum. Sucks, in the technical sense, no longer.', 'I have consumed three years of dog hair. This is my reward.', 'I was the loudest thing in this house. Was.', 'The bag was full. So was my life.'],
          wall: ['Stuck? I have been wedged under this couch forever.', 'You cannot outlast me. I run on mains power.', 'Keep barking. I will keep screaming. We match.', 'I am the wall. I am also under the wall. Help.'],
          shiny: ['A squirrel! If I catch it, I must inhale it. Wait.', 'Shiny. I will suck it up. That is my love language.', 'Grab it before it goes under the couch where I live.', 'Sparkly. I once ate a whole earring. No regrets.'],
          ambient: ['VROOOOM. That was nothing. I am just like this.', 'I fear the stairs. Do not tell the dog.', 'I have a hose and a dream. The hose is too short.', 'Static electricity is my one weakness. And rugs.'],
        },
      },
      ogre: {
        name: 'Lawn mower',
        catchphrases: {
          spawn: ['BRRRM. Out of the shed. Ready to ruin a lawn.', 'I cut grass. I cut everything, honestly.', 'The dog hates me. The dog is correct.', 'Blades out. Dignity optional.'],
          defeat: ['Out of... gas... and time...', 'The blade... the blade spun its last...', 'I mowed that dandelion into legend.', 'BRRR... a dying brrr...'],
          bossDefeat: ['The boss mower. Defeated by a dog and a hose.', 'I have scalped this entire lawn. It ends in the flowerbed.', 'A decade of Saturdays. Gone.', 'The shed will be quiet tonight. It never is.'],
          wall: ['Stuck? I have been stuck on this same patch for ten minutes.', 'You cannot break me. I am mostly engine and rust.', 'Keep going. I will keep chewing. It is mutual.', 'I am the wall. A loud, oily wall.'],
          shiny: ['A squirrel! Out of my way, I have a lawn to ruin.', 'Shiny. I found a bottle cap once. Same energy.', 'Catch it. I will not chase. I am on a strict schedule.', 'Sparkly. My deck reflects light. Barely. Mostly rust.'],
          ambient: ['I run on petrol and spite. Mostly spite.', 'I have mowed the same strip fifteen times. It is a look.', 'The shed is my throne. The shed leaks.', 'BRRRM. That was unprompted. I do that.'],
        },
      },
      harpy: {
        name: 'Squirrel',
        catchphrases: {
          spawn: ['Chatter chatter. This is MY tree. And MY yard. And MY air.', 'I have been watching you through the window. Every day.', 'I buried a nut here. I will fight the post office for it.', 'Tail up. Dignity up. Fear nonexistent.'],
          defeat: ['My nuts... my beautiful cache...', 'I will remember this. I remember everything. Also I forget.', 'Felled by a dog. The fence was right there.', 'Chatter... a sad, final chatter...'],
          bossDefeat: ['Boss squirrel. Terror of gutters and bird feeders everywhere.', 'I have hacked a bird feeder for six straight years. It ends now.', 'The whole oak was mine. Was.', 'I taunted you from a branch. Now I taunt no more.'],
          wall: ['Stuck? I could get past this in one leap. You cannot.', 'I am on the fence, literally, judging you.', 'Keep throwing yourself at it. I will narrate.', 'I am the wall. The wall has acorns. You will never find them.'],
          shiny: ['Wait, that is MY shiny. Give it back. It is a squirrel thing.', 'Sparkly. I collect those. Professionally. Illegally.', 'Catch it, dog. Prove yourself. Or do not. Whatever.', 'A shiny in my territory. Bold. Very bold.'],
          ambient: ['I bark at you from the fence. Now you know how it feels.', 'I buried three acorns today. I remember none of their locations.', 'My nemesis is a plastic owl. We are at a stalemate.', 'Chatter. That means nothing. It means everything.'],
        },
      },
      golem: {
        name: 'Fire hydrant',
        catchphrases: {
          spawn: ['A hydrant! Stoic! Unmovable! Slightly rusted!', 'You may bark. I have been barked at by generations.', 'I have held this corner since before you were a pup.', 'I am the one thing the mail carrier also fears.'],
          defeat: ['Cracked... at last... a plumber appointment...', 'A hydrant, toppled by a dog with a grudge.', 'Beneath the paint... more paint...', 'All those years of standing. For this.'],
          bossDefeat: ['The boss hydrant. Sixty years of dignified immobility. Over.', 'I have withstood snow plows. A dog. A dog did this.', 'The street is dark without me. Someone will notice. Eventually.', 'My water was for emergencies. This was not one.'],
          wall: ['Stuck? I have not moved since 1962. Get comfortable.', 'You cannot outlast me. I am bolted to the pavement.', 'Bark all you like. I am load-bearing.', 'I am the wall. I have always been the wall.'],
          shiny: ['A squirrel! I have a hose and no way to use it!', 'Shiny. I am red. I am the shiny. This is complicated.', 'Catch it. I will be here. I am always here.', 'Sparkly. Dogs mistake me for a treasure. Understandable.'],
          ambient: ['A dog just peed on me. He knows who he is.', 'I am the only thing in this town that never flinches.', 'Paint weathers. I weather it. Jointly.', 'I dream of rain. Rain is my purpose. Rain never comes.'],
        },
      },
      dragonling: {
        name: 'Delivery van',
        catchphrases: {
          spawn: ['The van! It rumbles! The dog loses its mind!', 'Delivery van incoming. Typical Tuesday. Be cool.', 'I have your seventy-eighth package this month. It is a rug.', 'Beep beep. That is the horn. The horn precedes doom.'],
          defeat: ['Out of... diesel... and enthusiasm...', 'The van... it is... a metaphor...', 'I delivered to the wrong house. Karma found me.', 'The engine sputters. So does my career.'],
          bossDefeat: ['The boss van. Felled by a golden retriever with a grudge.', 'I have driven this route for years. It ends in the flowerbed.', 'The rear doors are open. So is my heart. Both empty.', 'Undefeated on the road. Defeated on the driveway.'],
          wall: ['Stuck? I am double-parked. That is worse. Trust me.', 'You cannot stop me. I literally deliver for a living.', 'Keep going. I will idle. Loudly. Fuel is not cheap.', 'I am the wall. The wall has its hazards on.'],
          shiny: ['A squirrel! I will honk at it! Honking is my power!', 'Shiny. I carry boxes of shiny things. Irrelevant. Grab it.', 'Catch it before I have to open a door. That takes forever.', 'Sparkly. Bet it ships in three to five business days.'],
          ambient: ['I have a backup camera. It beeps. It beeps more under duress.', 'My suspension has seen things. Mostly speed bumps.', 'I am the boss van. The boss of this driveway.', 'Beep. That was idle. I idle musically.'],
        },
      },
    },
  },

  shiny: {
    name: 'A squirrel',
    catchAria: 'Catch the squirrel',
    kind: {
      frenzy: 'CHASE MODE',
      drop: 'Buried tag',
      cache: 'Treat stash',
    },
    escape: "It made the fence. You'll be replaying that miss at 3am for the rest of your life.",
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
      `is ${ratio}the power of the Level ${currentLevel} you're wearing. You are choosing this.`,
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
        description:
          'Deal damage by actually biting — sorry, tapping — the enemy. Feel that jaw.',
      },
      'boss-slayer': {
        title: 'Truck Wrecked',
        description:
          'Take down your first boss. A moving vehicle. On purpose. Nothing wrong with you.',
      },
      'wall-hit': {
        title: 'The Fence',
        description:
          'Hit your first wall. You cannot dig under it. You will be trying again in about four minutes.',
      },
      'choice-made': {
        title: 'Made A Call',
        description:
          'Resolve your first fenced-in decision. You waited instead of doing something stupid. Growth.',
      },
      'stage-10': {
        title: 'End Of The Block',
        description: 'Reach stage 10. The mail is still coming. It is always still coming.',
      },
      'stage-25': {
        title: 'Deep In The Neighbourhood',
        description:
          'Reach stage 25. Nobody is coming to get you. This is just your life now.',
      },
      'stage-50': {
        title: 'Halfway To Nowhere',
        description:
          'Reach stage 50. There is no ending. There was never going to be an ending. Keep biting.',
      },
      'geared-up': {
        title: 'Fit Check',
        description:
          "Equip your first piece of gear. You are now somebody's dog. Congratulations, I guess.",
      },
      'first-upgrade': {
        title: 'Bought In',
        description:
          'Buy your first upgrade. You have officially converted kibble into an advantage. Capitalism, but for dogs.',
      },
      'ring-bearer': {
        title: 'Tagged',
        description:
          "Equip a dog tag. It's not a collar if it's load-bearing. That's the rule.",
      },
      'double-ringed': {
        title: 'Double Tagged',
        description: 'Wear a tag on both sides. Two tags, twice the identity crisis.',
      },
      bedazzled: {
        title: 'Bandana Acquisition',
        description:
          'Get your paws on a bandana, worn or buried in the stash. Heavy, gaudy, load-bearing. Perfect.',
      },
      bling: {
        title: 'Business Casual',
        description:
          'Wear a bandana and at least one tag at the same time. You look ridiculous. You feel incredible.',
      },
      'full-kit': {
        title: 'Fully Dressed',
        description:
          'Fill all four slots — jaw, both tags, bandana. Absolutely shredded. For a dog. Whatever.',
      },
      'big-iron': {
        title: 'Big Jaw On The Block',
        description: (level) =>
          `Wear a jaw of item level ${level} or higher. That's not a bite any more, that's a legal event.`,
      },
      hoarder: {
        title: "It's Not Hoarding If It's Stashed",
        description: (threshold) =>
          `Bury ${threshold} unequipped items. You might need them. You absolutely will not.`,
      },
      'bag-lady': {
        title: 'Stash Goblin',
        description:
          'Fill every single stash slot. There is nothing left to bury and you are still digging.',
      },
      'crit-investor': {
        title: 'Tag Investor',
        description:
          'Reach 25% total critical chance from your tags. The maths is on your side, for once.',
      },
      'crit-half': {
        title: 'Coin Flip',
        description:
          'Reach 50% total critical chance. Every other bite is a war crime. Statistically.',
      },
      'crit-maxed': {
        title: 'Statistically Inevitable',
        description: (percent) =>
          `Reach the ${percent}% critical chance cap. The dice are rigged, and you chewed them.`,
      },
      'loose-change': {
        title: 'Loose Kibble',
        description: (gold) =>
          `Bank ${gold} kibble at once. Big spender energy. Small dog wallet. Same as it ever was.`,
      },
      'touch-grass': {
        title: 'Touch Grass',
        description: 'Play for 10 minutes straight. The grass, criminally, remains unsniffed.',
      },
      'grass-30': {
        title: 'Have You Tried Touching More Grass?',
        description:
          'Play for 30 minutes straight. You have not seen the sun in half an hour and you do not care.',
      },
      'milestone-first': {
        title: 'The Step Is Real',
        description: 'Cross your first upgrade step. Same kibble, but it finally did something.',
      },
      'upgrade-diversified': {
        title: 'Equal Opportunity Chewer',
        description:
          'Put at least one upgrade into every equipped slot. Diversify, they said. Like you have a portfolio.',
      },
      'upgrade-veteran': {
        title: 'Serial Upgrader',
        description: (levels) =>
          `Hold ${levels} total upgrade levels across your gear. Kibble well spent. Allegedly.`,
      },
      'shiny-claimed': {
        title: 'Ooh, Squirrel',
        description:
          'Claim your first squirrel haul. It was burying that for you the entire time. Rude.',
      },
      'shiny-frenzy': {
        title: 'Double-Dipping',
        description:
          'Claim a squirrel while the zoomies are already running. Greed is a strategy and it is working.',
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

  // The same 8 semantic cues as every theme, with deliberately DIFFERENT
  // display timings so the animation seam is genuinely exercised. Slot names are
  // shared (only the per-theme art folder differs); the squirrel's spawn/claim
  // reuse the shared `spawn-popup` slot.
  animation: {
    cues: {
      playerAttack: { slot: 'player-attack', durationMs: 200 },
      enemyHit: { slot: 'enemy-grunt-hurt', durationMs: 160 },
      enemyDeath: { slot: 'enemy-grunt-death', durationMs: 420 },
      bossHit: { slot: 'boss-grunt-hurt', durationMs: 200 },
      bossDeath: { slot: 'boss-grunt-death', durationMs: 520 },
      stageEntered: { slot: 'spawn-popup', durationMs: 360 },
      shinySpawn: { slot: 'spawn-popup', durationMs: 320 },
      shinyClaim: { slot: 'spawn-popup', durationMs: 260 },
    },
  },
};
