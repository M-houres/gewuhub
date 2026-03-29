# Gewu Progress Snapshot (2026-03-28)

## Completed in this round

- Admin Settings now supports editing the 15-slot task matrix:
  - Task types: `reduce-repeat`, `reduce-ai`, `detect`
  - Platforms: `cnki`, `weipu`, `paperpass`, `wanfang`, `daya`
- Added client-side matrix shape validation before save:
  - Missing slot keys are blocked
  - Invalid mode values are blocked
  - Invalid slot field types are blocked
- Fixed garbled wording in the Execution Strategy copy for rewrite mode.
- Kept routing behavior stable for `rules_only`, `hybrid`, and `llm_only`.
- Kept safe fallback behavior: if no live model adapter exists, effective mode falls back to `rules_only`.
- Added model-key aware routing: when the selected model has an API key in admin config, `llm_only/hybrid` can stay in live mode (no forced fallback).
- Kept shared default rewrite strategy for `reduce-repeat` and `reduce-ai`.
- Kept `system-settings.ts` text config clean and parse-safe for rule matching.

## Verification

- Build passed:
  - `npm run build -w apps/admin`
  - `npm run build -w apps/api`
- Smoke tests passed:
  - `SMOKE_SCRIPT=smoke-admin-settings.mjs npm run smoke:critical`
  - `SMOKE_SCRIPT=smoke-execution-mode-routing.mjs npm run smoke:critical`
  - `SMOKE_SCRIPT=smoke-rewrite-shared-rules.mjs npm run smoke:critical`
  - Execution routing smoke now includes both fallback path and key-enabled live path.

## Current capability status

- 15-slot algorithm config is editable from admin and persisted through settings API.
- Task execution mode can be configured per slot (`rules_only`, `hybrid`, `llm_only`).
- Existing business chain is not broken by this change set.

## Remaining (not blocking continued development)

- Connect real model adapters so `hybrid` and `llm_only` run real inference.
- Replace mock payment gateway with real payment integration.
- Continue platform-specific rule tuning as more proprietary rules are provided.
- Finalize production secrets and infra deployment parameters.

## 2026-03-29 Incremental Update

- Model router now attempts real provider calls (OpenAI-compatible path for DeepSeek/OpenAI and configurable providers), then safely falls back to local generation when key/endpoint/adapter is unavailable.
- `/api/v1/model/route` now validates the selected model from admin registry and passes admin-configured model API key into routing.
- `/api/v1/tasks/stream` now also passes admin-configured model API key into model routing.
- Added new smoke guardrail `scripts/smoke-model-route-adapter.mjs` and included it in `smoke:critical` default suite.
- Added AI provider key/base-url placeholders to `.env.example` for deployment readiness.
