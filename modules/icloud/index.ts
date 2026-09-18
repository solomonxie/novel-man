import { requireOptionalNativeModule } from 'expo';

/**
 * Five states, not two. A row that could never work here (no native module,
 * wrong platform) is hidden; one that could work later stays visible, or the
 * feature is invisible to exactly the people who need telling about it.
 */
export type DriveStatus = 'unsupported' | 'notEntitled' | 'driveOff' | 'notReady' | 'available';

export type DriveFile = { name: string; modifiedAt: number };

type NativeDrive = {
  status(): Promise<Exclude<DriveStatus, 'unsupported'>>;
  copyIn(fromPath: string, name: string): Promise<number>;
  copyOut(name: string, toPath: string): Promise<void>;
  latest(): Promise<DriveFile | null>;
  /** Every bundle in the container. Retention is decided here, not natively. */
  list(): Promise<DriveFile[]>;
  remove(name: string): Promise<void>;
};

/** Null on Android, and in any build this module was not compiled into. */
export const drive = requireOptionalNativeModule<NativeDrive>('IcloudDrive');
