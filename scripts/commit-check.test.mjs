import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCommit, parseGitIdent } from './commit-check.mjs'
import { sha256 } from './scan-files.mjs'

const house = new Set([sha256('example maintainer <maintainer@example.com>')])
const identity = parseGitIdent('Example Maintainer <Maintainer@example.com> 1700000000 +0000\n')
const good = { author: identity, committer: identity, message: 'ci: Add checks' }

test('requires both full, normalized house identities', () => {
  assert.deepEqual(checkCommit(good, house), [])
  const unknown = 'someone else <maintainer@example.com>'
  assert.match(checkCommit({ ...good, author: unknown }, house)[0], /^author /)
  assert.match(checkCommit({ ...good, committer: unknown }, house)[0], /^committer /)
  assert.throws(() => parseGitIdent('invalid'), /invalid Git identity/)
})

test('GitHub web committer is allowed on a recorded commit with a house author', () => {
  const web = 'github <noreply@github.com>'
  assert.deepEqual(checkCommit({ ...good, committer: web, recorded: true }, house), [])
  assert.equal(checkCommit({ ...good, author: web, committer: web, recorded: true }, house).length, 2)
  assert.equal(checkCommit({ ...good, committer: web }, house).length, 1)
})

test('blocks all three attribution trailers and the runtime text conjunction', () => {
  for (const trailer of ['Co-AUTHORED-By', 'Claude-Session', 'Signed-off-by']) {
    const message = `${good.message}\n\n${trailer}: Example Maintainer`
    assert.match(checkCommit({ ...good, message }, house)[0], /blocked attribution trailer/)
  }
  for (const text of ['Generated with a tool', 'Session_123\nAnthropic', 'Co-authored with Cursor']) {
    const message = `${good.message}\n\n${text}`
    assert.match(checkCommit({ ...good, message }, house)[0], /AI attribution/)
  }
  assert.deepEqual(checkCommit({ ...good, message: 'docs: describe the OpenAI integration' }, house), [])
})

test('enforces the runtime types and Conventional Commits structure', () => {
  for (const type of ['fix', 'feat', 'chore', 'docs', 'style', 'refactor', 'perf', 'test', 'ci', 'build']) {
    const message = `${type}(web library)!: Change the default\n\nBREAKING CHANGE: new default`
    assert.deepEqual(checkCommit({ ...good, message }, house), [])
  }
  assert.deepEqual(checkCommit({ ...good, message: 'FIX:accept a description' }, house), [])
  for (const message of ['fixup! fix: improve', 'wip fix: improve', 'revert: restore', 'fix(): no scope',
    'feat: ', 'fix: Improve.', 'fix: fix behavior\nbody', 'fix: fix behavior\n\nCloses:']) {
    assert.match(checkCommit({ ...good, message }, house)[0], /Conventional Commits/)
  }
})
