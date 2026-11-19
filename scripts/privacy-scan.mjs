#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { loadDenyHashes as loadHashes, parseDenyHashes, removedHashes, runScanner, sha256 } from './scan-files.mjs'

export { parseDenyHashes, removedHashes, sha256 }
export const loadDenyHashes = () => loadHashes(new URL('./privacy-denylist.json', import.meta.url))

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const AGENT_DATA_RE =
  /agent-data\/agents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi
const HOME_RE = /\/home\/([A-Za-z0-9._-]+)/g
const IPV4_LIKE_RE = /\b(\d{1,3}(?:\.\d{1,3}){1,3})\b/g
const FC_ID_RE = /\bfc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_0\b/gi
const WORD_RE = /\b[A-Za-z][A-Za-z0-9]*\b/g
const HYPHEN_TOKEN_RE = /\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b/g
const FAKE_UUIDS = new Set([
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
  '11111111-2222-4333-8444-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '99999999-aaaa-4bbb-8ccc-dddddddddddd',
])

const ALLOWED_HOME_USERS = new Set(['ubuntu', 'runner', 'rivet', 'rivetos', 'rivethub', 'user', 'example'])

/** Path markers apply to READMEs, docs, fixtures — not application source. */
const PATH_MARKER_RE = [
  /(^|\/)README(\.[A-Za-z0-9]+)?$/i,
  /(^|\/)docs\//,
  /(^|\/)fixtures\//,
  /\.(md|mdx)$/i,
]

export function isPathMarkerFile(file) {
  if (!file || file === '<input>') return true
  return PATH_MARKER_RE.some((re) => re.test(file))
}

/** Owner-identity files: skip persona + email only. UUIDs and tags still scan. */
const OWNER_IDENTITY_RE = [
  /(^|\/)LICENSE$/,
  /(^|\/)NOTICE$/,
  /^\.github\/CODEOWNERS$/,
]

export function isFakeUuid(id) {
  const s = String(id).toLowerCase()
  if (s.startsWith('00000000-0000-4000-8000-')) return true
  if (FAKE_UUIDS.has(s)) return true
  const first = s.slice(0, 8)
  if (/^(.)\1{7}$/.test(first)) return true
  const hex = s.replace(/-/g, '')
  return new Set(hex).size <= 4
}

export function isOwnerIdentityPath(file) {
  return OWNER_IDENTITY_RE.some((re) => re.test(file))
}

/** `--disable-pam` and similar flags are not persona tags. */
export function isCliFlagContext(line, index) {
  let i = index
  while (i > 0 && /[A-Za-z0-9-]/.test(line[i - 1])) i--
  return line.slice(i, i + 2) === '--'
}

function hyphenChainHasAgentPrefix(line, index) {
  let i = index
  while (i > 0 && /[A-Za-z0-9-]/.test(line[i - 1])) i--
  let j = index
  while (j < line.length && /[A-Za-z0-9-]/.test(line[j])) j++
  return /(^|-)(rivet|grokbot)(-|$)/i.test(line.slice(i, j))
}

/**
 * Identifier / tag context: `rivet-x`, `grokbot-x`, `-x-` slugs that
 * include those prefixes, or quoted strings. Not a CLI flag
 * (`--disable-x`) and not `Foo('x')`.
 */
