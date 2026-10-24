import { NativeModules } from 'react-native';

import type { File } from './fs';

const native = NativeModules.Zip as
  | { file(source: string, target: string, entry: string): Promise<void> }
  | undefined;

/** One file into a one-entry zip, deflated natively. Throws where it cannot. */
export async function zipInto(source: File, target: File, entry: string): Promise<void> {
  if (!native) throw new Error('zip is not available');
  await native.file(source.path, target.path, entry);
}
