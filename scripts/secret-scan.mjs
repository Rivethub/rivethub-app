#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { loadDenyHashes as loadHashes, removedHashes, runScanner, sha256 } from './scan-files.mjs'

export { removedHashes, sha256 }
export const loadDenyHashes = () => loadHashes(new URL('./secret-denylist.json', import.meta.url))

const ALLOW_PRAGMAS = ['secret-scan-allow', 'gate-allow']
const allowShape = (line) => ALLOW_PRAGMAS.some((pragma) => line.includes(pragma))
const WELL_KNOWN = new Set(['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '9.9.9.9'])

function ipKind(ip) {
  const [a, b, c, d] = ip.split('.').map(Number)
  if ([a, b, c, d].some((octet) => octet > 255)) return
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)) return 'private-ip'
  if (WELL_KNOWN.has(ip) || a === 0 || a === 127 || a >= 224 || (a === 169 && b === 254)
    || (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)) return
  return 'public-ip'
}

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g
// ULA (fc00::/7 → fc../fd..) and link-local (fe80::) internal IPv6. Requires ≥2
// colon groups so it doesn't fire on stray hex.
const IPV6_INTERNAL = /\b(?:f[cd][0-9a-f]{2}|fe80)(?::[0-9a-f]{0,4}){2,}\b/gi
// A standard-base64 32-byte value (== a WireGuard key). NOTE: this also matches
// any other 32-byte base64 blob (raw sha256, other keys) — a known FP class;
// use `secret-scan-allow` for audited fixtures. Kept BLOCK because a real key
// leak is worse than an occasional pragma.
const WG_KEY = /\b[A-Za-z0-9+/]{43}=(?![A-Za-z0-9+/=])/g
// `.lan` as the final label only — the (?!\.) stops `foo.lan.com` false hits.
const LAN_HOST = /\b[a-z0-9][a-z0-9-]*\.lan\b(?!\.)/gi


const CREDENTIALS = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/\b[0-9]{17,19}:[A-Za-z0-9_-]{35}\b/, 'Telegram bot token'],
  [/\bMT[A-Za-z0-9]{22,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/, 'Discord bot token'],
  [/\b(?:api[_-]?key|secret[_-]?key|token|password)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{20,}["']/i, 'credential assignment'],
]

function scanLine(line, file) {
  if (allowShape(line)) return [{ rule: 'suppressed', severity: 'warn', hint: 'shape allow pragma used' }]
  const out = []
  for (const [match] of line.matchAll(IPV4)) {
    const rule = ipKind(match.split('/')[0])
    if (!rule) continue
    out.push(rule === 'private-ip'
      ? { rule, severity: 'block', match, hint: 'use an RFC 5737 documentation address' }
      : { rule, severity: 'warn', match, hint: 'verify this is a published address' })
  }
  for (const [pattern, rule, hint] of [
    [IPV6_INTERNAL, 'ipv6-internal', 'internal IPv6 (ULA/link-local)'],
    [WG_KEY, 'wg-key', 'WireGuard/base64 key shape'],
    [LAN_HOST, 'lan-host', 'internal .lan hostname'],
  ]) {
    for (const [match] of line.matchAll(pattern)) out.push({ rule, severity: 'block', match, hint })
  }

  if (!/(^|\/)(fixtures|testdata|golden)(\/|$)/.test(file)) {
    for (const [pattern, hint] of CREDENTIALS) {
      const hit = pattern.exec(line)
      if (hit) out.push({ rule: 'secret', severity: 'block', match: hit[0], hint })
    }
  }
  return out
}

function denylistHits(line, denyHashes) {
  const tokens = new Set()
  for (const [match] of line.matchAll(/\S{8,}/gu)) tokens.add(match)
  for (const [match] of line.matchAll(IPV4)) {
    tokens.add(match)
    tokens.add(match.split('/')[0])
  }
  for (const pattern of [IPV6_INTERNAL, WG_KEY, LAN_HOST]) {
    for (const [match] of line.matchAll(pattern)) tokens.add(match)
  }
  return [...tokens]
    .filter((token) => denyHashes.has(sha256(token)) || denyHashes.has(sha256(token.toLowerCase())))
    .map((match) => ({ rule: 'denylist', severity: 'block', match, hint: 'exact known-sensitive value' }))
}

export function scanText(text, { file = '', denyHashes = new Set() } = {}) {
  return text.split('\n').flatMap((line, index) => [
    ...scanLine(line, file),
    ...denylistHits(line, denyHashes),
  ].map((finding) => ({ ...finding, line: index + 1 })))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = runScanner('secret', scanText)
}
