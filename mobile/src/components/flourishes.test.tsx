// flourishes.test.tsx — Phase D (tasks 4.1–4.7): the Reanimated movement
// flourishes and the informational surfaces.
//
// Reanimated is mocked in `jest.setup.js` to resolve animated styles to their
// final value synchronously, so a component test can assert the TARGET style.
// Reduced motion is driven through `AccessibilityInfo` (mocked in the same way
// the existing Arena.cues test does). All copy assertions read ACTIVE_THEME.

import { StyleSheet, Text } from 'react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ACTIVE_THEME, ACHIEVEMENTS, createGame, getEnemyMaxHp } from '@auto-auto-clicker/engine-core';
import type { AchievementDefinition, GameEvent, GameState } from '@auto-auto-clicker/engine-core';

import { Arena } from './Arena';
import { ChoiceOverlay } from './ChoiceOverlay';
import { OfflineOverlay } from './OfflineOverlay';
import { Splash } from './Splash';
import { Toast } from './Toast';
import { useAchievementSplash, useEnemyTaunt, useMilestoneFlourish } from './surfaces';
import { styles } from '../theme';
import type { GameHandlers } from './types';

const noopHandlers: GameHandlers = {
  onClick: () => {},
  onUpgrade: () => {},
  onEquip: () => {},
  onChoice: () => {},
  onClaim: () => {},
};

/**
 * A STABLE timer seam for the hook tests. It must be module-level: the hooks list
 * the scheduler in an effect dependency, so a fresh object per render would
 * re-arm the effect on every render and loop.
 */
const dismissRef: { current: (() => void) | null } = { current: null };
const testScheduler = {
  setTimeout: (handler: () => void): unknown => {
    dismissRef.current = handler;
    return 1;
  },
  clearTimeout: (): void => {
    dismissRef.current = null;
  },
};

/** Read the flattened style object off a rendered node. */
function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  return StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
}

/** Enable/disable reduced motion for the next render via AccessibilityInfo. */
function setReducedMotion(enabled: boolean): void {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(enabled);
}

beforeEach(() => {
  setReducedMotion(false);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function freshState(): GameState {
  const state = createGame(11, 0);
  state.combat.stage = 3;
  state.combat.enemyHp = Math.floor(getEnemyMaxHp(state) * 0.4);
  return state;
}

describe('4.1 HP-bar fill tween', () => {
  it('renders the fill at the target HP percentage', async () => {
    const state = freshState();
    const maxHp = getEnemyMaxHp(state);
    const expected = `${(state.combat.enemyHp / maxHp) * 100}%`;
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    await waitFor(() => expect(flatStyle(view.getByTestId('hp-fill')).width).toBe(expected));
  });

  it('snaps to the target width under reduced motion', async () => {
    setReducedMotion(true);
    const state = freshState();
    const maxHp = getEnemyMaxHp(state);
    const expected = `${(state.combat.enemyHp / maxHp) * 100}%`;
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    await waitFor(() => expect(flatStyle(view.getByTestId('hp-fill')).width).toBe(expected));
  });
});

describe('4.2 Boost-pill pulse', () => {
  it('shows the pill while a boost is active', async () => {
    const state = freshState();
    state.boost = { dpsMultiplier: 3, expiresAtMs: state.meta.totalPlayedMs + 60_000 };
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    await waitFor(() => expect(view.getByTestId('boost-pill')).toBeTruthy());
  });

  it('renders no pill while no boost is active', async () => {
    const view = await render(
      <Arena state={freshState()} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    expect(view.queryByTestId('boost-pill')).toBeNull();
  });

  it('renders a static (still) pill under reduced motion', async () => {
    setReducedMotion(true);
    const state = freshState();
    state.boost = { dpsMultiplier: 3, expiresAtMs: state.meta.totalPlayedMs + 60_000 };
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    // The scale transform resolves to the rest value (1) with no loop.
    await waitFor(() => {
      const transform = flatStyle(view.getByTestId('boost-pill')).transform as Array<{
        scale?: number;
      }>;
      expect(transform?.[0]?.scale).toBe(1);
    });
  });
});

describe('4.3 Shiny drift, escape, and claim message', () => {
  it('shows the escape message when a Shiny disappears unclaimed', async () => {
    const state = freshState();
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 10_000 };
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    expect(view.getByTestId('shiny')).toBeTruthy();

    const gone: GameState = { ...state, event: { ...state.event, active: null } };
    await view.rerender(<Arena state={gone} handlers={noopHandlers} stageBeganAtMs={null} />);

    await waitFor(() => expect(view.getByTestId('shiny-message')).toBeTruthy());
    expect(view.getByTestId('shiny-message-text').props.children).toBe(ACTIVE_THEME.shiny.escape);
  });

  it('shows the claim flourish after a tap claims the Shiny', async () => {
    const state = freshState();
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 10_000 };
    const claimedState: GameState = { ...state, event: { ...state.event, active: null } };
    let claimed = false;
    const view = await render(
      <Arena
        state={state}
        handlers={{ ...noopHandlers, onClaim: () => { claimed = true; } }}
        stageBeganAtMs={null}
      />,
    );

    await fireEvent.press(view.getByTestId('shiny'));
    expect(claimed).toBe(true);
    await view.rerender(
      <Arena state={claimedState} handlers={noopHandlers} stageBeganAtMs={null} />,
    );

    await waitFor(() => expect(view.getByTestId('shiny-message')).toBeTruthy());
    expect(view.getByTestId('shiny-message-text').props.children).toBe(ACTIVE_THEME.shiny.claimed);
  });

  it('shows the escape text with no pop under reduced motion', async () => {
    setReducedMotion(true);
    const state = freshState();
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 10_000 };
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    const gone: GameState = { ...state, event: { ...state.event, active: null } };
    await view.rerender(<Arena state={gone} handlers={noopHandlers} stageBeganAtMs={null} />);
    await waitFor(() =>
      expect(view.getByTestId('shiny-message-text').props.children).toBe(ACTIVE_THEME.shiny.escape),
    );
  });
});

