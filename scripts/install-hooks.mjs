#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

try {
  if (!existsSync(new URL('../.git', import.meta.url))) throw new Error('missing Git metadata')
  execFileSync('git', ['config', '--local', 'core.hooksPath', 'scripts/git-hooks'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'ignore',
  })
  console.log('Git safety hooks installed')
} catch {
  console.warn('WARNING: Git safety hooks were not installed. Run git config core.hooksPath scripts/git-hooks from the repository root.')
}
