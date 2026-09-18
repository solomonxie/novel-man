import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { radius, space, type ReadingPalette } from '../theme';

/** Fixed so the list can jump straight to the chapter being read. */
const ROW = 48;
/** Far enough that it can't be a stray finger, close enough for one flick. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 0.6;

/**
 * Where you are in the book, over the page rather than instead of it. Half the
 * screen: the reader stays visible behind it, which is what makes it a glance
 * and not a detour — and it is dragged down to close, the gesture the hand is
 * already making when it reaches for a sheet's top edge.
 */
export function ChapterSheet({ visible, chapters, current, palette, onPick, onClose }: {
  visible: boolean;
  chapters: { id: string; idx: number; title: string }[];
  current: number;
  palette: ReadingPalette;
  onPick: (idx: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * 0.55);
  const drag = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // The grab handle only: the list under it still scrolls.
        onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 2,
        onPanResponderMove: (_, gesture) => drag.setValue(Math.max(0, gesture.dy)),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
            Animated.timing(drag, {
              toValue: sheetHeight,
              duration: 140,
              useNativeDriver: true,
            }).start(onClose);
            return;
          }
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 2 }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [drag, onClose, sheetHeight]
  );

  // Hidden is not mounted: a Modal left in the tree keeps a sheet-sized
  // view on the page, which is the white band under everything.
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: palette.bg, height: sheetHeight, transform: [{ translateY: drag }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* The whole head is the handle, not the 36pt bar drawn on it. */}
          <View {...pan.panHandlers} style={styles.head}>
            <View style={[styles.grabber, { backgroundColor: palette.dim }]} />
            <Text style={{ color: palette.dim, fontSize: 13, marginTop: space.sm }}>
              {t('reader.chapterList')}
            </Text>
          </View>

          <FlatList
            data={chapters}
            keyExtractor={(entry) => entry.id}
            initialNumToRender={20}
            windowSize={9}
            // Land on where you are, not on chapter one.
            initialScrollIndex={Math.max(0, current - 4)}
            getItemLayout={(_, at) => ({ length: ROW, offset: ROW * at, index: at })}
            contentContainerStyle={{ paddingBottom: space.xxl }}
            renderItem={({ item: entry }) => (
              <Pressable
                onPress={() => onPick(entry.idx)}
                style={{ paddingHorizontal: space.xl, justifyContent: 'center', height: ROW }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: entry.idx === current ? palette.accent : palette.text,
                    fontSize: 15,
                  }}
                >
                  {entry.idx + 1}  {entry.title.trim() || '—'}
                </Text>
              </Pressable>
            )}
          />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  /** A tall head is a big target for the drag that closes this. */
  head: { alignItems: 'center', paddingTop: space.sm, paddingBottom: space.md },
  grabber: { width: 44, height: 5, borderRadius: 3, opacity: 0.6 },
});
