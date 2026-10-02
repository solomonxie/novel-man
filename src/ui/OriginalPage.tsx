import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, usePalette } from '../theme';

/**
 * One page of the PDF a book was converted from, as it was printed.
 *
 * The conversion is good and it is still a conversion: a table with no ruled
 * lines comes through as a column of fragments, and some equations are
 * approximations of a two-dimensional layout. This is the way back. Not a
 * reading mode — a glance at the original when the words stop making sense,
 * and then back to the book.
 *
 * Drawn by `WKWebView`, which renders PDFs with Apple's own engine: pinch,
 * zoom and selection all behave the way they do in Files, and none of it is
 * ours to write. The alternative was a PDFKit view behind a native component,
 * which is the better long-term answer and the wrong first one — this needs no
 * native code at all and `react-native-webview` is already here for the
 * formula renderer.
 *
 * Nothing crosses the bridge. The file is opened by path, which is the whole
 * difference between this and the PDF *import* that was taken out of the app:
 * that one pushed 35 MB through `injectJavaScript` as base64.
 */
export function OriginalPage({ file, page, onClose }: {
  /** An absolute path inside the app's own storage. */
  file: string;
  page: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  // `#page=` is how every PDF viewer since Acrobat has been told where to
  // open, and WebKit's is no exception.
  const uri = `file://${encodeURI(file)}#page=${page}`;
  // What the view is allowed to read: the folder the file is in, and no more.
  const directory = `file://${encodeURI(file.replace(/\/[^/]*$/, ''))}`;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: palette.bg, paddingTop: insets.top }}>
        <View style={styles.bar}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: '600' }}>
            {t('reader.originalPage', { page })}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: palette.accent, fontSize: 16 }}>{t('reader.done')}</Text>
          </Pressable>
        </View>
        <WebView
          source={{ uri }}
          allowFileAccess
          allowingReadAccessToURL={directory}
          style={{ flex: 1, backgroundColor: palette.bg }}
          // It is a page of a book, not a web page: nothing here should
          // navigate anywhere.
          onShouldStartLoadWithRequest={(request) => request.url.startsWith('file://')}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  sheet: { borderRadius: radius.md },
});
