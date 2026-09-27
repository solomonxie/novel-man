import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Search } from './primitives';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, usePalette } from '../theme';

export type PickerOption = { id: string; label: string; detail?: string };

/** Choosing one value out of a list is a sheet over the page, never a push. */
export function PickerSheet({ visible, title, options, selectedId, onPick, onClose, onDismiss, searchPlaceholder }: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** iOS only: after the sheet has finished animating away. */
  onDismiss?: () => void;
  /**
   * Set where the list is the reader's own and can be any length — which term
   * out of two hundred. A fixed list of five choices is faster to read than to
   * type at, and gets no field.
   */
  searchPlaceholder?: string;
}) {
  const palette = usePalette();
  const [query, setQuery] = useState('');
  // A short sheet otherwise ends at the home indicator, which puts its last
  // option on the one strip of glass a thumb has to reach around.
  const insets = useSafeAreaInsets();
  // A sheet grows with its list, and a list of 21 categories grows past the
  // screen. Past half the page it scrolls inside the sheet instead — and it
  // virtualises, because one of these choices is "which book out of this
  // backup", and a backup holds as many books as somebody owns.
  const { height } = useWindowDimensions();
  // Hidden is not mounted: a Modal left in the tree keeps a sheet-sized
  // view on the page, which is the white band under everything.
  if (!visible) return null;

  // Both ways out clear the field: a sheet reopened still holding last time's
  // query is a sheet that looks like it has lost most of the list.
  const pick = (id: string) => {
    setQuery('');
    onPick(id);
  };
  const close = () => {
    setQuery('');
    onClose();
  };

  const typed = query.trim().toLowerCase();
  const shown = typed
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(typed) ||
          (option.detail ?? '').toLowerCase().includes(typed)
      )
    : options;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
      onDismiss={onDismiss}
    >
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={close}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, space.md) + space.lg,
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {searchPlaceholder && options.length > SEARCHABLE_FROM ? (
            <Search value={query} onChange={setQuery} placeholder={searchPlaceholder} />
          ) : null}
          <FlatList
            style={{ maxHeight: height * 0.55 }}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            data={shown}
            keyExtractor={(option) => option.id}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => pick(item.id)}
                style={[
                  styles.row,
                  index < shown.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderColor: palette.border,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 16 }}>{item.label}</Text>
                  {item.detail ? (
                    <Text style={{ color: palette.dim, fontSize: 12 }}>{item.detail}</Text>
                  ) : null}
                </View>
                {item.id === selectedId && (
                  <Text style={{ color: palette.accent, fontSize: 16 }}>✓</Text>
                )}
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Below this a field is more work than reading the list. */
const SEARCHABLE_FROM = 8;

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // In dark, a surface on a black page needs an edge to read as raised.
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: space.sm,
  },
  title: { fontSize: 15, fontWeight: '600', marginTop: space.lg, marginBottom: space.sm },
  // A row you choose from is a target, not a line of text.
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: space.md },
});
