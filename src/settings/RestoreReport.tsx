import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { RestoreReport } from '../backup/restore';
import { space, usePalette } from '../theme';

/**
 * What a restore did, all four parts of it.
 *
 * A copy that carries no manuscripts restores no books by definition — iCloud
 * never carries them — so "Restored 0 books" is the ordinary outcome there, and
 * on its own it reads as a failure. What is waiting for its file leads instead,
 * and the count of books is kept for the restore where nothing happened at all.
 */
export function RestoreReportView({ report }: { report: RestoreReport }) {
  const { t } = useTranslation();
  const palette = usePalette();
  const restored = report.restored.length;
  const showRestored = restored > 0 || report.waiting === 0;

  return (
    <View style={{ marginTop: space.xl }}>
      {showRestored ? (
        <Text style={{ color: palette.text, fontSize: 15 }}>
          {t('backup.restored', { count: restored })}
        </Text>
      ) : null}
      {report.waiting > 0 ? (
        <Text style={line(palette, showRestored)}>
          {t('backup.restoredWaiting', { count: report.waiting })}
        </Text>
      ) : null}
      {report.duplicates.length > 0 ? (
        <Text style={line(palette, true)}>
          {t('backup.duplicates', { list: report.duplicates.join(', ') })}
        </Text>
      ) : null}
      {report.unplaceable.map((item, index) => (
        <Text key={index} style={{ color: palette.danger, fontSize: 13, marginTop: space.xs }}>
          {t(`backup.unplaceable_${item.reason}`, { title: item.title })}
        </Text>
      ))}
    </View>
  );
}

function line(palette: ReturnType<typeof usePalette>, under: boolean) {
  return under
    ? { color: palette.dim, fontSize: 13, marginTop: space.xs }
    : { color: palette.text, fontSize: 15 };
}