describe('4.4 Spawn popup', () => {
  it('shows the declared stageEntered slot while the cue is live', async () => {
    const state = freshState();
    const event: GameEvent = {
      type: 'stageEntered',
      stage: state.combat.stage,
      isBoss: false,
      maxHp: getEnemyMaxHp(state),
      enemyId: 'grunt',
    };
    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} events={[event]} />,
    );
    const slot = ACTIVE_THEME.animation.cues.stageEntered.slot;
    await waitFor(() => expect(view.getByTestId('spawn-popup')).toBeTruthy());
    expect(view.getByTestId(`asset-${slot}`)).toBeTruthy();
  });

  it('hides the popup with no global cue', async () => {
    const view = await render(
      <Arena state={freshState()} handlers={noopHandlers} stageBeganAtMs={null} />,
    );
    expect(view.queryByTestId('spawn-popup')).toBeNull();
  });
});

describe('4.7 Overlay entrance', () => {
  it('renders the choice card (motion on) and the offline card under reduced motion', async () => {
    const state = freshState();
    state.choices.pending = { kind: 'boss-check', stage: 3, options: ['wait', 'watchAd', 'iap'] };
    const choice = await render(<ChoiceOverlay state={state} handlers={noopHandlers} />);
    expect(choice.getByTestId('choice-card')).toBeTruthy();

    setReducedMotion(true);
    const offline = await render(
      <OfflineOverlay
        summary={{ elapsedMs: 60_000, simulatedMs: 60_000, goldEarned: 5, capped: false }}
        onDismiss={() => {}}
      />,
    );
    expect(offline.getByTestId('offline-card')).toBeTruthy();
    expect(offline.getByTestId('offline-text')).toBeTruthy();
  });
});

describe('4.6 Splash rendering', () => {
  it('renders the achievement title/description and kicker from the theme', async () => {
    const definition = ACHIEVEMENTS[0] as AchievementDefinition;
    const view = await render(<Splash definition={definition} reducedMotion={false} />);
    expect(view.getByTestId('splash-title').props.children).toBe(definition.title);
    expect(view.getByTestId('splash-desc').props.children).toBe(definition.description);
    expect(view.getByText(ACTIVE_THEME.ui.splashKicker)).toBeTruthy();
  });

  it('still renders its text under reduced motion (information, no pop)', async () => {
    const definition = ACHIEVEMENTS[0] as AchievementDefinition;
    const view = await render(<Splash definition={definition} reducedMotion />);
    expect(view.getByTestId('splash-title').props.children).toBe(definition.title);
    expect(view.getByTestId('splash-desc').props.children).toBe(definition.description);
  });
});

describe('4.5 Toast rendering', () => {
  it('shows the given text with the theme-provided wording', async () => {
    const view = await render(
      <Toast
        testID="t"
        text={ACTIVE_THEME.shiny.escape}
        tone={styles.panel}
        textStyle={styles.textDim}
        reducedMotion={false}
      />,
    );
    expect(view.getByTestId('t-text').props.children).toBe(ACTIVE_THEME.shiny.escape);
  });

  it('still shows its text under reduced motion (a toast is information)', async () => {
    const view = await render(
      <Toast
        testID="t"
        text={ACTIVE_THEME.shiny.escape}
        tone={styles.panel}
        textStyle={styles.textDim}
        reducedMotion
      />,
    );
    expect(view.getByTestId('t-text').props.children).toBe(ACTIVE_THEME.shiny.escape);
  });
});

