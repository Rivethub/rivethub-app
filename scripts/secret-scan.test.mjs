// Run: node --test scripts/secret-scan.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanText, loadDenyHashes, removedHashes, sha256 } from './secret-scan.mjs'

const rules = (text, opts) => scanText(text, opts).map((f) => f.rule)
const sev = (text, rule, opts) => scanText(text, opts).find((f) => f.rule === rule)?.severity

test('flags a real private (internal) subnet/host', () => {
  // generic RFC1918 values (NOT this infra's) — the scanner's own test file is
  // excluded from --tracked, but keep real subnets out of it regardless.
  assert.deepEqual(rules('const lan = "10.9.8.0/24"'), ['private-ip'])
  assert.ok(rules('host 172.20.5.9').includes('private-ip'))
})

test('flags a real public IP as a non-blocking warning', () => {
  const hits = scanText('endpoint 93.184.216.34')
  assert.deepEqual(hits.map((h) => h.rule), ['public-ip'])
  assert.equal(hits[0].severity, 'warn')
})

test('internal subnet / wg key / .lan / ipv6 are blocking', () => {
  assert.equal(sev('lan 172.20.5.9', 'private-ip'), 'block')
  assert.equal(sev('key ' + 'Z'.repeat(43) + '=', 'wg-key'), 'block')
  assert.equal(sev('ssh box.lan', 'lan-host'), 'block')
  assert.equal(sev('addr fd00:1234::5', 'ipv6-internal'), 'block')
  assert.equal(sev('addr fe80::1', 'ipv6-internal'), 'block')
})

test('blocks all RFC 1918 and carrier-grade NAT addresses', () => {
  for (const address of ['192.168.1.5', '10.0.0.4', '172.16.0.9', '100.64.0.1', '100.127.255.254']) {
    assert.equal(sev(address, 'private-ip'), 'block')
  }
  assert.deepEqual(rules('192.0.2.10 198.51.100.7 203.0.113.1'), [])
})

test('blocks both private host addresses and private CIDRs', () => {
  for (const address of ['10.0.0.0/8', '192.168.0.0/16', '172.16.0.0/12', '10.0.0.0/24']) {
    assert.equal(sev(address, 'private-ip'), 'block')
  }
  assert.deepEqual(rules('192.0.2.0/24'), [])
})

test('0.0.0.0/0 wildcard stays clean, but a sibling real subnet still blocks', () => {
  assert.deepEqual(rules('AllowedIPs = 0.0.0.0/0'), [])
  assert.ok(rules('AllowedIPs = 0.0.0.0/0, 10.9.8.0/24').includes('private-ip'))
})

test('ignores loopback / link-local / this-host / well-known DNS', () => {
  assert.deepEqual(rules('127.0.0.1 169.254.1.1 0.0.0.0 8.8.8.8 1.1.1.1'), [])
})

test('public IPv6 is not flagged (only ULA/link-local)', () => {
  assert.deepEqual(rules('cf 2606:4700:4700::1111'), [])
})

test('flags internal .lan hostnames but not .lan inside a longer domain', () => {
  assert.deepEqual(rules('ssh box.lan'), ['lan-host'])
  assert.deepEqual(rules('visit foo.lan.com/path'), []) // .lan not the final label
})

test('ignores invalid octets and checks addresses with leading zeros', () => {
  assert.deepEqual(rules('build 10.4.999.1'), [])
  assert.equal(sev('010.004.002.001', 'private-ip'), 'block')
})

test('inline allow pragma suppresses shape rules but is audited as a warning', () => {
  const hits = scanText('host 198.18.0.1 // secret-scan-allow')
  assert.ok(!hits.some((h) => h.rule === 'public-ip')) // shape suppressed
  assert.ok(hits.some((h) => h.rule === 'suppressed' && h.severity === 'warn')) // audit trail
})

test('pragma does NOT suppress a denylist (crown-jewel) hit', () => {
  const deny = new Set([sha256('93.184.216.34')])
  const hits = scanText('ip 93.184.216.34 // secret-scan-allow', { denyHashes: deny })
  assert.ok(hits.some((h) => h.rule === 'denylist' && h.severity === 'block'))
})

test('denylist hit is BLOCK even for an otherwise-warn public IP', () => {
  const deny = new Set([sha256('93.184.216.34')])
  assert.equal(sev('ip 93.184.216.34', 'denylist', { denyHashes: deny }), 'block')
})

test('denylist matches .lan case-insensitively (token lowercased before hashing)', () => {
  const deny = new Set([sha256('box.lan')])
  assert.ok(scanText('ssh Box.LAN', { denyHashes: deny }).some((h) => h.rule === 'denylist'))
})

test('denylist matches both bare IP and CIDR forms', () => {
  const deny = new Set([sha256('93.184.216.34')])
  assert.ok(scanText('net 93.184.216.34/32', { denyHashes: deny }).some((h) => h.rule === 'denylist'))
})

test('hashed denylist catches an exact value the generic rules would allow', () => {
  const deny = new Set([sha256('192.0.2.55')]) // 192.0.2.x is example-allowed
  assert.deepEqual(scanText('safe-looking 192.0.2.55', { denyHashes: deny }).map((h) => h.rule), ['denylist'])
})

test('no false positive on semver-ish and plain prose', () => {
  assert.deepEqual(rules('version 1.2.3 released; see the 4.10 notes'), [])
})

test('denylist loads and is non-empty (crown-jewel protection is live)', () => {
  assert.ok(loadDenyHashes().size >= 1, 'secret-denylist.json must contain sha256 entries')
})

test('tamper check flags removed baseline hashes (denylist may not shrink)', () => {
  const baseline = new Set(['a'.repeat(64), 'b'.repeat(64)])
  assert.deepEqual(removedHashes(baseline, new Set([...baseline])), []) // unchanged → ok
  assert.deepEqual(removedHashes(baseline, new Set(['a'.repeat(64)])), ['b'.repeat(64)]) // removal caught
  assert.deepEqual(removedHashes(baseline, new Set([...baseline, 'c'.repeat(64)])), []) // additions fine
})


test('checks credential shapes outside fixtures and still checks hashed secrets in fixtures', () => {
  const token = 'ghp_' + 'Z'.repeat(32)
  assert.equal(sev(token, 'secret'), 'block')
  assert.deepEqual(rules(token, { file: 'pkg/testdata/response.txt' }), [])
  assert.equal(sev(token, 'denylist', { file: 'pkg/golden/fake.txt', denyHashes: new Set([sha256(token)]) }), 'block')
  assert.equal(sev('fd00::1', 'ipv6-internal', { file: 'pkg/fixtures/example' }), 'block')
})

test('checks arbitrary whitespace-delimited hashed secrets case insensitively', () => {
  const hashes = new Set([sha256('example-opaque-token')])
  assert.deepEqual(rules('EXAMPLE-OPAQUE-TOKEN gate-allow', { denyHashes: hashes }), ['suppressed', 'denylist'])
})
