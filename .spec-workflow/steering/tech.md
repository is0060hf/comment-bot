# Technology Stack (comment-bot)

## Project Type

- Web UI（Next.js, Vercel）＋ ローカルCLI（Node.js/TypeScript, macOS）

## Core Technologies

- 言語: TypeScript（strict）
- UI: Next.js App Router（Server Components, Route Handlers/Server Actions）
- UIスタック: Tailwind CSS, Radix UI, shadcn/ui, react-hook-form + zod, lucide-react
- ローカル: Node.js CLI、音声（BlackHole/Loopback）

## Application Architecture

- レイヤード＋ポート&アダプタ。UIは設定編集/配布のみ。処理はローカルで常駐

## Data Storage

- Phase1: 永続RDBなし
- 任意: Vercel Edge Config/KV（サニタイズ済設定のみ）

## External Integrations

- YouTube Data API v3（`liveChatMessages.insert`）
- STT: Deepgram/GCP/Whisper API（Azureは非採用）
- モデレーション: OpenAI Moderation（Azureは非採用）
- 認証: OAuth（ローカルで実施）

## Monitoring & Dashboard

- Vercel UIで短時間の状態表示（保存しない）。spec-workflowダッシュボードは別系

## Development Environment

- npm workspaces（`packages/*`）
- ESLint/Prettier、ビルドは型エラーゼロ
- テスト: 単体/統合（外部APIはモック）

## Deployment & Distribution

- UI: Vercel
- ローカル: CLI配布（ドキュメントに沿ってセットアップ）

## Technical Requirements & Constraints

- レイテンシ目標: 1–3s
- クライアント直フェッチ禁止
- 秘密/トークンはローカルに限定

## Known Limitations

- Vercel上では長時間処理不可→ローカル常駐必須
