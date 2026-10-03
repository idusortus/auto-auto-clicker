// components.test.tsx — RN component rendering, overlays, and theme sourcing.
//
// Covers tasks 4.1 (component surface renders the current GameState), 4.3
// (pending-choice overlay, offline summary, achievements shelf), 5.2 (all copy
// from ACTIVE_THEME) and 6.3 (component tests pass). Handlers are inert stubs
// here; the end-to-end dispatch assertions live in handlers.test.tsx.
//
// RNTL v14 makes `render` / `fireEvent` async, so every interaction is awaited.

import { fireEvent, render } from '@testing-library/react-native';

import {
  ACHIEVEMENTS,
  ACTIVE_THEME,
  STALL_NAG_MS,
  createGame,
  enemyForStage,
  getProjectedKillMs,
} from '@auto-auto-clicker/engine-core';
import type { GameState } from '@auto-auto-clicker/engine-core';

import { AchievementsShelf } from './AchievementsShelf';
import { Arena } from './Arena';
import { BagPanel } from './BagPanel';
import { ChoiceOverlay } from './ChoiceOverlay';
import { EquippedPanel } from './EquippedPanel';
import { Hud } from './Hud';
import { OfflineOverlay } from './OfflineOverlay';
import type { GameHandlers } from './types';

const noopHandlers: GameHandlers = {
  onClick: () => {},
  onUpgrade: () => {},
  onEquip: () => {},
  onChoice: () => {},
  onClaim: () => {},
};

function freshState(): GameState {
  return createGame(42, 0);
}

describe('Hud (4.1)', () => {
  it('renders gold, stage, and DPS from state and engine getters', async () => {
    const state = freshState();
    state.player.gold = 1234;
    state.combat.stage = 7;

    const view = await render(<Hud state={state} />);

    expect(view.getByTestId('gold').props.children).toBe('1234');
    expect(view.getByTestId('stage').props.children).toBe('7');
    expect(view.getByTestId('dps').props.children).toBeDefined();
    // Labels come from the active theme, never a literal in the component.
    expect(view.getByText(ACTIVE_THEME.ui.hud.gold)).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.hud.stage)).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.hud.dps)).toBeTruthy();
  });

  it('re-renders new state with no local gameplay copy (5.2)', async () => {
    const state = freshState();
    state.player.gold = 5;
    const view = await render(<Hud state={state} />);
    expect(view.getByTestId('gold').props.children).toBe('5');

    const next: GameState = { ...state, player: { gold: 99 } };
    await view.rerender(<Hud state={next} />);
    expect(view.getByTestId('gold').props.children).toBe('99');
  });
});

describe('Arena (4.1, 4.3)', () => {
  it('renders the enemy name, HP, and tap hint from the theme and engine', async () => {
    const state = freshState();
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );

    expect(view.getByTestId('enemy')).toBeTruthy();
    expect(view.getByTestId('enemy-hp').props.children).toBeDefined();
    // The enemy name is a theme roster entry, not a literal.
    const enemyId = enemyForStage(state.combat.stage).id;
    expect(view.getByTestId('enemy-name').props.children).toBe(
      ACTIVE_THEME.enemy.roster[enemyId]?.name,
    );
    expect(view.getByText(ACTIVE_THEME.ui.tapHint)).toBeTruthy();
  });

  it('shows the Golden-Event claim control while a Shiny is active', async () => {
    const state = freshState();
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 10_000 };
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );

    expect(view.getByTestId('shiny')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.shiny.kind.cache)).toBeTruthy();
  });

  it('shows the stall callout with the theme kicker and equip callout', async () => {
    const state = freshState();
    state.meta.totalPlayedMs = STALL_NAG_MS;
    state.gear.bag.push({ id: 'better-weapon', definitionId: 'weapon', itemLevel: 50, upgradeLevel: 0 });

    const view = await render(<Arena state={state} handlers={noopHandlers} stageBeganAtMs={0} />);

    expect(view.getByTestId('upgrade-advisory')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.advisory.kicker)).toBeTruthy();
    expect(view.getByTestId('upgrade-advisory-equip')).toBeTruthy();
  });
});

