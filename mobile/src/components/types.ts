// types.ts — the prop contract shared by the RN components.
//
// Components are PRESENTATIONAL: they receive the current `GameState` and the
// host's handler surface as props, and they hold no gameplay state, no rules,
// and no balance numbers. Every displayed value comes from an engine getter or
// a state field, and every handler is forwarded straight to `useGameHost`, which
// applies it through the engine's `applyAction`.

import type { GameState, GearSlot } from '@auto-auto-clicker/engine-core';
import type { OfflineSummary } from '../offline';
import type { ChoiceOption } from '../useGameHost';

export interface GameHandlers {
  /** The player tapped the enemy. */
  onClick(): void;
  /** The player asked to upgrade the equipped item in `slot`. */
  onUpgrade(slot: GearSlot): void;
  /** The player asked to equip a bag item. */
  onEquip(instanceId: string): void;
  /** The player picked a resolution for a pending choice. */
  onChoice(choice: ChoiceOption): void;
  /** The player tapped the wandering Stray Goblin (a Golden Event). */
  onClaim(): void;
}

/** Every orientable gear slot, in display order. */
export const EQUIP_SLOTS: readonly GearSlot[] = ['weapon', 'ring1', 'ring2', 'necklace'];

/** Props every state-reading component shares. */
export interface GameViewProps {
  state: GameState;
  handlers: GameHandlers;
}

/** Props for the offline summary overlay. */
export interface OfflineViewProps {
  summary: OfflineSummary;
  onDismiss(): void;
}
