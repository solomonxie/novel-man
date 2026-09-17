import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, usePalette } from '../theme';

export type PickerOption = { id: string; label: string; detail?: string };

/** Choosing one value out of a list is a sheet over the page, never a push. */
export function PickerSheet({ visible, title, options, selectedId, onPick, onClose, onDismiss }: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string;
  onPick: (id: string) => void;
  onClose: () => void;
  /** iOS only: after the sheet has finished animating away. */
  onDismiss?: () => void;
}) {
  const palette = usePalette();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: palette.faint }]} />
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {options.map((option, index) => (
            <Pressable
              key={option.id}
              onPress={() => onPick(option.id)}
              style={[
                styles.row,
                index < options.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontSize: 16 }}>{option.label}</Text>
                {option.detail ? (
                  <Text style={{ color: palette.dim, fontSize: 12 }}>{option.detail}</Text>
                ) : null}
              </View>
              {option.id === selectedId && (
                <Text style={{ color: palette.accent, fontSize: 16 }}>✓</Text>
              )}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // In dark, a surface on a black page needs an edge to read as raised.
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: space.xxl,
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
});