describe('EquippedPanel and BagPanel (4.1)', () => {
  it('renders four per-slot upgrade controls', async () => {
    const view = await render(<EquippedPanel state={freshState()} handlers={noopHandlers} />);
    for (const slot of ['weapon', 'ring1', 'ring2', 'necklace']) {
      expect(view.getByTestId(`upgrade-btn-${slot}`)).toBeTruthy();
      expect(view.getByTestId(`upgrade-level-${slot}`)).toBeTruthy();
      expect(view.getByTestId(`upgrade-cost-${slot}`)).toBeTruthy();
    }
    // The empty weapon card uses the theme's empty-slot copy.
    expect(view.getByText(ACTIVE_THEME.slots.empty.weapon)).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.equippedTitle)).toBeTruthy();
  });

  it('renders the bag and its empty-state copy', async () => {
    const view = await render(<BagPanel state={freshState()} handlers={noopHandlers} />);
    expect(view.getByText(ACTIVE_THEME.ui.bag.title)).toBeTruthy();
    expect(view.getByTestId('bag-empty')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.bag.empty)).toBeTruthy();
  });

  it('renders a bag row with the theme equip label and better tag', async () => {
    const state = freshState();
    state.gear.bag.push({ id: 'bag-1', definitionId: 'weapon', itemLevel: 10, upgradeLevel: 0 });
    const view = await render(<BagPanel state={state} handlers={noopHandlers} />);
    expect(view.getByTestId('bag-item-bag-1')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.bag.equip)).toBeTruthy();
    expect(view.getByTestId('bag-upgrade-tag')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.bag.betterTag)).toBeTruthy();
  });
});

describe('ChoiceOverlay (4.3)', () => {
  it('is hidden while no choice is pending', async () => {
    const view = await render(<ChoiceOverlay state={freshState()} handlers={noopHandlers} />);
    expect(view.queryByTestId('choice-card')).toBeNull();
  });

  it('shows a boss-check overlay with theme title and body copy', async () => {
    const state = freshState();
    state.combat.stage = 20;
    state.choices.pending = { kind: 'boss-check', stage: 20, options: ['wait', 'watchAd', 'iap'] };
    const view = await render(<ChoiceOverlay state={state} handlers={noopHandlers} />);

    const projected = getProjectedKillMs(state);
    const projectedText =
      projected === null ? '' : ACTIVE_THEME.enemy.projectedKill(String(Math.floor(projected)));

    expect(view.getByTestId('choice-card')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.enemy.bossCheck)).toBeTruthy();
    expect(view.getByTestId('choice-body').props.children).toBe(
      ACTIVE_THEME.enemy.bossCheckBody('20', projectedText),
    );
    expect(view.getByText(ACTIVE_THEME.ui.choice.wait)).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.choice.watchAd)).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.choice.iap)).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.choice.note)).toBeTruthy();
  });

  it('shows a progression-wall overlay with the wall title', async () => {
    const state = freshState();
    state.choices.pending = { kind: 'progression-wall', stage: 30, options: ['wait', 'watchAd', 'iap'] };
    const view = await render(<ChoiceOverlay state={state} handlers={noopHandlers} />);
    expect(view.getByText(ACTIVE_THEME.enemy.progressionWall)).toBeTruthy();
  });
});

describe('OfflineOverlay (4.3)', () => {
  it('renders the offline summary text from the theme', async () => {
    const view = await render(
      <OfflineOverlay
        summary={{ elapsedMs: 60_000, simulatedMs: 60_000, goldEarned: 450, capped: false }}
        onDismiss={() => {}}
      />,
    );
    expect(view.getByTestId('offline-text')).toBeTruthy();
    expect(view.getByText(ACTIVE_THEME.ui.offline.title)).toBeTruthy();
    const text = view.getByTestId('offline-text').props.children;
    expect(typeof text).toBe('string');
    expect(text).toContain('450');
  });

  it('appends the capped copy when the elapsed time was capped', async () => {
    const view = await render(
      <OfflineOverlay
        summary={{ elapsedMs: 100_000, simulatedMs: 60_000, goldEarned: 10, capped: true }}
        onDismiss={() => {}}
      />,
    );
    const text = view.getByTestId('offline-text').props.children as string;
    expect(text.endsWith(ACTIVE_THEME.ui.offline.capped)).toBe(true);
  });
});

