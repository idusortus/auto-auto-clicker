// theme/types.ts — the Theme contract.
//
// A Theme holds ALL user-facing DISPLAY copy. It deliberately holds NO
// IDENTITY: achievement ids, gear `definitionId`s, `GearSlot` values, enemy
// ids, `ShinyKind` values, and save-schema versions live in code and are
// asserted by the sim / persisted in saves. A theme must never be able to
// change them.
//
// LEAF MODULE: this file imports nothing, so the theme package stays acyclic
// and engine-core can keep it out of every import cycle. Every string slot is
// explicit — no engine internals are referenced.
//
// Interpolated copy stays a FUNCTION taking the same parameters the old inline
// template took, so a swapped theme cannot change the rendered bytes.

/** Human copy for one achievement, keyed by the achievement's stable id. */
export interface AchievementCopy {
  title: string;
  /**
   * Literal description, or a function of the single number the description
   * interpolates. Passing the number in keeps balance constants OUT of the
   * theme (e.g. "Equip a weapon of item level ${level} or higher.").
   */
  description: string | ((value: number) => string);
}

/**
 * The full display surface, grouped by area. Strings are VERBATIM projections:
 * the fantasy theme reproduces the original wording byte-for-byte.
 */
export interface Theme {
  /** Short identifier for the theme (for a future picker / diagnostics). */
  name: string;

  /** Chrome: HUD, panel titles, buttons, hints, overlays, formatting. */
  ui: {
    hud: {
      gold: string;
      stage: string;
      dps: string;
    };
    /** Stand-in shown for an absent numeric readout ("—"). */
    placeholder: string;
    tapHint: string;
    equippedTitle: string;
    upgradeButton: string;
    upgradeHint: string;
    upgradeRow: {
      level(level: string): string;
      cost(cost: string): string;
    };
    boost: {
      /** Skeleton fallback label while no boost is rendered ("FRENZY"). */
      label: string;
      /** Active-pill label ("FRENZY ×3"). */
      pill(multiplier: string): string;
      /** Remaining-time readout ("6s"). */
      timer(seconds: string): string;
    };
    splashKicker: string;
    choice: {
      title: string;
      wait: string;
      watchAd: string;
      watchAdTitle: string;
      iap: string;
      iapTitle: string;
      note: string;
    };
    offline: {
      title: string;
      dismiss: string;
      earned(gold: string, duration: string): string;
      capped: string;
    };
    duration: {
      lessThanMinute: string;
      seconds(seconds: string): string;
      minutes(minutes: string): string;
      hours(hours: string): string;
      hoursMinutes(hours: string, minutes: string): string;
    };
    bag: {
      title: string;
      /** Suffix after the bag count (" items"). */
      countSuffix: string;
      empty: string;
      betterTag: string;
      equip: string;
      /** Item-level prefix on a bag row ("Level 14"). */
      level(level: string): string;
      weaponSummary(level: string, dps: string, click: string): string;
      ringSummary(level: string, crit: string, critDamage: string): string;
      necklaceSummary(level: string, gold: string, power: string): string;
    };
  };

  /** Slot names, equipped-card labels, stat lines, and milestone badges. */
  slots: {
    /** Title-case names used on the upgrade rows and milestone copy. */
    display: {
      weapon: string;
      ring1: string;
      ring2: string;
      necklace: string;
    };
    /** Lower-case nouns used mid-sentence in advisory copy. */
    noun: {
      weapon: string;
      ring: string;
      necklace: string;
    };
    /** A filled equipped card label ("Weapon · level 12"). */
    card: {
      weapon(level: string): string;
      ring1(level: string): string;
      ring2(level: string): string;
      necklace(level: string): string;
    };
    /** An empty equipped card label ("No weapon equipped"). */
    empty: {
      weapon: string;
      ring1: string;
      ring2: string;
      necklace: string;
    };
    /** Equipped-card stat lines (values are engine-formatted strings). */
    stats: {
      weapon(dps: string, click: string, upgrades: string): string;
      ring(crit: string, critDamage: string, totalCrit: string, totalCritDamage: string): string;
      necklace(gold: string, power: string, totalGold: string, totalPower: string): string;
      empty: string;
    };
    /** Milestone badge / flourish (the bonus wording is engine-owned). */
    milestone: {
      badge(count: string, bonus: string): string;
      flourish(slot: string, count: string, bonus: string): string;
      /** Wording for one milestone bonus, from an engine-formatted percentage. */
      bonus: {
        separator: string;
        crit(percent: string): string;
        critDamage(percent: string): string;
        gold(percent: string): string;
        power(percent: string): string;
      };
    };
  };

  /** Enemy arena and the pending-choice overlay. */
  enemy: {
    label: string;
    boss: string;
    attackAria: string;
    hp(current: string, max: string): string;
    bossCheck: string;
    progressionWall: string;
    /** Appended "projected time to kill" sentence (leading space included). */
    projectedKill(ms: string): string;
    bossCheckBody(stage: string, projected: string): string;
    progressionWallBody(stage: string, projected: string): string;
  };

  /** The wandering Stray Goblin ("Shiny") and its transient messages. */
  shiny: {
    name: string;
    catchAria: string;
    kind: {
      frenzy: string;
      drop: string;
      cache: string;
    };
    escape: string;
    claimed: string;
    frenzyClaim(multiplier: string): string;
    dropClaim: string;
  };

  /** The escalating soft-lock guidance callout. */
  advisory: {
    kicker: string;
    equipFallback: string;
    equipCallout(level: string, noun: string): string;
    badge(noun: string): string;
    emptySlot(stage: string, duration: string, noun: string, bestLevel: string): string;
    betterSlot(
      stage: string,
      duration: string,
      noun: string,
      bestLevel: string,
      ratio: string,
      currentLevel: string,
    ): string;
  };

  /** The achievements shelf. Copy is keyed by the stable achievement id. */
  achievements: {
    title: string;
    catalog: Record<string, AchievementCopy>;
    shelf: {
      /** Skeleton default count label (" unlocked"). */
      countDefault: string;
      /** Resolved count label (" of 30 unlocked"). */
      count(total: string): string;
      /** Skeleton default toggle label ("Show hidden"). */
      showDefault: string;
      /** Toggle label with the locked count ("Show hidden 25"). */
      show(count: string): string;
      hide: string;
      teaser: string;
      locked: string;
      empty: string;
    };
  };
}
