import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import z from '@deepseek-ai/schemastery'

const DEFAULT_PATH = '.dsh/evidence-ledger.jsonl'
const DEFAULT_MAX_RESULTS = 20
const MAX_RESULTS = 100
const MAX_TEXT_LENGTH = 4000
const MAX_TAGS = 8
const STATUSES = ['observed', 'verified', 'rejected', 'pending']
const KINDS = ['fact', 'test', 'decision', 'failure', 'note']

export const name = 'evidence-ledger'
export const inject = ['tools']

/**
 * Configuration for the local evidence ledger.
 *
 * `path` is relative to the DSH workspace and must remain inside it. The
 * ledger is append-only: this plugin never rewrites or deletes old entries.
 */
export const Config = z.object({
  path: z.string().default(DEFAULT_PATH),
  maxResults: z.number().min(1).max(MAX_RESULTS).default(DEFAULT_MAX_RESULTS),
})

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`)
  }
  const text = value.trim()
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`${field} must be at most ${MAX_TEXT_LENGTH} characters`)
  }
  if (text.includes('\u0000')) {
    throw new Error(`${field} must not contain NUL characters`)
  }
  return text
}

function resolveLedgerPath(configuredPath) {
  const workspace = resolve(process.cwd())
  if (isAbsolute(configuredPath)) {
    throw new Error('path must be relative to the DSH workspace')
  }
  const filePath = resolve(workspace, configuredPath)
  const workspacePrefix = workspace.endsWith(sep) ? workspace : `${workspace}${sep}`
  if (filePath !== workspace && !filePath.startsWith(workspacePrefix)) {
    throw new Error('path must stay inside the DSH workspace')
  }
  return filePath
}

function displayPath(filePath) {
  const value = relative(process.cwd(), filePath)
  return value === '' ? '.' : value
}

function normalizeLimit(value, fallback) {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_RESULTS) {
    throw new Error(`limit must be an integer between 1 and ${MAX_RESULTS}`)
  }
  return value
}

function normalizeTags(value) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > MAX_TAGS) {
    throw new Error(`tags must contain at most ${MAX_TAGS} strings`)
  }
  return value.map((tag, index) => requireText(tag, `tags[${index}]`))
}

function matches(entry, query, status) {
  if (status !== undefined && entry.status !== status) return false
  if (query === undefined || query === '') return true
  const haystack = [entry.claim, entry.evidence, entry.source ?? '', ...entry.tags].join('\n').toLowerCase()
  return haystack.includes(query.toLowerCase())
}

async function readEntries(filePath) {
  let content
  try {
    content = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries: [], malformed: [] }
    throw error
  }

  const entries = []
  const malformed = []
  for (const [index, line] of content.split('\n').entries()) {
    if (line.trim() === '') continue
    try {
      const entry = JSON.parse(line)
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('entry is not an object')
      entries.push(entry)
    } catch (error) {
      malformed.push({ line: index + 1, reason: error.message })
    }
  }
  return { entries, malformed }
}

async function record(filePath, args) {
  const claim = requireText(args.claim, 'claim')
  const evidence = requireText(args.evidence, 'evidence')
  const kind = args.kind ?? 'fact'
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of: ${KINDS.join(', ')}`)
  const status = args.status ?? 'observed'
  if (!STATUSES.includes(status)) throw new Error(`status must be one of: ${STATUSES.join(', ')}`)
  const tags = normalizeTags(args.tags) ?? []
  const source = args.source === undefined ? undefined : requireText(args.source, 'source')
  const entry = {
    id: randomUUID(),
    recordedAt: new Date().toISOString(),
    kind,
    status,
    claim,
    evidence,
    tags,
    ...(source === undefined ? {} : { source }),
  }

  await mkdir(resolve(filePath, '..'), { recursive: true })
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8')
  return {
    action: 'record',
    path: displayPath(filePath),
    entry,
    count: 1,
  }
}

async function list(filePath, args, configuredLimit) {
  const query = args.query === undefined ? undefined : requireText(args.query, 'query').toLowerCase()
  const status = args.status
  if (status !== undefined && !STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${STATUSES.join(', ')}`)
  }
  const limit = normalizeLimit(args.limit, configuredLimit)
  const { entries, malformed } = await readEntries(filePath)
  const matched = entries.filter(entry => matches(entry, query, status)).slice(-limit).reverse()
  return {
    action: 'list',
    path: displayPath(filePath),
    entries: matched,
    count: matched.length,
    total: entries.length,
    malformed,
  }
}

function render(value) {
  if (value.action === 'record') {
    return `Recorded ${value.entry.kind} evidence (${value.entry.status}): ${value.entry.claim}`
  }
  const lines = [`Evidence ledger: ${value.count} result(s) from ${value.path}`]
  for (const entry of value.entries) {
    lines.push(`- [${entry.status}] ${entry.claim}`)
    lines.push(`  evidence: ${entry.evidence}`)
    if (entry.source) lines.push(`  source: ${entry.source}`)
  }
  if (value.malformed.length > 0) {
    lines.push(`Warning: skipped ${value.malformed.length} malformed line(s).`)
  }
  return lines.join('\n')
}

export function apply(ctx, config) {
  const filePath = resolveLedgerPath(config.path)
  ctx.effect(() => ctx.tools.register({
    name: 'evidence_ledger',
    description: 'Record or search local, append-only evidence for facts, tests, decisions, failures, and pending claims. Use observed or verified only when the evidence is actually available; do not turn assumptions into facts.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['record', 'list'],
          description: 'record a new entry or list existing entries',
        },
        kind: {
          type: 'string',
          enum: KINDS,
          description: 'entry type for record: fact, test, decision, failure, or note',
        },
        status: {
          type: 'string',
          enum: STATUSES,
          description: 'evidence state: observed, verified, rejected, or pending',
        },
        claim: { type: 'string', description: 'the concise claim or decision being recorded' },
        evidence: { type: 'string', description: 'what was observed, tested, or used to support the claim' },
        source: { type: 'string', description: 'optional command, file, commit, URL, or other provenance pointer' },
        tags: { type: 'array', items: { type: 'string' }, description: 'optional searchable tags' },
        query: { type: 'string', description: 'case-insensitive text search across claim, evidence, source, and tags' },
        limit: { type: 'number', description: 'maximum number of list results, from 1 to 100' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          action: { type: 'string' },
          path: { type: 'string' },
          count: { type: 'number' },
          total: { type: 'number' },
          entry: { type: 'object', additionalProperties: true },
          entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
          malformed: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: render(value) }],
    },
    async execute(args) {
      if (args.action === 'record') return record(filePath, args)
      if (args.action === 'list') return list(filePath, args, config.maxResults)
      throw new Error('action must be either record or list')
    },
  }), 'evidence-ledger.tools()')
}

export const __private__ = {
  KINDS,
  STATUSES,
  resolveLedgerPath,
  readEntries,
}