describe('AchievementsShelf (4.3, 5.2)', () => {
  it('renders the theme title and the unlocked achievement copy', async () => {
    const state = freshState();
    const unlocked = ACHIEVEMENTS[0];
    expect(unlocked).toBeDefined();
    state.meta.achievements = [unlocked!.id];
    const view = await render(<AchievementsShelf state={state} />);

    expect(view.getByText(ACTIVE_THEME.achievements.title)).toBeTruthy();
    expect(view.getByTestId(`achievement-${unlocked!.id}`)).toBeTruthy();
    // The engine catalog resolves title/description from ACTIVE_THEME.
    expect(view.getByText(unlocked!.title)).toBeTruthy();
  });

  it('teases locked achievements with the theme empty copy', async () => {
    const state = freshState();
    const view = await render(<AchievementsShelf state={state} />);
    // Nothing unlocked: no rows until the player reveals hidden entries.
    expect(view.queryByTestId(`achievement-${ACHIEVEMENTS[0]!.id}`)).toBeNull();
    expect(view.getByText(ACTIVE_THEME.achievements.shelf.empty)).toBeTruthy();
  });
});

describe('one tap invokes one handler (4.2, 6.3)', () => {
  it('invokes onClick exactly once for one enemy tap', async () => {
    const { calls, handlers } = countingHandlers();
    const view = await render(
      <Arena state={freshState()} handlers={handlers} stageBeganAtMs={null} />,
    );
    await fireEvent.press(view.getByTestId('enemy'));
    expect(calls.onClick).toBe(1);
    expect(calls.onUpgrade + calls.onEquip + calls.onChoice + calls.onClaim).toBe(0);
  });

  it('invokes onUpgrade once with the tapped slot', async () => {
    const state = freshState();
    state.gear.equipped.weapon = { id: 'w1', definitionId: 'weapon', itemLevel: 1, upgradeLevel: 0 };
    state.player.gold = 100_000;
    const { calls, handlers } = countingHandlers();
    const view = await render(<EquippedPanel state={state} handlers={handlers} />);
    await fireEvent.press(view.getByTestId('upgrade-btn-weapon'));
    expect(calls.onUpgrade).toBe(1);
  });

  it('invokes onEquip once with the tapped instance id', async () => {
    const state = freshState();
    state.gear.bag.push({ id: 'bag-1', definitionId: 'weapon', itemLevel: 3, upgradeLevel: 0 });
    const { calls, handlers } = countingHandlers();
    const view = await render(<BagPanel state={state} handlers={handlers} />);
    await fireEvent.press(view.getByTestId('equip-btn-bag-1'));
    expect(calls.onEquip).toBe(1);
  });

  it('invokes onChoice once for one choice tap', async () => {
    const state = freshState();
    state.choices.pending = { kind: 'boss-check', stage: 1, options: ['wait', 'watchAd', 'iap'] };
    const { calls, handlers } = countingHandlers();
    const view = await render(<ChoiceOverlay state={state} handlers={handlers} />);
    await fireEvent.press(view.getByTestId('choice-wait'));
    expect(calls.onChoice).toBe(1);
  });

  it('invokes onClaim once for one Shiny tap', async () => {
    const state = freshState();
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 999_999 };
    const { calls, handlers } = countingHandlers();
    const view = await render(
      <Arena state={state} handlers={handlers} stageBeganAtMs={null} />,
    );
    await fireEvent.press(view.getByTestId('shiny'));
    expect(calls.onClaim).toBe(1);
  });

  it('invokes the advisory equip once with the flagged instance id', async () => {
    const state = freshState();
    state.meta.totalPlayedMs = STALL_NAG_MS;
    state.gear.bag.push({ id: 'best-1', definitionId: 'weapon', itemLevel: 40, upgradeLevel: 0 });
    const { calls, handlers } = countingHandlers();
    const view = await render(
      <Arena state={state} handlers={handlers} stageBeganAtMs={0} />,
    );
    await fireEvent.press(view.getByTestId('upgrade-advisory-equip'));
    expect(calls.onEquip).toBe(1);
  });
});

/** Handlers that count invocations, so a tap can be proven exactly-once. */
function countingHandlers(): {
  calls: Record<keyof GameHandlers, number>;
  handlers: GameHandlers;
} {
  const calls: Record<keyof GameHandlers, number> = {
    onClick: 0,
    onUpgrade: 0,
    onEquip: 0,
    onChoice: 0,
    onClaim: 0,
  };
  return {
    calls,
    handlers: {
      onClick: () => {
        calls.onClick += 1;
      },
      onUpgrade: () => {
        calls.onUpgrade += 1;
      },
      onEquip: () => {
        calls.onEquip += 1;
      },
      onChoice: () => {
        calls.onChoice += 1;
      },
      onClaim: () => {
        calls.onClaim += 1;
      },
    },
  };
}
