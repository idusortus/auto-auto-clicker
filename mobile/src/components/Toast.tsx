// Toast.tsx — a transient, non-blocking message surface.
//
// The RN analogue of `/web`'s `.shiny-toast` / `.shiny-flourish` /
// `.milestone-flourish` / `.enemy-taunt`. It renders the caller's TEXT (always
// visible — a toast is information) and, while motion is allowed, a pop
// entrance. Under reduced motion it renders the still, fully-visible style with
// no movement.
//
// It holds no state and no copy of its own: the caller owns what is shown and for
// how long.

import { Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { useEntrance } from '../animation/motion';
import { layout } from './layout';

/** The narrow palette-token shapes the toast reads (theme tokens only). */
interface ToastTone {
  backgroundColor?: string;
  borderColor?: string;
}
interface ToastInk {
  color?: string;
}

export interface ToastProps {
  /** A stable testID for the toast surface. */
  testID: string;
  /** The message text (theme-resolved by the caller). */
  text: string;
  /** The palette token pair (background + border colour). */
  tone: ToastTone;
  /** The matching text-colour token. */
  textStyle: ToastInk;
  /** Whether reduced motion is currently on (suppresses the pop only). */
  reducedMotion: boolean;
  /** Extra emphasis for a flourish (bold, bright) rather than a dim advisory. */
  emphasis?: boolean;
}

export function Toast({
  testID,
  text,
  tone,
  textStyle,
  reducedMotion,
  emphasis = false,
}: ToastProps): React.JSX.Element {
  const entrance = useEntrance(reducedMotion);
  return (
    <Animated.View testID={testID} style={[layout.toast, tone, entrance]}>
      <Text
        testID={`${testID}-text`}
        style={[layout.toastText, emphasis ? layout.toastFlourishText : null, textStyle]}
      >
        {text}
      </Text>
    </Animated.View>
  );
}
