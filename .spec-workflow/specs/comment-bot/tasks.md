# Tasks Document

- [x] 1. Create shared types and schema in packages/shared
  - File: packages/shared/src/types/appConfig.ts
  - Define: AppConfig, TranscriptSegment, ContextSummary, TriggerDecision, GeneratedComment,
    ModerationResult, PostResult
  - Success: TS strict, no `any`/`unknown`

- [x] 2. Create CLI entry and commands
  - File: packages/agent/bin/comment-bot, packages/agent/src/cli/
  - Implement: start, pause, resume, safety, stop; SIGINT/SIGTERM handling
  - Success: Stable start/stop, kill local OAuth callback server on stop

- [x] 3. Implement audio capture and STT
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

- [x] 6. Implement config and sync
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
  - File: packages/agent/src/\*
  - Implement: Minimal error logs only, PII mask, retention cap
  - Success: No logs on normal ops, enough info on failures

- [ ] 10. Build/test
  - File: package.json, tsconfig.base.json
  - Implement: npm workspaces, ESLint/Prettier, unit/integration tests (mock external)
  - Success: Build passes, key flows tested

## Policy & Providers

- [x] 11. Decide provider priorities and failover
  - File: packages/agent/src/config/providers.ts
  - Implement: STT priority (deepgram > gcp > whisper), LLM (openai primary), Safety
    (openai_moderation primary, rule_based fallback)
  - Success: Failover works; provider can be switched via YAML/UI

- [x] 12. Apply config defaults for provider/model
  - File: configs/config.example.yaml, packages/web/app/settings/\*
  - Implement: Defaults: stt.provider=gcp (model="latest-ja-conversational"),
    llm.model="gpt-4o-mini", moderation.providers=["openai_moderation","rule_based"],
    safety.level=standard
  - Success: YAML validates; UI reflects and edits sanitize-only config

- [x] 13. Enforce comment length policy (20–60 chars) + UI
  - File: packages/agent/src/llm/, packages/web/app/settings/page.tsx
  - Implement: Min/Max chars enforcement; server-side validation; UI control
  - Success: All outputs within bounds; invalid settings rejected

- [x] 14. Seed NG words and normalization
  - File: packages/agent/src/safety/ngWords.ts
  - Implement: Baseline NG
    categories（差別/侮辱/暴力/アダルト/個人情報）; 正規化（かな変換・半全角・繰返し縮約・記号除去）
  - Success: 単純変形や繰返しでのすり抜け防止を確認

- [x] 15. Emoji policy (allow, max 1, allowlist)
  - File: packages/agent/src/policy/emoji.ts, configs/config.example.yaml
  - Implement: allowedEmojis=["👏","✨","🙏","💡"], maxEmojisPerMsg=1, 類似重複抑止
  - Success: 2個以上は削減; 非許可は除去; 連投での類似抑止が効く

- [x] 16. Update prompts (generation/classifier)
  - File: packages/agent/src/llm/prompts.ts
  - Implement: 口調・方針・長さ・NG/絵文字方針を反映したsystem/assistant指示; 分類用プロンプトを軽量化
  - Success: 出力がポリシー順守; 分類の一致率向上

- [x] 17. Moderation thresholds and rewrite fallback
  - File: packages/agent/src/safety/moderation.ts
  - Implement: OpenAI
    Moderationスコア閾値（例: 高リスクはブロック/軽度はリライト→再検査→不可ならブロック）; ルールベースfallback
  - Success: 有害文がブロック/修正; 誤検知の抑制

- [ ] 18. Tsumiki-cursor groundwork
  - File: README.md, tsumiki-cursor/\*
  - Implement: 参照モードの手順確認; スクリプト実行ガイドをREADMEに追記（外部API記載なし）
  - Success: Kairo/TDDガイドが本プロジェクト向けに機能

- [x] 19. Serena onboarding and memory
  - File: N/A (tooling)
  - Implement: serena起動→オンボーディング→要件/設計/ポリシー/優先プロバイダを記憶
  - Success: メモリ参照で仕様方針が呼び出せる

## Tsumiki AITDD Support

- [x] 20. Provider & platform mocks
  - File: packages/agent/test/mocks/{stt,llm,moderation,youtube}.ts
  - Implement: Deepgram/GCP/Whisper, OpenAI, Moderation, YouTubeのモックと固定応答/失敗注入
  - Success: 失敗注入でフェイルオーバー/バックオフの挙動が再現可能

- [ ] 21. Unit tests scaffolding (Red first)
  - File: packages/agent/test/unit/{trigger,formatter,emoji,ngWords,moderation,rateLimiter}.test.ts
  - Implement: TC-013/014/015/017/レート周りの失敗テストを先に作成
  - Success: 初回Red→実装後Green→Refactor→再実行の流れを確立

- [x] 22. E2E pipeline test (mocked)
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

## Web UI Implementation

- [x] 27. Next.js project setup (packages/web)
  - File: packages/web/package.json, next.config.js, tsconfig.json
  - Implement: Next.js 14 App Router, TypeScript strict, Vercel deployment config
  - Success: npm run dev起動、TypeScriptビルド成功

- [ ] 28. Dashboard screen implementation (/dashboard)
  - File: packages/web/app/dashboard/page.tsx
  - Implement: 配信ステータス、コメント履歴、統計情報の表示
  - Success: リアルタイム更新、レスポンシブ対応

- [ ] 29. Settings screen implementation (/settings)
  - File: packages/web/app/settings/page.tsx
  - Implement: コメント設定、プロバイダ優先順位、口調設定のUI
  - Success: フォームバリデーション、設定保存・反映

- [ ] 30. Safety settings screen implementation (/safety)
  - File: packages/web/app/safety/page.tsx
  - Implement: モデレーション設定、NG語管理、閾値調整UI
  - Success: 設定変更即座反映、安全性確保

