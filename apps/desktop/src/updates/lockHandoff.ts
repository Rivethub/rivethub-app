export interface SingleInstanceLock {
  release: () => void;
  acquire: () => boolean;
}

/**
 * The updater starts the new copy inside `install`, before this one quits, so the new copy needs
 * the single-instance lock first. If the install fails or throws, this copy keeps running and takes
 * the lock back, so a second launch still focuses it instead of opening another window.
 */
export function installWithLockHandoff(lock: SingleInstanceLock, install: () => boolean): boolean {
  lock.release();
  let installed = false;
  try {
    installed = install();
  } finally {
    if (!installed) lock.acquire();
  }
  return installed;
}
