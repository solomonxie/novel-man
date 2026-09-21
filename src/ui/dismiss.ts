import { useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder } from 'react-native';

/** Far enough that it was meant; a flick counts whatever distance it covered. */
const DISMISS_AT = 90;
const FLICK = 0.6;
/** Past this the finger is going somewhere, not resting. */
const SLOP = 4;

/**
 * Pull a sheet down to put it away — the gesture the hand is already making
 * when it reaches for a sheet's top edge, and the one every other sheet on the
 * phone answers to.
 *
 * Two sets of handlers, because a sheet is a handle above a list and they want
 * opposite things. `handlers` go on the head and always drag. `list` goes on
 * the wrapper around a scrolling list and only drags where there is nothing
 * left to scroll up — otherwise a flick through the chapters closes the sheet.
 * Feed the list's `onScroll` to `onScroll` so it knows.
 *
 * Three things had to be true before this worked, and each of them was a whole
 * evening on its own:
 *
 * - The scrim is a *sibling* of the sheet, never its parent. A Pressable that
 *   wraps the sheet claims every touch inside it to keep taps from falling
 *   through, and a claimed touch is one this never sees.
 * - The gesture is refused to anyone who asks for it back. A list is a native
 *   scroll view and asks the instant the drag is granted, so the drag was
 *   being granted and then taken away before it could be released.
 * - Nothing here is driven natively. A value the gesture writes with
 *   `setValue` cannot also be animated with `useNativeDriver`: the first
 *   native animation moves the node across, and every JS write to it after
 *   that is dropped — which is a sheet that dismisses once and never comes
 *   back, because the value that put it off-screen can no longer be reset.
 */
export function useDragDismiss(onDismiss: () => void, fall = 600) {
  const translateY = useRef(new Animated.Value(0)).current;
  const atTop = useRef(true);

  const pan = useMemo(() => {
    const dragging = (allowed: () => boolean) =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx) && allowed(),
        // The whole fix, and the only line that was ever missing. A list is a
        // native scroll view, and the moment the drag is granted it asks for
        // the touch back — so the gesture was being granted and then taken
        // away before it could ever be released. It is ours until the finger
        // leaves the glass.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderMove: (_event, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > DISMISS_AT || gesture.vy > FLICK) {
            // Out of the way first, so the sheet is gone rather than snapping
            // back and then vanishing.
            Animated.timing(translateY, {
              toValue: fall,
              duration: 140,
              easing: Easing.in(Easing.quad),
              useNativeDriver: false,
            // Left where it landed, off the bottom. Putting it back before
            // telling the caller drew the sheet in its old place for a frame,
            // which is the flash — it is reset on the way back in instead.
            }).start(onDismiss);
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 2 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(translateY, { toValue: 0, useNativeDriver: false }).start(),
      });
    return { head: dragging(() => true), list: dragging(() => atTop.current) };
  }, [fall, onDismiss, translateY]);

  return {
    translateY,
    handlers: pan.head.panHandlers,
    list: pan.list.panHandlers,
    onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      atTop.current = event.nativeEvent.contentOffset.y <= 0;
    },
    /** Back to the top before it is shown again. */
    reset: () => {
      translateY.setValue(0);
      atTop.current = true;
    },
  };
}
