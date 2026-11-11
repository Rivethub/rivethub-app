export interface SingleInstanceLock {
  release: () => void;
  /** False when another instance took the lock meanwhile. */
  acquire: () => boolean;
}

/**
 * `installed`: the new copy runs and owns the lock; quit. `lost`: the install failed, but another
 * launch took the lock while it ran and now has the window; quit too. `failed`: the install failed
 * and this copy holds the lock again; keep running.
 */
export type HandoffResult = "installed" | "lost" | "failed";

/**
 * The updater starts the new copy inside `install`, before this one quits, so the new copy needs
 * the single-instance lock first. A failed or throwing install takes it back if it can.
 */
export function installWithLockHandoff(lock: SingleInstanceLock, install: () => boolean): HandoffResult {
  lock.release();
  let installed = false;
  try {
    installed = install();
  } catch {
    installed = false;
  }
  if (installed) return "installed";
  return lock.acquire() ? "failed" : "lost";
}
