# comment-bot

YouTube向けコメントBot（日本語）。UIはNext.js＋Vercel、処理はローカルエージェント（Node.js/TypeScript, macOS）。A案: ローカルがYouTubeへ直接投稿（トークンはローカルのみ保持）。

- 言語: 日本語のみ
- API呼び出し: すべてサーバーサイド（UIはRoute Handlers/Server Actions、ローカルはCLI）。クライアント直フェッチ禁止
- ログ: 原則保存しない（エラー時のみ最小限/PIIマスク）

---

## 想定ディレクトリ構成（モノレポ）
```text
comment-bot/
  README.md
  doc/                             # 要件定義/設計ドキュメント
    要件定義書.md
    基本設計書.md
    アーキテクチャ仕様書.md
    テーブル設計書.md
    画面定義書.md

  packages/
    agent/                         # ローカルエージェント（CLI, Node.js/TypeScript）
      bin/
        comment-bot                # 実行エントリ（CLIラッパ）
      src/
        audio/                     # 音声取得（BlackHole/Loopback）
        stt/                       # ストリーミング音声認識（GCP/Azure/Deepgram/Whisperアダプタ）
        context/                   # 要約/話題/固有名詞のスライディングウィンドウ
        trigger/                   # コメント機会検知（ルール＋LLM分類）
        llm/                       # コメント生成（LLM）
        safety/                    # モデレーション/ルール
        platform/
          youtube/                 # YouTube投稿アダプタ（OAuth/レート制御）
        scheduler/                 # クールダウン/重複抑止
        config/                    # 設定読み込み/バリデーション/同期
        cli/                       # CLIコマンド（start/pause/resume/safety/stop）
      package.json
      tsconfig.json
      .env.example                 # ローカル用（API鍵等は開発者環境にのみ）

    web/                           # Next.js（Vercelホスティング, App Router）
      app/
        dashboard/                 # 稼働状況（短期表示）
          page.tsx
        settings/                  # 設定編集（秘密は扱わない）
          page.tsx
        safety/                    # 安全レベル切替/NG・推奨表現
          page.tsx
        api/
          config/route.ts          # 設定配布用API（Edge Config/KV連携, サーバー側のみ）
      components/                  # UIコンポーネント（WCAG 2.2準拠）
      lib/                         # サーバーサイドユーティリティ
      package.json
      next.config.js
      .env.example                 # UI用（秘密は保存しない）

    shared/                        # 共有型/スキーマ/ユーティリティ
      src/
        types/                     # AppConfig/TranscriptSegment/... 型定義（any/unknown禁止）
        validation/                # 設定スキーマ（例: zod）
      package.json
      tsconfig.json

  configs/
    config.example.yaml            # ローカルエージェントの設定テンプレート

  package.json                     # npm workspaces（packages/*）
  tsconfig.base.json               # 共有TS設定
  .eslintrc.cjs
  .prettierrc
  .gitignore
```

---

## 各ディレクトリの役割
- `doc/`: 要件定義/基本設計/アーキテクチャ/テーブル/画面の各設計資料
- `packages/agent/`: ローカル常駐のメイン処理（音声→STT→検知→生成→安全→投稿）。A案によりYouTubeへ直接投稿。OAuthトークンはローカルのみ保持
- `packages/web/`: Next.js UI（Vercel）。設定の編集/配布のみを担い、外部APIはサーバーサイド経由。長時間処理は行わない
- `packages/shared/`: 両者で共有する厳格型・バリデーションスキーマ・共通ユーティリティ
- `configs/`: ローカルエージェントの設定テンプレート（本番用秘密は置かない）

---

## 実装原則（重要）
- クライアントからの外部API直フェッチは禁止。UIは必ずServer Actions/Route Handlers経由
- OAuth/トークン/秘密はローカルのみで保持（Vercel側に保存しない）
- ログはエラー時のみ最小限保存（PIIマスク）。通常は保存しない
- TypeScriptはstrict。`any`/`unknown`禁止。共有型は`packages/shared`に集約
- 停止時はローカルで起動したWebサーバー（OAuthコールバック）を必ずkill

---

## 参考：処理パイプライン（A案）
```text
[audio] → [stt] → [context] → [trigger] → [llm] → [safety] → [youtube(post)]
                                                   ↑
                                              [scheduler]
```

---

## 補足
- Vercel：UIのホスティングと設定配布のみを担当（Edge Config/KV）。STT/投稿などの長時間処理はローカルエージェントのみで実行
- Zoom等への将来拡張：`packages/agent/platform/zoom/`等を追加して同パイプラインを流用可能

---

## Web UIスタック（Next.js, Vercel）
- Tailwind CSS（スタイル）
- Radix UI（A11yプリミティブ）
- shadcn/ui（コンポーネント）
- react-hook-form + zod（型安全フォーム）
- lucide-react（アイコン）
- next-themes（任意, ダークモード）、clsx/tailwind-merge（クラス合成）

原則: 外部APIはサーバーサイドのみ（Route Handlers/Server Actions）。クライアント直フェッチは禁止。

---

## Spec Workflow MCP（設計ワークフロー）
- ローカルでの起動/ダッシュボード利用手順は `.spec-workflow/README.md` を参照
- 参考リポジトリ: [`Pimzino/spec-workflow-mcp`](https://github.com/Pimzino/spec-workflow-mcp)

