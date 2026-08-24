# dsh-evidence-ledger

A local evidence ledger for DeepSeek Harness.

The plugin gives a DSH agent one `evidence_ledger` tool for recording facts, test results, decisions, failed paths, and pending claims in a workspace-local JSONL file. The default location is `.dsh/evidence-ledger.jsonl`. The ledger is append-only, offline, and never deletes historical entries.

## Install

```sh
dsh plugin --profile demo add github:Freakz2z/dsh-evidence-ledger
```

The bundle is activated automatically after installation. Once the npm package is published, `dsh-evidence-ledger` can be used as the install spec as well. The agent can then use `evidence_ledger` to record or search evidence.

## Tool usage

Record an observed test result:

```json
{
  "action": "record",
  "kind": "test",
  "status": "verified",
  "claim": "npm test passes",
  "evidence": "node test.mjs exited with code 0",
  "source": "test.mjs",
  "tags": ["release", "ci"]
}
```

Search recent entries:

```json
{
  "action": "list",
  "query": "release",
  "limit": 10
}
```

Results can also be narrowed by kind, status, or an exact tag:

```json
{
  "action": "list",
  "kind": "test",
  "status": "verified",
  "tag": "ci",
  "limit": 20
}
```

Supported `kind` values: `fact`, `test`, `decision`, `failure`, and `note`.

Supported `status` values: `observed`, `verified`, `rejected`, and `pending`.

The `list` filters for `kind`, `status`, and `tag` are exact; `query` remains a case-insensitive full-text search across claims, evidence, sources, and tags.

Keep observed evidence separate from unverified judgment. The plugin does not decide whether a claim is true; it preserves the supplied evidence and makes its provenance searchable.

## Configuration

The default configuration is ready to use. To change the file location or result limit, override the bundle row in a profile patch:

```yaml
- id: evidence-ledger
  config:
    path: .dsh/project-evidence.jsonl
    maxResults: 40
```

`path` must be a workspace-relative path. Absolute paths and `..` paths that escape the workspace are rejected. `maxResults` accepts values from 1 to 100.

## Privacy and boundaries

- No network requests and no remote service dependency.
- Writes only inside the configured workspace.
- Uses append-only JSONL; old entries are not automatically overwritten or deleted.
- Does not read other workspace files to infer evidence; records come from tool arguments.
- Avoid putting tokens, passwords, private keys, or complete personal data in claims, evidence, or sources.

## Development

```sh
npm ci
npm test
npm run pack:check
```

For a real Loader composition test, install the local package into a built DeepSeek Harness checkout:

```sh
dsh plugin --profile demo add .
```

## License

MIT
