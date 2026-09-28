import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Whether a sheet should be in the tree at all.
 *
 * On iOS, `Modal` records that it has been shown once — `isRendered`, cleared
 * only on unmount — and `_shouldShowModal` then returns true forever after. So
 * a sheet left mounted keeps a native view over the page for the rest of the
 * session, and the bar at the foot of the shelf stopped taking taps: not from
 * the start, only once something had been opened. That is what made it look
 * intermittent.
 *
 * Unmounting is what clears it. Unmounting the instant `visible` goes false
 * would also cancel the slide-out, so this waits for the dismissal to finish
 * and takes the sheet out after — pass `onDismiss` straight to the `Modal`.
 *
 * Android has none of this: there, `visible === false` already renders
 * nothing, and `onDismiss` never fires, so it follows `visible` directly.
 */
export function useSheetMount(visible: boolean): {
  mounted: boolean;
  onDismiss: () => void;
} {
  const [lingering, setLingering] = useState(false);

  useEffect(() => {
    if (visible) setLingering(true);
  }, [visible]);

  if (Platform.OS !== 'ios') return { mounted: visible, onDismiss: () => undefined };
  return { mounted: visible || lingering, onDismiss: () => setLingering(false) };
}