export function inTagOrIdContext(line, index, token) {
  if (isCliFlagContext(line, index)) return false
  const before = line.slice(0, index)
  const after = line.slice(index + token.length)
  if (/[\p{L}\p{N}]-$/u.test(before) || /^-[\p{L}\p{N}]/u.test(after)) {
    return hyphenChainHasAgentPrefix(line, index)
  }
  const q = before.slice(-1)
  if ((q === "'" || q === '"' || q === '`') && after.startsWith(q)) {
    // process.arch comparisons (`=== 'arch'`) are not persona tags.
    if (/^arch$/i.test(token)) return false
    const pre = before.slice(0, -1)
    // Foo('x'), ['x'], or `fn("x")` are call/list args, not tags.
    if (/[\p{L}\p{N}_]$/u.test(pre) || /[[(,]$/.test(pre) || /,\s*$/.test(pre)) return false
    return true
  }
  return false
}

/**
 * Short tokens (≤4): Title-case words in prose (except `… Linux`), plus
 * lowercase / ALL-CAPS only in identifier or tag contexts. Longer tokens
 * match any case. PAM auth, `--disable-pam`, and `architecture` stay clean.
 */
export function shouldCheckPersonaToken(token, line = '', index = 0) {
  if (token.length <= 4) {
    if (/^[A-Z][a-z]+$/.test(token)) {
      if (/^\s+Linux\b/.test(line.slice(index + token.length))) return false
      return true
    }
    return inTagOrIdContext(line, index, token)
  }
  return true
}

export function scanLine(line, { file = '', denyHashes = new Set() } = {}) {
  const out = []
  const skipOwnerTokens = isOwnerIdentityPath(file)

  for (const m of line.matchAll(UUID_RE)) {
    const id = m[0].toLowerCase()
    if (denyHashes.has(sha256(id))) {
      out.push({
        rule: 'denylist-uuid',
        severity: 'block',
        match: id,
        hint: 'hashed denylist UUID',
      })
    }
  }
  for (const m of line.matchAll(FC_ID_RE)) {
    const id = m[0].toLowerCase()
    if (denyHashes.has(sha256(id))) {
      out.push({
        rule: 'denylist-tool-id',
        severity: 'block',
        match: id,
        hint: 'hashed denylist tool-call id',
      })
    }
  }
  for (const m of line.matchAll(HYPHEN_TOKEN_RE)) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m[0])) continue
    if (isCliFlagContext(line, m.index ?? 0)) continue
    const token = m[0].toLowerCase()
    const parts = token.split('-')
    const agentTag = parts.includes('rivet') || parts.includes('grokbot')
    const partHit = agentTag && parts.some((p) => p && denyHashes.has(sha256(p)))
    if (denyHashes.has(sha256(token)) || partHit) {
      out.push({
        rule: 'denylist-tag',
        severity: 'block',
        match: m[0],
        hint: 'hashed denylist hyphenated tag',
      })
    }
  }
  if (!skipOwnerTokens) {
    for (const m of line.matchAll(EMAIL_RE)) {
      const email = m[0].toLowerCase()
      if (denyHashes.has(sha256(email))) {
        out.push({
          rule: 'denylist-email',
          severity: 'block',
          match: email,
          hint: 'hashed denylist email',
        })
      }
    }
    for (const m of line.matchAll(WORD_RE)) {
      if (!shouldCheckPersonaToken(m[0], line, m.index ?? 0)) continue
      if (denyHashes.has(sha256(m[0].toLowerCase()))) {
        out.push({
          rule: 'denylist-persona',
          severity: 'block',
          match: m[0],
          hint: 'hashed denylist persona token',
        })
      }
    }
  }
  for (const m of line.matchAll(IPV4_LIKE_RE)) {
    const token = m[0]
    const parts = token.split('.')
    const candidates = [token]
    if (parts.length >= 3) candidates.push(parts.slice(0, 3).join('.'))
    if (parts.length >= 2) candidates.push(parts.slice(0, 2).join('.'))
    if (candidates.some((c) => denyHashes.has(sha256(c)))) {
      out.push({
        rule: 'denylist-ip-prefix',
        severity: 'block',
        match: token,
        hint: 'hashed denylist address or prefix',
      })
    }
  }
  for (const m of line.matchAll(WORD_RE)) {
    if (shouldCheckPersonaToken(m[0], line, m.index ?? 0)) continue
    // Short letter+digit tokens (lab hosts like box3) skip the persona gate.
    if (!/^[A-Za-z]{2,}\d+$/.test(m[0])) continue
    if (denyHashes.has(sha256(m[0].toLowerCase()))) {
      out.push({
        rule: 'denylist-host',
        severity: 'block',
        match: m[0],
        hint: 'hashed denylist host or token',
      })
    }
  }
  for (const m of line.matchAll(HOME_RE)) {
    if (ALLOWED_HOME_USERS.has(m[1])) continue
    const personal = denyHashes.has(sha256(m[1].toLowerCase()))
    if (!personal && !isPathMarkerFile(file)) continue
    out.push({
      rule: 'home-path',
      severity: 'block',
      match: m[0],
      hint: '/home/<user> — use /home/user, /home/ubuntu, /home/rivet, or $HOME',
    })
  }
  if (isPathMarkerFile(file)) {
    for (const m of line.matchAll(AGENT_DATA_RE)) {
      const id = m[1].toLowerCase()
      if (!isFakeUuid(id)) {
        out.push({
          rule: 'agent-data-path',
          severity: 'block',
          match: m[0],
          hint: 'agent-data/agents/<uuid> must use a fake UUID',
        })
      }
    }
  }
  return out
}

export function scanText(text, opts = {}) {
  const findings = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const f of scanLine(lines[i], opts)) findings.push({ ...f, line: i + 1 })
  }
  return findings
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runScanner('privacy', scanText)
}
