// safeArea.test.tsx — Phase E (tasks 5.1–5.2): safe-area inset wiring.
//
// The app's composition root wraps `GameScreen` in `SafeAreaProvider`; this test
// drives the provider's `initialMetrics` so the insets are deterministic (no real
// device metrics). It asserts that:
//   - non-zero top/bottom insets push the screen frame's padding past the base
//     design padding (the HUD clears the status bar, bottom content clears the
//     gesture area), and
//   - zero insets add NO extra padding (the frame degrades to the base padding).
//
// The `screenFramePadding` / `bottomInsetPadding` helpers are the SAME pure
// functions `GameScreen` composes into its styles, so the assertion below covers
// both the rendered frame and the toast-stack offset without depending on a
// device.

import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Metrics } from 'react-native-safe-area-context';

import { GameScreen } from './GameScreen';
import { SCREEN_PADDING_VERTICAL, bottomInsetPadding, screenFramePadding } from './layout';
import { ManualScheduler, MemorySaveRepository } from '../../tests/helpers';

/** A safe-area metrics fixture. Only the vertical insets vary across tests. */
function metrics(top: number, bottom: number): Metrics {
  return {
    frame: { x: 0, y: 0, width: 400, height: 800 },
    insets: { top, bottom, left: 0, right: 0 },
  };
}

/** Render `GameScreen` inside the real provider with fixed initial metrics. */
async function renderWithInsets(
  initialMetrics: Metrics,
): Promise<Awaited<ReturnType<typeof render>>> {
  const view = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <GameScreen
        hostOptions={{
          repository: new MemorySaveRepository(null),
          now: () => 0,
          seed: () => 7,
          scheduler: new ManualScheduler(),
        }}
      />
    </SafeAreaProvider>,
  );
  await waitFor(() => expect(view.getByTestId('game-screen')).toBeTruthy());
  return view;
}

describe('5.1 safe-area insets flow to the screen frame', () => {
  it('adds the top and bottom insets on top of the base padding', async () => {
    const view = await renderWithInsets(metrics(24, 34));

    const frame = view.getByTestId('game-screen');
    const style = flattenStyle(frame.props.style);
    expect(style.paddingTop).toBe(SCREEN_PADDING_VERTICAL + 24);
    expect(style.paddingBottom).toBe(SCREEN_PADDING_VERTICAL + 34);
    // Horizontal padding is untouched by the insets.
    expect(style.paddingLeft ?? style.paddingHorizontal).toBe(12);
  });

  it('applies no extra padding when the insets are zero', async () => {
    const view = await renderWithInsets(metrics(0, 0));

    const frame = view.getByTestId('game-screen');
    const style = flattenStyle(frame.props.style);
    expect(style.paddingTop).toBe(SCREEN_PADDING_VERTICAL);
    expect(style.paddingBottom).toBe(SCREEN_PADDING_VERTICAL);
  });
});

describe('5.2 bottom-anchored surfaces offset by the bottom inset', () => {
  it('offsets a bottom-anchored surface by exactly the bottom inset', () => {
    expect(bottomInsetPadding({ top: 24, bottom: 34 })).toBe(34);
  });

  it('adds no extra offset when the bottom inset is zero', () => {
    expect(bottomInsetPadding({ top: 24, bottom: 0 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure composition (the same functions the component uses).
// ---------------------------------------------------------------------------

describe('inset composition helpers', () => {
  it('screenFramePadding composes the base padding with the insets', () => {
    expect(screenFramePadding({ top: 24, bottom: 34 })).toEqual({
      paddingTop: SCREEN_PADDING_VERTICAL + 24,
      paddingBottom: SCREEN_PADDING_VERTICAL + 34,
    });
  });

  it('screenFramePadding degrades to the base padding at zero insets', () => {
    expect(screenFramePadding({ top: 0, bottom: 0 })).toEqual({
      paddingTop: SCREEN_PADDING_VERTICAL,
      paddingBottom: SCREEN_PADDING_VERTICAL,
    });
  });
});

/**
 * Flatten an RN style prop (array / object / registered id) into a plain object.
 * RNTL's style flattening is not exposed directly, so this walks the same shapes
 * `StyleSheet.flatten` accepts; the frame style is always an array of plain
 * objects here.
 */
function flattenStyle(style: unknown): Record<string, number | string | undefined> {
  if (style === null || style === undefined) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, number | string | undefined>>(
      (acc, entry) => ({ ...acc, ...flattenStyle(entry) }),
      {},
    );
  }
  if (typeof style === 'object') return style as Record<string, number | string | undefined>;
  return {};
}
