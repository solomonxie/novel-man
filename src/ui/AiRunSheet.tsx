import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { router } from '../navigation/router';

import { formatUsd, type Estimate } from '../ai/cost';
import { Canceled } from '../ai/run';
import { radius, space, usePalette } from '../theme';

/** Long enough that queueing a run never shows a modal at all. */
const SLOW_MS = 400;

export type RunHooks = {
  signal: AbortSignal;
  onProgress: (done: number, total: number) => void;
};

/**
 * The one shape every paid run wears — and it gets out of the way. Tapping an
 * AI action starts it: there is no Run to confirm and no Done to dismiss,
 * because two taps to say yes twice is not consent, it is friction. What is
 * left appears only when it has something to say: a run slow enough to be
 * worth a progress bar and a Stop, a missing key, or an error. Everything
 * else is reported by the queue strip at the bottom of whatever screen you
 * are on.
 */
export function AiRunSheet({ visible, title, description, estimate, hasKey, onRun, onClose }: {
  visible: boolean;
  title: string;
  description: string;
  estimate: Estimate | null;
  hasKey: boolean;
  onRun: (hooks: RunHooks) => Promise<string>;
  onClose: (changed: boolean) => void;
}) {
  const { t } = useTranslation();
  const palette = usePalette();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  /** A run that finishes in a frame should not flash a modal on the way past. */
  const [slow, setSlow] = useState(false);
  const started = useRef(false);
  const closer = useRef(onClose);
  closer.current = onClose;

  useEffect(() => {
    if (!visible) {
      started.current = false;
      setProgress(null);
      setSummary(null);
      setError(null);
      setSlow(false);
      return;
    }
    if (!hasKey || started.current) return;
    started.current = true;
    void start();
    // Started by opening, once. `start` closes over this render's props, which
    // are the ones the tap meant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, hasKey]);

  async function start() {
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setProgress({ done: 0, total: 1 });
    try {
      const line = await onRun({
        signal: abort.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setSummary(line);
      // Queued is finished, as far as this sheet is concerned: the strip at the
      // bottom of the screen owns everything that happens after.
      closer.current(true);
    } catch (caught) {
      setError(caught instanceof Canceled ? t('ai.canceled') : String(caught));
    } finally {
      controller.current = null;
      setProgress(null);
    }
  }

  const running = progress !== null;

  useEffect(() => {
    if (!running) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [running]);

  // Nothing to confirm and nothing to celebrate: the sheet is for a wait, a
  // missing key and a failure, and for nothing else.
  const showing = visible && (!hasKey || error !== null || slow);

  return (
    <Modal visible={showing} transparent animationType="fade" onRequestClose={() => onClose(!!summary)}>
      <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={() => !running && onClose(!!summary)}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: palette.dim, fontSize: 14, marginTop: space.sm, lineHeight: 20 }}>
            {description}
          </Text>

          {!hasKey ? (
            // Naming the problem is half an answer; the other half is the way
            // to fix it, on the same line that raises it.
            <Pressable onPress={() => { onClose(false); router.push('/?addKey=1'); }}>
              <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.lg }}>
                {t('ai.noKey')}
              </Text>
              <Text style={{ color: palette.accent, fontSize: 15, marginTop: space.sm }}>
                {t('ai.addKey')}  ›
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: palette.text, fontSize: 14, marginTop: space.lg }}>
              {estimate
                ? t('ai.estimate', {
                    price: formatUsd(estimate.usd),
                    tokens: estimate.inputTokens.toLocaleString(),
                    vendor: estimate.vendor,
                  })
                : t('ai.noEstimate')}
            </Text>
          )}
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: space.xs }}>
            {t('ai.estimateHint')}
          </Text>

          {summary ? (
            <Text style={{ color: palette.text, fontSize: 15, marginTop: space.lg }}>{summary}</Text>
          ) : null}
          {error ? (
            <Text style={{ color: palette.danger, fontSize: 14, marginTop: space.lg }}>{error}</Text>
          ) : null}

          {running ? (
            <>
              <View style={[styles.track, { backgroundColor: palette.border }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: palette.accent,
                      width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={{ color: palette.dim, fontSize: 12, marginTop: space.xs }}>
                {t('ai.progress', { done: progress.done, total: progress.total })}
              </Text>
              <Pressable onPress={() => controller.current?.abort()} style={styles.cancel}>
                <Text style={{ color: palette.danger, fontSize: 16 }}>{t('ai.stop')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => onClose(!!summary)} style={styles.cancel}>
              <Text style={{ color: palette.dim, fontSize: 16 }}>{t('ai.close')}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: space.xl },
  sheet: { borderRadius: radius.lg, padding: space.xl, borderWidth: StyleSheet.hairlineWidth },
  track: { height: 4, borderRadius: 2, marginTop: space.xl, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  cancel: { alignItems: 'center', paddingVertical: space.md, marginTop: space.xs },
});
