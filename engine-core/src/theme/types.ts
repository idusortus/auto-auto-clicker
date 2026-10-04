// theme/types.ts — the Theme contract.
//
// A Theme holds ALL user-facing DISPLAY copy. It deliberately holds NO
// IDENTITY: achievement ids, gear `definitionId`s, `GearSlot` values, enemy
// ids, `ShinyKind` values, and save-schema versions live in code and are
// asserted by the sim / persisted in saves. A theme must never be able to
// change them.
//
// LEAF MODULE: the ONLY import here is a TYPE-ONLY `TauntKind` from the
// dependency-free `../types` module, so the theme package stays acyclic and
// engine-core can keep it out of every import cycle (`../types` imports
// nothing, so there is no back-edge). Every string slot is explicit — no engine
// internals are referenced.
//
// Interpolated copy stays a FUNCTION taking the same parameters the old inline
// template took, so a swapped theme cannot change the rendered bytes.

import type { TauntKind } from '../types';

/**
 * The themeable colour tokens the UI renders through. Each value is a CSS colour
 * string (`#rgb` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()` / `hsl()` /
 * `hsla()`). The host applies these as CSS custom properties on the root at boot
 * (see `/web`), so the stylesheet's own `:root` block is only a documented
 * fallback for when no host has run yet.
 *
 * The key set is derived from what the stylesheet GENUINELY consumes (the colour
 * custom properties referenced via `var(--…)`); unused tokens are deliberately
 * not part of the theme.
 */
export interface ThemePalette {
  /** Deepest housing surface — the page background. */
  bg: string;
  /** Recessed housing surface above `bg`. */
  surface: string;
  /** Panel plate. */
  panel: string;
  /** Raised surface (cards, bag rows, unlocked achievements). */
  surfaceRaised: string;
  /** Control (button) base fill. */
  control: string;
  /** Hairline separator. */
  line: string;
  /** Stronger edge for interactive surfaces. */
  lineStrong: string;
  /** Primary body text. */
  text: string;
  /** De-emphasised text. */
  textDim: string;
  /** Muted label text. */
  textMuted: string;
  /** Disabled text. */
  textDisabled: string;
  /** The single accent (ember). */
  accent: string;
  /** Accent, brighter (highlight). */
  accentHi: string;
  /** Accent, darker (gradient base). */
  accentLo: string;
  /** Accent edge/outline. */
  accentEdge: string;
  /** Ink used on top of the accent. */
  accentInk: string;
  /** Muted danger/badge text. */
  dangerMuted: string;
  /** Health-bar gradient top. */
  hpHi: string;
  /** Health-bar gradient bottom. */
  hpLo: string;
}

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
 * Semantic animation cues. These are EVENT FAMILIES, never identity values:
 * a theme maps each cue to one of the declared asset slots plus a display-only
 * duration. Durations affect rendering ONLY and are never read by engine-core
 * or the sim.
 */
export type AnimationCueKey =
  | 'playerAttack' // the player clicked
  | 'enemyHit' // damage dealt to a normal enemy
  | 'enemyDeath' // a normal enemy died
  | 'bossHit' // damage dealt to a boss
  | 'bossDeath' // a boss died
  | 'stageEntered' // a new enemy spawned
  | 'shinySpawn' // a Shiny appeared
  | 'shinyClaim'; // a Shiny was claimed

/** One cue: an asset slot name from ASSET_SLOTS, and a display-only duration. */
export interface ThemeAnimationCue {
  /** A declared asset slot name (one of ASSET_SLOTS). */
  slot: string;
  /** Display-only ms the frame stays visible. 0 disables the cue. */
  durationMs: number;
}

export interface ThemeAnimation {
  cues: Record<AnimationCueKey, ThemeAnimationCue>;
}

/**
 * Display entry for one engine enemy id. This is COPY ONLY — a theme must never
 * control enemy identity (that is the stable engine id) or stats. `name` is the
 * arena label; `catchphrases` are keyed by the semantic taunt kind the engine
 * emits so a line always fits the moment.
 */
export interface EnemyDisplayEntry {
  /** The arena label for this enemy (replaces the old single `enemy.label`). */
  name: string;
  /** Catchphrases per taunt kind; at least 4 for each kind (test-enforced). */
  catchphrases: Record<TauntKind, string[]>;
}

/**
 * The full display surface, grouped by area. Strings are VERBATIM projections:
 * the fantasy theme reproduces the original wording byte-for-byte.
 */
export interface Theme {
  /** Short identifier for the theme (for a future picker / diagnostics). */
  name: string;

  /**
   * The colour scheme the UI renders through. Applied to the root as CSS custom
   * properties at boot, so swapping it retints the whole UI without editing the
   * stylesheet. The values must be valid CSS colour strings (checked at runtime
   * by `validateTheme`, which derives the required key set from the stylesheet).
   */
  palette: ThemePalette;

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
    /**
     * Display copy for each stable engine enemy id (see `ENEMY_ROSTER`). EVERY
     * roster id must be present; the renderer fails loudly on a missing one.
     * `label`/`boss` stay as the pre-render skeleton fallback and the boss badge.
     */
    roster: Record<string, EnemyDisplayEntry>;
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

  /**
   * Declared art this theme supplies, keyed by ASSET SLOT NAME (the canonical
   * names + pixel dimensions + naming convention live in `theme/contract.ts`
   * `ASSET_SLOTS`, the single source of truth T4 consumes). Each value is an
   * ORDERED list of frame file names following the contract convention — one
   * entry is a static image, several entries are a animation sequence played in
   * order (idle loops, action cues play once). Single-frame slots (e.g. gear
   * icons) declare a one-element list. File names use a `-<n>` frame suffix,
   * e.g. `enemy-grunt-idle-0.png`, `enemy-grunt-idle-1.png`.
   *
   * This section is DISPLAY-only: it names the theme's own files. It carries no
   * identity (slot names are owned by the contract in code) and no gameplay
   * semantics. `validateTheme` checks the section is well-formed (all slots
   * present, every entry a non-empty list of convention-respecting file names)
   * but does NOT require the files to exist; the on-disk frame check is the CLI.
   */
  assets: Record<string, readonly string[]>;

  /**
   * Declared animation cues, keyed by semantic EVENT FAMILY (never an identity
   * value). Each cue names one of the declared `ASSET_SLOTS` and a display-only
   * duration in milliseconds: the duration affects rendering ONLY and is never
   * read by engine-core or the sim, and a duration of 0 disables the cue. A cue
   * may only reference a declared asset slot; this section carries no gameplay
   * semantics.
   */
  animation: ThemeAnimation;
}
