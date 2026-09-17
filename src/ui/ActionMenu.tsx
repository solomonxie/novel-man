import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { radius, space, usePalette } from '../theme';

export type MenuAction = {
  label: string;
  onPress: () => void;
  enabled?: boolean;
  danger?: boolean;
};

/**
 * What can be done to one thing, listed where that thing is. Everything an
 * item supports lives here — including its AI action, which is an action on
 * this chapter or this character rather than a mode the whole page is in.
 */
export function ActionMenu({ visible, title, actions, busy, onClose }: {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  busy?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          {title ? (
            <Text style={{ color: palette.dim, fontSize: 13, paddingVertical: space.md }}>{title}</Text>
          ) : null}
          {actions.map((action) => {
            const enabled = action.enabled !== false && !busy;
            return (
              <Pressable
                key={action.label}
                disabled={!enabled}
                onPress={action.onPress}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.5 }]}
              >
                <Text
                  style={{
                    color: !enabled ? palette.faint : action.danger ? palette.danger : palette.text,
                    fontSize: 16,
                  }}
                >
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onClose} style={styles.action}>
            <Text style={{ color: palette.dim, fontSize: 16 }}>{t('settings.cancel')}</Text>
          </Pressable>
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
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
  },
  // 44pt rows: a menu is the one place a mis-tap is most expensive.
  action: { minHeight: 44, justifyContent: 'center' },
});
