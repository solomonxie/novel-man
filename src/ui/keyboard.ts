import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform } from 'react-native';

/**
 * The same fact as a number rather than a moving value, for a sheet that is
 * too tall to lift.
 *
 * Sliding a short sheet up by the height of the keyboard is right; doing it to
 * one that already fills four fifths of the screen pushes its head off the
 * top. A tall sheet stays where it is and keeps its content clear of the
 * keyboard by padding instead, which needs a plain number — layout cannot be
 * driven natively alongside a transform on the same value.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const early = Platform.OS === 'ios';
    const show = Keyboard.addListener(early ? 'keyboardWillShow' : 'keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height)
    );
    const hide = Keyboard.addListener(early ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setHeight(0)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * How far something anchored to the bottom of the screen has to lift, as a
 * value that moves *with* the keyboard rather than after it.
 *
 * iOS announces the keyboard before it moves — `keyboardWillShow` carries the
 * height it will end at and the duration it will take — so following that
 * announcement makes one movement out of what is otherwise two: the sheet
 * rises as the keyboard rises, instead of jumping once the keyboard has
 * already arrived. `KeyboardAvoidingView` reads the same events but re-lays
 * out the tree to do it; a transform is the same motion without the layout
 * pass, and it runs on the UI thread.
 *
 * Android has no "will": the keyboard is already there by the time anything
 * is said about it, so the lift follows rather than accompanies.
 */
export function useKeyboardLift(): Animated.Value {
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const early = Platform.OS === 'ios';
    const ease = Easing.out(Easing.ease);
    const show = Keyboard.addListener(early ? 'keyboardWillShow' : 'keyboardDidShow', (event) => {
      Animated.timing(lift, {
        toValue: event.endCoordinates.height,
        duration: event.duration || 220,
        easing: ease,
        useNativeDriver: false,
      }).start();
    });
    const hide = Keyboard.addListener(early ? 'keyboardWillHide' : 'keyboardDidHide', (event) => {
      Animated.timing(lift, {
        toValue: 0,
        duration: event?.duration || 200,
        easing: ease,
        useNativeDriver: false,
      }).start();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift]);

  return lift;
}