- [ ] 31. Server Actions/Route Handlers implementation
  - File: packages/web/app/api/_, packages/web/app/actions/_
  - Implement: 設定の読み書き、状態管理、エージェント通信
  - Success: APIセキュア、エラーハンドリング完備

- [ ] 32. Vercel Edge Config/KV integration
  - File: packages/web/lib/edge-config.ts, packages/web/lib/kv.ts
  - Implement: 設定の永続化、読み取り専用同期
  - Success: エージェント側で設定反映、秘密情報除外

- [x] 33. UI library integration (Tailwind/Radix/shadcn)
  - File: packages/web/components/ui/\*, tailwind.config.js
  - Implement: shadcn/ui導入、カスタムコンポーネント作成
  - Success: 統一されたUI、アクセシビリティ準拠

- [ ] 34. Form validation (react-hook-form + zod)
  - File: packages/web/lib/validation.ts, packages/web/hooks/useForm.ts
  - Implement: スキーマベースバリデーション、エラー表示
  - Success: 不正な入力の防止、UX向上

## Agent Implementation

- [x] 35. CLI entry point and commands
  - File: packages/agent/bin/comment-bot, packages/agent/src/cli/\*
  - Implement: start/stop/pause/resume/safety コマンド、プロセス管理
  - Success: 安定した起動・停止、エラー時の適切な終了

- [ ] 36. Audio capture (BlackHole/Loopback) implementation
  - File: packages/agent/src/audio/capture.ts
  - Implement: 仮想音声デバイスからの取得、バッファリング
  - Success: 継続的な音声取得、途切れ対応

- [ ] 37. STT streaming implementation (with reconnection)
  - File: packages/agent/src/stt/streaming.ts
  - Implement: WebSocket接続、中間・最終結果処理、再接続
  - Success: リアルタイム認識、ネットワーク断絶対応

- [ ] 38. Context store and trigger detection
  - File: packages/agent/src/context/_, packages/agent/src/trigger/_
  - Implement: コンテキスト管理、コメント機会検出ロジック
  - Success: 適切なタイミングでのコメント生成

- [ ] 39. YouTube OAuth flow implementation
  - File: packages/agent/src/youtube/auth.ts
  - Implement: OAuth 2.0フロー、トークン管理、更新処理
  - Success: 安全な認証、自動更新

- [ ] 40. Live Chat ID retrieval
  - File: packages/agent/src/youtube/live.ts
  - Implement: 配信ID取得、アクティブ配信確認
  - Success: 正しい配信へのコメント投稿

- [ ] 41. Rate limiting/scheduler implementation
  - File: packages/agent/src/scheduler/\*
  - Implement: レート制限、最小間隔、重複防止
  - Success: API制限遵守、適切な投稿頻度

- [ ] 42. Config sync (YAML + Edge Config merge)
  - File: packages/agent/src/config/sync.ts
  - Implement: ローカルYAML読み込み、Edge Config統合
  - Success: UI変更の反映、設定の優先順位適用

- [ ] 43. Process management (SIGINT/SIGTERM, OAuth server)
  - File: packages/agent/src/process/\*
  - Implement: グレースフルシャットダウン、リソース解放
  - Success: クリーンな終了、リソースリーク防止

## Infrastructure & Documentation

- [x] 44. Shared type definitions (packages/shared)
  - File: packages/shared/src/types/\*
  - Implement: 共通型定義、スキーマ、定数
  - Success: 型安全性確保、重複排除

- [x] 45. npm workspaces and monorepo setup
  - File: package.json, lerna.json
  - Implement: ワークスペース設定、依存関係管理
  - Success: 統一ビルド、依存解決

- [x] 46. ESLint/Prettier configuration
  - File: .eslintrc.js, .prettierrc
  - Implement: コーディング規約、自動フォーマット
  - Success: 一貫したコード品質

- [x] 47. TypeScript strict configuration (no any/unknown)
  - File: tsconfig.base.json
  - Implement: strict設定、型チェック強化
  - Success: 型安全性向上、ランタイムエラー削減

- [ ] 48. CI/CD pipeline setup
  - File: .github/workflows/\*, vercel.json
  - Implement: 自動テスト、デプロイ、品質チェック
  - Success: 継続的な品質保証

## Provider Implementations

- [ ] 49. STT adapter implementation (Deepgram/GCP/Whisper)
  - File: packages/agent/src/adapters/stt/\*
  - Implement: 各プロバイダAPI統合、共通インターフェース
  - Success: シームレスな切り替え、フェイルオーバー

- [ ] 50. LLM adapter implementation (OpenAI)
  - File: packages/agent/src/adapters/llm/\*
  - Implement: GPT-4 API統合、プロンプト管理
  - Success: 安定した生成、エラーハンドリング

- [ ] 51. Moderation adapter implementation (OpenAI Moderation)
  - File: packages/agent/src/adapters/moderation/\*
  - Implement: Moderation API統合、スコア処理
  - Success: 適切なコンテンツフィルタリング

- [ ] 52. YouTube adapter implementation (liveChatMessages.insert)
  - File: packages/agent/src/adapters/youtube/\*
  - Implement: YouTube API v3統合、エラー処理
  - Success: 確実なコメント投稿

## Documentation

- [ ] 53. User manual/README maintenance
  - File: README.md, docs/user-guide.md
  - Implement: セットアップ手順、使用方法、トラブルシューティング
  - Success: ユーザーが独力で導入可能

- [ ] 54. BlackHole/Loopback setup guide
  - File: docs/audio-setup.md
  - Implement: 仮想音声デバイス設定手順、図解
  - Success: 音声取得の確実な設定
