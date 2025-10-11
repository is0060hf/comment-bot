# Tasks Document

- [ ] 1. Create shared types and schema in packages/shared
  - File: packages/shared/src/types/appConfig.ts
  - Define: AppConfig, TranscriptSegment, ContextSummary, TriggerDecision, GeneratedComment, ModerationResult, PostResult
  - Success: TS strict, no `any`/`unknown`

- [ ] 2. Create CLI entry and commands
  - File: packages/agent/bin/comment-bot, packages/agent/src/cli/
  - Implement: start, pause, resume, safety, stop; SIGINT/SIGTERM handling
  - Success: Stable start/stop, kill local OAuth callback server on stop

- [ ] 3. Implement audio capture and STT
  - File: packages/agent/src/audio/, packages/agent/src/stt/
  - Implement: BlackHole input → 16kHz/mono/buffer; streaming interim/final
  - Success: Continuous recognition, auto-reconnect

- [ ] 4. Implement trigger, generation, safety
  - File: packages/agent/src/{trigger,llm,safety}/
  - Implement: rule/LLM classify → generate → moderate (fallback)
  - Success: Suppress when unnecessary, block/adjust NG

- [ ] 5. Implement YouTube posting (Plan A)
  - File: packages/agent/src/platform/youtube/
  - Implement: OAuth(local), `liveChatMessages.insert`, rate/backoff/dedupe
  - Success: Post to active live, correct behavior on limits/errors

- [ ] 6. Implement config and sync
  - File: packages/agent/src/config/, packages/web/app/api/config/route.ts
  - Implement: YAML load + merge sanitized Edge Config/KV
  - Success: UI edits reflected locally, secrets not saved

- [ ] 7. Build Web UI
  - File: packages/web/app/{dashboard,settings,safety}/
  - Implement: Tailwind/Radix/shadcn, react-hook-form+zod, Server Actions/Route Handlers
  - Success: Type validation, baseline WCAG 2.2

- [ ] 8. Rate/scheduler
  - File: packages/agent/src/scheduler/
  - Implement: minIntervalSeconds, maxPer10Min, cooldownSeconds, dedupeWindowSec
  - Success: Prevent burst and duplicates

- [ ] 9. Logging/errors
  - File: packages/agent/src/*
  - Implement: Minimal error logs only, PII mask, retention cap
  - Success: No logs on normal ops, enough info on failures

- [ ] 10. Build/test
  - File: package.json, tsconfig.base.json
  - Implement: npm workspaces, ESLint/Prettier, unit/integration tests (mock external)
  - Success: Build passes, key flows tested