// ---------------------------------------------------------------------------
// Hook-level tests for the pure surface diffs (4.5 / 4.6).
// ---------------------------------------------------------------------------

describe('surface hooks (4.5, 4.6)', () => {
  it('useEnemyTaunt resolves the theme catchphrase and clears on dismiss', async () => {
    const enemyId = Object.keys(ACTIVE_THEME.enemy.roster)[0]!;
    const phrases = ACTIVE_THEME.enemy.roster[enemyId]!.catchphrases.spawn;
    // A STABLE batch: the hook lists `events` in its effect dependency.
    const batch: readonly GameEvent[] = [
      { type: 'enemyTaunt', enemyId, kind: 'spawn', phraseIndex: 0 },
    ];

    dismissRef.current = null;

    function Harness(): ReactElement {
      const taunt = useEnemyTaunt(batch, testScheduler);
      return <Probe text={taunt.text} />;
    }

    const view = await render(<Harness />);
    await waitFor(() => expect(view.getByTestId('probe').props.children).toBe(phrases[0]));
    await act(async () => {
      dismissRef.current?.();
    });
    await waitFor(() => expect(view.getByTestId('probe').props.children).toBeNull());
  });

  it('useAchievementSplash seeds on first render and queues later unlocks', async () => {
    const definitions = ACHIEVEMENTS.slice(0, 2) as AchievementDefinition[];

    function Harness({ state }: { state: GameState }): ReactElement {
      const splash = useAchievementSplash(state);
      return <Probe text={splash.definition?.title ?? null} />;
    }

    const seeded = createGame(3, 0);
    // A restored save already has an unlock: it must NOT splash at boot.
    seeded.meta.achievements = [definitions[0]!.id];
    const view = await render(<Harness state={seeded} />);
    expect(view.getByTestId('probe').props.children).toBeNull();

    const withUnlock: GameState = {
      ...seeded,
      meta: { ...seeded.meta, achievements: [definitions[0]!.id, definitions[1]!.id] },
    };
    await view.rerender(<Harness state={withUnlock} />);
    await waitFor(() => expect(view.getByTestId('probe').props.children).toBe(definitions[1]!.title));
  });

  it('useAchievementSplash queues a burst and advances on dismiss', async () => {
    const definitions = ACHIEVEMENTS.slice(0, 2) as AchievementDefinition[];
    const timerRef: { current: (() => void) | null } = { current: null };
    const scheduler = {
      setTimeout: (handler: () => void): unknown => {
        timerRef.current = handler;
        return 1;
      },
      clearTimeout: (): void => {
        timerRef.current = null;
      },
    };

    function Harness({ state }: { state: GameState }): ReactElement {
      const splash = useAchievementSplash(state, scheduler);
      return <Probe text={splash.definition?.title ?? null} />;
    }

    const seeded = createGame(4, 0);
    const view = await render(<Harness state={seeded} />);
    // First render seeds; nothing shows.
    expect(view.getByTestId('probe').props.children).toBeNull();

    const burst: GameState = {
      ...seeded,
      meta: { ...seeded.meta, achievements: [definitions[0]!.id, definitions[1]!.id] },
    };
    await view.rerender(<Harness state={burst} />);
    // The first queued definition shows immediately.
    await waitFor(() => expect(view.getByTestId('probe').props.children).toBe(definitions[0]!.title));

    await act(async () => {
      timerRef.current?.();
    });
    await waitFor(() => expect(view.getByTestId('probe').props.children).toBe(definitions[1]!.title));
  });

  it('useMilestoneFlourish seeds on first render and fires on a step change', async () => {
    function Harness({ state }: { state: GameState }): ReactElement {
      const milestone = useMilestoneFlourish(state);
      return <Probe text={milestone.text} />;
    }

    const state = createGame(5, 0);
    state.gear.equipped.weapon = { id: 'w', definitionId: 'weapon', itemLevel: 1, upgradeLevel: 0 };
    const view = await render(<Harness state={state} />);
    // Seeded: no flourish at boot even though a slot is equipped.
    expect(view.getByTestId('probe').props.children).toBeNull();

    const upgraded: GameState = {
      ...state,
      gear: {
        ...state.gear,
        equipped: {
          ...state.gear.equipped,
          weapon: { id: 'w', definitionId: 'weapon', itemLevel: 1, upgradeLevel: 25 },
        },
      },
    };
    await view.rerender(<Harness state={upgraded} />);
    await waitFor(() => expect(typeof view.getByTestId('probe').props.children).toBe('string'));
  });
});

/** A minimal text probe so the hooks can be asserted without a full surface. */
function Probe({ text }: { text: string | null }): ReactElement {
  return <Text testID="probe">{text}</Text>;
}
