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

## Policy & Providers

- [ ] 11. Decide provider priorities and failover
  - File: packages/agent/src/config/providers.ts
  - Implement: STT priority (deepgram > gcp > whisper), LLM (openai primary), Safety (openai_moderation primary, rule_based fallback)
  - Success: Failover works; provider can be switched via YAML/UI

- [ ] 12. Apply config defaults for provider/model
  - File: configs/config.example.yaml, packages/web/app/settings/*
  - Implement: Defaults: stt.provider=gcp (model="latest-ja-conversational"), llm.model="gpt-4o-mini", moderation.providers=["openai_moderation","rule_based"], safety.level=standard
  - Success: YAML validates; UI reflects and edits sanitize-only config

- [ ] 13. Enforce comment length policy (20–60 chars) + UI
  - File: packages/agent/src/llm/, packages/web/app/settings/page.tsx
  - Implement: Min/Max chars enforcement; server-side validation; UI control
  - Success: All outputs within bounds; invalid settings rejected

- [ ] 14. Seed NG words and normalization
  - File: packages/agent/src/safety/ngWords.ts
  - Implement: Baseline NG categories（差別/侮辱/暴力/アダルト/個人情報）; 正規化（かな変換・半全角・繰返し縮約・記号除去）
  - Success: 単純変形や繰返しでのすり抜け防止を確認

- [ ] 15. Emoji policy (allow, max 1, allowlist)
  - File: packages/agent/src/policy/emoji.ts, configs/config.example.yaml
  - Implement: allowedEmojis=["👏","✨","🙏","💡"], maxEmojisPerMsg=1, 類似重複抑止
  - Success: 2個以上は削減; 非許可は除去; 連投での類似抑止が効く

- [ ] 16. Update prompts (generation/classifier)
  - File: packages/agent/src/llm/prompts.ts
  - Implement: 口調・方針・長さ・NG/絵文字方針を反映したsystem/assistant指示; 分類用プロンプトを軽量化
  - Success: 出力がポリシー順守; 分類の一致率向上

- [ ] 17. Moderation thresholds and rewrite fallback
  - File: packages/agent/src/safety/moderation.ts
  - Implement: OpenAI Moderationスコア閾値（例: 高リスクはブロック/軽度はリライト→再検査→不可ならブロック）; ルールベースfallback
  - Success: 有害文がブロック/修正; 誤検知の抑制

- [ ] 18. Tsumiki-cursor groundwork
  - File: README.md, tsumiki-cursor/*
  - Implement: 参照モードの手順確認; スクリプト実行ガイドをREADMEに追記（外部API記載なし）
  - Success: Kairo/TDDガイドが本プロジェクト向けに機能

- [ ] 19. Serena onboarding and memory
  - File: N/A (tooling)
  - Implement: serena起動→オンボーディング→要件/設計/ポリシー/優先プロバイダを記憶
  - Success: メモリ参照で仕様方針が呼び出せる

## Tsumiki AITDD Support

- [ ] 20. Provider & platform mocks
  - File: packages/agent/test/mocks/{stt,llm,moderation,youtube}.ts
  - Implement: Deepgram/GCP/Whisper, OpenAI, Moderation, YouTubeのモックと固定応答/失敗注入
  - Success: 失敗注入でフェイルオーバー/バックオフの挙動が再現可能

- [ ] 21. Unit tests scaffolding (Red first)
  - File: packages/agent/test/unit/{trigger,formatter,emoji,ngWords,moderation,rateLimiter}.test.ts
  - Implement: TC-013/014/015/017/レート周りの失敗テストを先に作成
  - Success: 初回Red→実装後Green→Refactor→再実行の流れを確立

- [ ] 22. E2E pipeline test (mocked)
  - File: packages/agent/test/e2e/pipeline.test.ts
  - Implement: STT→検知→生成→安全→投稿の擬似フロー（TC-011〜017）
  - Success: 必要時のみ投稿、20–60字、許可絵文字≤1、NGなし、レート遵守

- [ ] 23. Posting length policy handling
  - File: packages/agent/src/platform/youtube/messageLength.ts
  - Implement: 200字上限の短縮優先/最大2分割・間隔>=cooldown、テスト付与
  - Success: 長文入力で期待どおり短縮/分割される

- [ ] 24. CI test runner setup
  - File: package.json, vitest.config.ts, .github/workflows/test.yml（任意）
  - Implement: vitest実行、レポート出力、ワークスペース対応
  - Success: ローカル/CIでテストが安定実行

- [ ] 25. UI server actions tests (settings/safety)
  - File: packages/web/test/{settings,safety}.test.ts
  - Implement: zod検証・サニタイズ・EdgeConfig書き込みのモックテスト
  - Success: 無効設定がreject、正規設定がpersist（秘密は含まない）

- [ ] 26. Readme & flow docs for AITDD
  - File: README.md, .spec-workflow/specs/comment-bot/tests/test_spec.md
  - Implement: Red→Green→Refactor→Verifyの運用手順を明記（実装禁止フェーズのガイド含む）
  - Success: 新規メンバーが手順に従いTDDを即実行可能
