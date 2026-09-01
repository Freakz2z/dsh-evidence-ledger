# Changelog

## 0.2.0 - 2026-09-01

- Add a read-only `summary` action with kind/status counts and the latest matching entry.
- Reuse the same query, kind, status, and tag filters across list and summary operations.

## 0.1.1 - 2026-08-24

- Add exact `kind`, `status`, and `tag` filters to `evidence_ledger` list queries.
- Add coverage for filtered evidence retrieval and invalid kinds.

## 0.1.0 - 2026-08-24

- Add the local append-only `evidence_ledger` tool.
- Support recording and searching facts, tests, decisions, failures, and pending claims.
- Restrict ledger paths to the active DSH workspace.
- Add unit tests, real Loader composition coverage, and Node CI.
