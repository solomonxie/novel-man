import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from './primitives';

/** Far enough that it was meant, and short enough that a flick counts. */
const DISMISS_AT = 110;

/**
 * The cover, as big as the screen allows. A thumbnail is an identifier; the
 * artwork is a thing people actually want to look at, and on a shelf of
 * paperbacks the cover is the only part of the book that was designed to be
 * looked at from across a room.
 *
 * Two ways out, because both are reflexes: tap it, or pull it down. The pull
 * follows the finger rather than waiting for it to finish, which is what makes
 * a photo feel held rather than displayed.
 */
export function CoverViewer({ visible, title, hue, path, onClose, actions }: {
  visible: boolean;
  title: string;
  hue: number;
  path?: string | null;
  onClose: () => void;
  /** What can be done with the picture while it is open — kept off the image. */
  actions?: { key: string; label: string; onPress: () => void }[];
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.ValueXY()).current;
  const appear = useRef(new Animated.Value(0)).current;

  const pan = useRef(
    PanResponder.create({
      // A tap is not a drag: the responder is only taken once a finger has
      // actually travelled, so the tap-to-dismiss below still gets its turn.
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 6,
      onPanResponderMove: (_event, gesture) => {
        drag.setValue({ x: 0, y: Math.max(0, gesture.dy) });
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > DISMISS_AT || gesture.vy > 1.2) {
          Animated.timing(drag, {
            toValue: { x: 0, y: height },
            duration: 160,
            easing: Easing.in(Easing.quad),
            useNativeDriver: false,
          }).start(onClose);
          return;
        }
        Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (!visible) return;
    drag.setValue({ x: 0, y: 0 });
    appear.setValue(0);
    Animated.timing(appear, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [appear, drag, visible]);

  if (!visible) return null;

  // The picture fades as it is pulled away, so the gesture says what it will
  // do before it has done it.
  const fade = drag.y.interpolate({
    inputRange: [0, DISMISS_AT * 2],
    outputRange: [1, 0.2],
    extrapolate: 'clamp',
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.back, { opacity: Animated.multiply(appear, fade) }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View
          {...pan.panHandlers}
          style={[
            styles.center,
            { opacity: appear, transform: [{ translateY: drag.y }] },
          ]}
        >
          <Cover
            title={title}
            hue={hue}
            path={path}
            width={Math.min(width - 48, Math.round((height - 160) / 1.45))}
          />
        </Animated.View>
      </Pressable>
      {/* Outside the Pressable that dismisses, or every button would also be
          a way out of the picture it acts on. */}
      {actions?.length ? (
        <View style={[styles.actions, { bottom: Math.max(insets.bottom, 24) }]}>
          {actions.map((action) => (
            <Pressable key={action.key} onPress={action.onPress} hitSlop={10}>
              <Text style={styles.action}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
  },
  action: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
