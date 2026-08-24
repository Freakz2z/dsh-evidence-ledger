import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { apply, Config, __private__, inject, name } from './index.js'

let failed = 0
function check(label, condition) {
  if (!condition) {
    failed++
    console.error(`FAIL: ${label}`)
  } else {
    console.log(`ok: ${label}`)
  }
}

check('plugin name is evidence-ledger', name === 'evidence-ledger')
check('injects tools only', JSON.stringify(inject) === JSON.stringify(['tools']))
check('default path is local', Config().path === '.dsh/evidence-ledger.jsonl')
check('default result limit is bounded', Config().maxResults === 20)

let threw = false
try { Config({ maxResults: 101 }) } catch { threw = true }
check('config rejects an excessive result limit', threw)

const originalCwd = process.cwd()
const workspace = await mkdtemp(join(tmpdir(), 'dsh-evidence-ledger-'))
process.chdir(workspace)

try {
  const registered = []
  const ctx = {
    effect(fn) { return fn() },
    tools: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
  }
  apply(ctx, Config({ path: '.dsh/test-ledger.jsonl', maxResults: 2 }))
  check('registers one evidence tool', registered.length === 1 && registered[0].name === 'evidence_ledger')
  const tool = registered[0]

  const first = await tool.execute({
    action: 'record',
    kind: 'test',
    status: 'verified',
    claim: 'The package test suite passes.',
    evidence: 'node test.mjs exited with code 0.',
    source: 'test.mjs',
    tags: ['ci', 'release'],
  })
  check('record returns a UUID entry', typeof first.entry.id === 'string' && first.entry.id.length > 20)
  check('record keeps provenance fields', first.entry.status === 'verified' && first.entry.source === 'test.mjs')

  await tool.execute({
    action: 'record',
    kind: 'decision',
    status: 'observed',
    claim: 'Keep the ledger local by default.',
    evidence: 'The default path is relative to the workspace and no network client is used.',
    tags: ['design'],
  })
  await tool.execute({
    action: 'record',
    kind: 'failure',
    status: 'rejected',
    claim: 'A failed deployment proves the feature is broken.',
    evidence: 'The deployment was never attempted; the claim is rejected.',
    tags: ['scope'],
  })

  const recent = await tool.execute({ action: 'list' })
  check('list applies the configured result limit', recent.count === 2 && recent.total === 3)
  check('list returns newest entries first', recent.entries[0].kind === 'failure')

  const searched = await tool.execute({ action: 'list', query: 'WORKSPACE', limit: 10 })
  check('list searches evidence and source case-insensitively', searched.count === 1 && searched.entries[0].kind === 'decision')

  const filtered = await tool.execute({ action: 'list', status: 'verified', limit: 10 })
  check('list filters by status', filtered.count === 1 && filtered.entries[0].kind === 'test')

  const byKind = await tool.execute({ action: 'list', kind: 'decision', limit: 10 })
  check('list filters by kind', byKind.count === 1 && byKind.entries[0].kind === 'decision')

  const byTag = await tool.execute({ action: 'list', tag: 'CI', limit: 10 })
  check('list filters tags case-insensitively', byTag.count === 1 && byTag.entries[0].kind === 'test')

  threw = false
  try { await tool.execute({ action: 'list', kind: 'unknown' }) } catch { threw = true }
  check('list rejects an unknown kind', threw)

  const raw = await readFile(join(workspace, '.dsh/test-ledger.jsonl'), 'utf8')
  check('ledger is newline-delimited JSON', raw.trim().split('\n').length === 3)

  await appendFile(join(workspace, '.dsh/test-ledger.jsonl'), '{"legacy":true}\n', 'utf8')
  const legacySafe = await tool.execute({ action: 'list', tag: 'ci', limit: 10 })
  check('list tolerates a valid legacy row without tags', legacySafe.count === 1)

  threw = false
  try { await tool.execute({ action: 'record', claim: '', evidence: 'x' }) } catch { threw = true }
  check('record rejects an empty claim', threw)

  threw = false
  try { apply(ctx, Config({ path: '../outside.jsonl' })) } catch { threw = true }
  check('apply rejects a path outside the workspace', threw)

  check('private path resolver accepts workspace-relative paths', __private__.resolveLedgerPath('.dsh/a.jsonl').startsWith(resolve(process.cwd())))
} finally {
  process.chdir(originalCwd)
  await rm(workspace, { recursive: true, force: true })
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
