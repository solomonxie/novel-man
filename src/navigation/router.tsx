import { useLayoutEffect } from 'react';
import {
  createNavigationContainerRef,
  StackActions,
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { matchPath } from './screens';

export { useFocusEffect };

export const navigationRef = createNavigationContainerRef<Record<string, object>>();

type Target = string | { pathname: string; params?: Record<string, unknown> };

/** Both spellings the app uses: a path, or a path with its params beside it. */
function resolve(target: Target): { path: string; params: Record<string, string> } | null {
  if (typeof target === 'string') return matchPath(target);
  const found = matchPath(target.pathname);
  if (!found) return null;
  for (const [key, value] of Object.entries(target.params ?? {})) {
    if (value !== undefined && value !== null) found.params[key] = String(value);
  }
  return found;
}

/**
 * `router.push('/book/abc?tab=notes')`, unchanged from when a file tree
 * answered it. A path is matched to a screen and its `[…]` pieces and query
 * become that screen's params.
 */
export const router = {
  push(target: Target) {
    const found = resolve(target);
    if (found && navigationRef.isReady()) navigationRef.navigate(found.path, found.params);
  },
  replace(target: Target) {
    const found = resolve(target);
    if (!found || !navigationRef.isReady()) return;
    navigationRef.dispatch(StackActions.replace(found.path, found.params));
  },
  back() {
    if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
  },
};

export function useLocalSearchParams<T extends Record<string, string | undefined>>(): T {
  return (useRoute().params ?? {}) as T;
}

/**
 * `<Stack.Screen options={{ title }} />` written inside a screen, which is how
 * every page here titles itself. React Navigation says the same thing through
 * `setOptions`, so this is that call wearing the old name.
 */
function ScreenOptions({ options }: { options?: NativeStackNavigationOptions }) {
  const navigation = useNavigation();
  const title = options?.title;
  const headerBackTitle = options?.headerBackTitle;
  useLayoutEffect(() => {
    if (options) navigation.setOptions(options);
    // Every screen passes plain strings, so these are the whole of it.
  }, [navigation, title, headerBackTitle]);
  return null;
}

export const Stack = { Screen: ScreenOptions };
