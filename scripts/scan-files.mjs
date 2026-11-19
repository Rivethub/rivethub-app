import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))
const git = (...args) => execFileSync('git', args, {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'ignore'],
})

export const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function parseDenyHashes({ sha256: entries = [] }) {
  return new Set(entries.filter((entry) => typeof entry === 'string' && /^[0-9a-f]{64}$/i.test(entry)).map((entry) => entry.toLowerCase()))
}

export const removedHashes = (baseline, current) => [...baseline].filter((hash) => !current.has(hash))

export function loadDenyHashes(path) {
  const hashes = parseDenyHashes(JSON.parse(readFileSync(path, 'utf8')))
  if (!hashes.size) throw new Error('denylist must have at least one valid SHA-256 entry')
  return hashes
}

function checkBaseline(name, current) {
  const ref = 'refs/remotes/origin/main'
  const path = `scripts/${name}-denylist.json`
  try {
    git('rev-parse', '--verify', ref)
  } catch {
    if (process.env.GITHUB_ACTIONS) throw new Error('origin/main is required for denylist comparison')
    console.warn(`${name}-scan: origin/main is unavailable for denylist comparison`)
    return
  }
  if (!git('ls-tree', '--name-only', ref, '--', path).trim()) return
  const baseline = parseDenyHashes(JSON.parse(git('show', `${ref}:${path}`)))
  const removed = removedHashes(baseline, current)
  if (removed.length) throw new Error(`${removed.length} denylist hash(es) removed vs origin/main`)
}

function skip(file, local) {
  return (local && /^scripts\/(?:(?:secret|privacy)-scan(?:\.test)?\.mjs|(?:secret|privacy)-denylist\.json)$/.test(file))
    || /(^|\/)(?:pnpm-lock\.yaml|Cargo\.lock)$/.test(file)
    || /\.(?:png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|woff2?|ttf|otf|mp3|wav|ogg|mp4|webm|so|a|bin|wasm|jar|keystore)$/i.test(file)
}

function scanTracked(file, scan) {
  const stat = lstatSync(file)
  if (stat.isSymbolicLink()) return scan(git('show', `:${file}`), file)
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) {
    throw new Error('unsupported file type or size')
  }
  return scan(readFileSync(file, 'utf8'), file)
}

function scanStaged(file, scan) {
  const diff = git('--literal-pathspecs', 'diff', '--cached', '--no-renames', '--no-ext-diff',
    '--no-textconv', '--no-color', '--text', '--unified=0', '--inter-hunk-context=0', '--', file)
  let lineNumber = 0
  const findings = []
  for (const line of diff.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
    if (hunk) lineNumber = Number(hunk[1])
    else if (lineNumber && line.startsWith('+')) findings.push(...scan(line.slice(1), file, lineNumber++))
  }
  return findings
}

export function runScanner(name, scanText) {
  const mode = process.argv[2]
  if (!['--tracked', '--staged', '--text'].includes(mode)) {
    console.error(`usage: ${name}-scan.mjs --staged | --tracked | --text (stdin)`)
    return 2
  }
  const redact = Boolean(process.env.CI || process.env.GITHUB_ACTIONS)
  let blocked = false
  try {
    const denyHashes = loadDenyHashes(resolve(scripts, `${name}-denylist.json`))
    const scan = (text, file, start = 1) => scanText(text, { file, denyHashes }).map((finding) => ({
      ...finding, file, line: finding.line + start - 1,
    }))
    function report(findings) {
      for (const { file, line, rule, severity, match, hint } of findings) {
        const shown = !match ? '' : redact ? ` <redacted:${sha256(match).slice(0, 8)}>` : ` ${match}`
        console.error(`${JSON.stringify(file)}:${line} [${rule}]${shown} — ${hint}`)
        if (severity !== 'warn') blocked = true
      }
    }
    if (mode === '--text') {
      report(scan(readFileSync(0, 'utf8'), '<input>'))
    } else {
      const local = relative(process.cwd(), scripts) === 'scripts'
      if (mode === '--tracked' && local) checkBaseline(name, denyHashes)
      const list = mode === '--tracked'
        ? git('ls-files', '-z', '--deduplicate')
        : git('diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=ACMT')
      for (const file of list.split('\0').filter(Boolean)) {
        if (skip(file, local)) continue
        try {
          report(mode === '--tracked' ? scanTracked(file, scan) : scanStaged(file, scan))
        } catch {
          console.error(`${JSON.stringify(file)}: [unscannable-file]`)
          blocked = true
        }
      }
    }
  } catch (error) {
    const detail = error.code || error instanceof SyntaxError ? 'unable to read scanner input or policy data' : error.message
    console.error(`${name}-scan: ${detail}`)
    return 1
  }
  if (!blocked) console.log(`${name}-scan: clean`)
  return Number(blocked)
}
