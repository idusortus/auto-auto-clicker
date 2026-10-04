// Arena.cues.test.tsx — task 3.4: the Arena projects the declared cue frame for
// a live cue and returns to the idle frame on expiry.
//
// The Arena reads the OS reduced-motion preference internally (via
// useAnimationCues), so the test mocks `AccessibilityInfo` to keep motion on.
// Expiry is deterministic: the component uses real timers, so the test advances
// the injected `Date.now` and fires the drain through a mocked `setTimeout`.

import { render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { ACTIVE_THEME, createGame } from '@auto-auto-clicker/engine-core';
import type { GameEvent, GameState } from '@auto-auto-clicker/engine-core';

import { Arena } from './Arena';
import type { GameHandlers } from './types';

const noopHandlers: GameHandlers = {
  onClick: () => {},
  onUpgrade: () => {},
  onEquip: () => {},
  onChoice: () => {},
  onClaim: () => {},
};

/** A captured drain handler plus its scheduled delay. */
interface CapturedTimeout {
  handler: (() => void) | null;
  delay: number | null;
}

let captured: CapturedTimeout;
let nowMs: number;

beforeEach(() => {
  captured = { handler: null, delay: null };
  nowMs = 1000;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(() => ({ remove: jest.fn() }) as never);
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  jest.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void, delay?: number) => {
    captured.handler = handler;
    captured.delay = delay ?? 0;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  jest.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Arena cue frames (3.4)', () => {
  it('shows the declared hit frame for a live cue then returns to idle', async () => {
    const state: GameState = createGame(7, 0);
    const hit: GameEvent = { type: 'damageDealt', amount: 5, source: 'auto' };

    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} events={[hit]} />,
    );

    // The enemy shows the declared enemyHit frame while the cue is live.
    const cueSlot = ACTIVE_THEME.animation.cues.enemyHit.slot;
    await waitFor(() => expect(view.getByTestId(`asset-${cueSlot}`)).toBeTruthy());
    expect(captured.handler).not.toBeNull();
    expect(captured.delay).toBe(ACTIVE_THEME.animation.cues.enemyHit.durationMs);

    // Advance past the cue and run the drain; the sprite returns to idle.
    nowMs += ACTIVE_THEME.animation.cues.enemyHit.durationMs;
    await waitFor(() => {
      captured.handler?.();
    });

    await waitFor(() => expect(view.queryByTestId(`asset-${cueSlot}`)).toBeNull());
    expect(view.getByTestId('asset-enemy-grunt-idle')).toBeTruthy();
  });

  it("projects the theme's shinyClaim frame for a claim event, then returns to idle", async () => {
    const state: GameState = createGame(7, 0);
    // A live Shiny is a precondition for a claim; the claim cue frame paints on
    // its sprite while the cue is live (the kind's idle slot differs, so the
    // claim slot is a distinguishable assertion).
    state.event.active = { kind: 'cache', spawnedAtMs: 0, expiresAtMs: 10_000 };
    const claim: GameEvent = { type: 'eventClaimed', kind: 'cache' };

    const view = await render(
      <Arena state={state} handlers={noopHandlers} stageBeganAtMs={null} events={[claim]} />,
    );

    const cueSlot = ACTIVE_THEME.animation.cues.shinyClaim.slot;
    await waitFor(() => expect(view.getByTestId(`asset-${cueSlot}`)).toBeTruthy());

    // Advance past the cue and run the drain; the Shiny sprite leaves the frame.
    nowMs += ACTIVE_THEME.animation.cues.shinyClaim.durationMs;
    await waitFor(() => {
      captured.handler?.();
    });

    await waitFor(() => expect(view.queryByTestId(`asset-${cueSlot}`)).toBeNull());
  });
});
