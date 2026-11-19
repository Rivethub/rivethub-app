#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadDenyHashes, sha256 } from './scan-files.mjs'

const TYPES = new Set(['fix', 'feat', 'chore', 'docs', 'style', 'refactor', 'perf', 'test', 'ci', 'build'])
const BLOCKED_TRAILERS = /(?:^|\n)(?:co-authored-by|claude-session|signed-off-by):/i
const BLOCKED_TEXT = /claude|anthropic|cursor|copilot|chatgpt|openai|generated with/i
const AI_TEXT = /generated with|session_|co-authored/i
const GITHUB_WEB_COMMITTER = 'github <noreply@github.com>'
const SUMMARY = /^([A-Za-z]+)(?:\([^()\r\n]+\))?!?:\p{White_Space}*([^\r\n]+)(?=\r?\n|$)/u
const FOOTER = /^(?:BREAKING CHANGE|[^():!\p{White_Space}]+)(?::| #)/u

function conventional(message) {
  const summary = SUMMARY.exec(message)
  if (!summary || !TYPES.has(summary[1].toLowerCase()) || !summary[2].trim() || /[ .!?]$/.test(summary[2])) return false
  const remainder = message.slice(summary[0].length)
  if (/^\r?\n[^\r\n]/.test(remainder)) return false

  // A footer starts after a blank line and must have a value.
  const lines = remainder.split(/\r?\n/)
  let inFooters = false
  for (const [index, line] of lines.entries()) {
    const footer = FOOTER.exec(line)
    if (!footer || (!inFooters && lines[index - 1]?.trim())) continue
    inFooters = true
    if (!line.slice(footer[0].length).trim() && !lines.slice(index + 1).some((rest) => rest.trim())) return false
  }
  return true
}

export function parseGitIdent(ident) {
  const match = /^(.*) <([^<>]*)> -?\d+ [+-]\d{4}$/.exec(ident.trimEnd())
  if (!match) throw new Error('invalid Git identity')
  const [, name, email] = match
  return `${name.trim().toLowerCase()} <${email.trim().toLowerCase()}>`
}

export function checkCommit({ author, committer, message, conventionalMessage = message, recorded = false }, house) {
  const findings = []
  const houseAuthor = house.has(sha256(author))
  if (!houseAuthor) findings.push('author is not a house identity')
  // GitHub web commits carry GitHub's committer identity behind a house author.
  const webCommit = recorded && houseAuthor && committer === GITHUB_WEB_COMMITTER
  if (!webCommit && !house.has(sha256(committer))) findings.push('committer is not a house identity')
  if (BLOCKED_TRAILERS.test(message)) findings.push('commit message carries a blocked attribution trailer')
  if (BLOCKED_TEXT.test(message) && AI_TEXT.test(message)) findings.push('commit message carries AI attribution text')
  if (!conventional(conventionalMessage)) findings.push('commit message does not follow Conventional Commits')
  return findings
}

const git = (args, options = {}) => execFileSync('git', ['--no-replace-objects', ...args], {
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'ignore'],
  maxBuffer: 64 * 1024 * 1024,
  ...options,
})

function pendingCommit(path) {
  const message = readFileSync(path, 'utf8')
  return {
    label: 'pending commit',
    author: parseGitIdent(git(['var', 'GIT_AUTHOR_IDENT'])),
    committer: parseGitIdent(git(['var', 'GIT_COMMITTER_IDENT'])),
    message,
    conventionalMessage: git(['stripspace', '--strip-comments'], { input: message }),
  }
}

function readCommit(sha) {
  const object = git(['cat-file', 'commit', sha])
  const end = object.indexOf('\n\n')
  if (end === -1 || object.includes('\0')) throw new Error('invalid commit object')
  const headers = object.slice(0, end).split('\n')
  return {
    label: sha.slice(0, 12),
    author: parseGitIdent(headers.find((line) => line.startsWith('author '))?.slice(7) ?? ''),
    committer: parseGitIdent(headers.find((line) => line.startsWith('committer '))?.slice(10) ?? ''),
    message: object.slice(end + 2),
    recorded: true,
  }
}

function main([mode, path, ...extra]) {
  const range = /^[^.].*?\.\.(?!\.).+$/u.test(mode ?? '')
  if (extra.length || (mode === '--pending' ? !path : !range || path !== undefined)) {
    console.error('usage: commit-check.mjs <base..head> | --pending <message-file>')
    return 2
  }
  try {
    const house = loadDenyHashes(new URL('./house-identities.json', import.meta.url))
    const commits = range
      ? git(['rev-list', '--end-of-options', mode, '--']).trim().split('\n').filter(Boolean).map(readCommit)
      : [pendingCommit(path)]
    let blocked = false
    for (const commit of commits) {
      for (const finding of checkCommit(commit, house)) {
        console.error(`commit-check: ${commit.label}: ${finding}`)
        blocked = true
      }
    }
    if (!blocked) console.log(`commit-check: ${commits.length} commit(s) passed`)
    return Number(blocked)
  } catch {
    console.error('commit-check: unable to read Git commits, pending message, or house identities')
    return 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
