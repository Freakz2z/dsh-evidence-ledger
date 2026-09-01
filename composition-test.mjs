// Real Cordis Loader composition test. The harness checkout must be built.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '../deepseek-harness/vendor/cordis/lib/index.js'
import Loader from '../deepseek-harness/vendor/loader/lib/index.js'
import Include from '../deepseek-harness/vendor/include/lib/index.js'
import SystemPrompt from '../deepseek-harness/packages/core/system-prompt/lib/index.js'
import ToolRuntime from '../deepseek-harness/packages/core/tools/lib/index.js'
import * as ledger from './index.js'

const PLUGIN_PATH = new URL('./index.js', import.meta.url).pathname
let failed = 0
function check(label, condition) {
  if (!condition) {
    failed++
    console.error(`FAIL: ${label}`)
  } else {
    console.log(`ok: ${label}`)
  }
}

async function loadComposition(rows) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-evidence-ledger-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, rows.join('\n'))

  const context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    [PLUGIN_PATH, ledger],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  }
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  return { context, root }
}

const BASE = [
  "- name: '@deepseek-ai/dsh-system-prompt'",
  "- name: '@deepseek-ai/dsh-tools'",
]

{
  const { context, root } = await loadComposition([
    ...BASE,
    `- name: '${PLUGIN_PATH}'`,
    '  config:',
    '    path: .dsh/composition.jsonl',
    '    maxResults: 12',
  ])
  try {
    await context.loader.await()
    const unloaded = [...context.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    check('all entries loaded', unloaded.length === 0)
    const tool = context.tools.schemas().find(candidate => candidate.name === 'evidence_ledger')
    check('evidence tool is registered by the real loader', tool !== undefined)
    check('tool exposes record, list, and summary actions', tool?.parameters?.properties?.action?.enum?.join(',') === 'record,list,summary')
  } finally {
    await context.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall composition checks passed')
