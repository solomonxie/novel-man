import { NativeModules } from 'react-native';

import { File } from './fs';

const native = NativeModules.TextFile as { read(path: string): Promise<string> } | undefined;

/** A text file in its own encoding — UTF-8, UTF-16, GB18030 or Big5 — as a string. */
export async function readText(uri: string): Promise<string> {
  const file = new File(uri);
  return native ? native.read(file.path) : file.text();
}
