# Comment Bot for Live Streams

YouTubeライブ配信向けの自動コメント投稿ボット。音声認識とAIを活用して、配信内容に応じた適切なコメントを自動生成・投稿します。

## 🌟 機能

- **リアルタイム音声認識**: 配信音声をリアルタイムで文字起こし
- **文脈理解型コメント生成**: AIが配信内容を理解し、適切なタイミングでコメントを生成
- **安全性フィルタリング**: 不適切な内容の自動検出・除外
- **カスタマイズ可能**: トーン、ペルソナ、NGワードなどを柔軟に設定
- **Web UI**: 設定管理や動作状況の確認が可能

## 📋 要件

- macOS (Apple Silicon/Intel)
- Node.js 18以上
- YouTube Data API v3のクレデンシャル
- OpenAI APIキー
- 仮想オーディオデバイス（BlackHole 2ch または Loopback）

## 🚀 クイックスタート

### 1. リポジトリのクローン

```bash
git clone https://github.com/your-username/comment-bot.git
cd comment-bot
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.local`ファイルを作成し、必要なAPIキーを設定：

```bash
cp .env.example .env.local
```

```env
# OpenAI
OPENAI_API_KEY=your-openai-api-key

# YouTube
YOUTUBE_CLIENT_ID=your-client-id
YOUTUBE_CLIENT_SECRET=your-client-secret

# Vercel (Web UIをデプロイする場合)
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-org-id
VERCEL_PROJECT_ID=your-project-id
```

### 4. YouTube認証の設定

```bash
npm run auth:youtube
```

ブラウザが開くので、YouTubeアカウントでログインして認証を完了してください。

### 5. 設定ファイルの作成

```bash
cp config/default.yaml config/local.yaml
```

`config/local.yaml`を編集して、お好みの設定に変更してください。

### 6. エージェントの起動

```bash
npm run start:agent
```

### 7. Web UIの起動（オプション）

```bash
npm run start:web
```

ブラウザで http://localhost:3000 にアクセスしてください。

## 🏗️ アーキテクチャ

```
comment-bot/
├── packages/
│   ├── agent/          # ローカルエージェント（音声処理、コメント生成）
│   ├── web/            # Web UI（Next.js）
│   └── shared/         # 共有型定義・ユーティリティ
├── config/             # 設定ファイル
├── doc/                # 設計書・仕様書
└── .spec-workflow/     # Tsumiki開発仕様
```

## 🛠️ 開発

このプロジェクトはTsumiki方式（AI-Assisted Test-Driven Development）で開発されています。

### 開発フロー

1. **仕様定義** (.spec-workflow/specs/)
2. **Red Phase**: 失敗するテストの作成
3. **Green Phase**: テストをパスする最小限の実装
4. **Refactor Phase**: コードの改善
5. **Verify Phase**: 品質確認

### テストの実行

```bash
# 全体のテスト
npm test

# エージェントのテスト
npm run test:agent

# Web UIのテスト
npm run test:web

# カバレッジレポート
npm run test:coverage
```

### ビルド

```bash
# 全体のビルド
npm run build

# エージェントのビルド
npm run build:agent

# Web UIのビルド
npm run build:web
```

## 📖 詳細ドキュメント

- [アーキテクチャ仕様書](doc/アーキテクチャ仕様書.md)
- [基本設計書](doc/基本設計書.md)
- [仮想オーディオ設定ガイド](doc/AUDIO_SETUP.md)
- [AITDD開発ガイド](doc/AITDD_GUIDE.md)
- [開発フロー](doc/DEVELOPMENT_FLOW.md)
- [Vercelセットアップガイド](VERCEL_SETUP.md)

## 🤝 コントリビューション

プルリクエストを歓迎します！以下のガイドラインに従ってください：

1. Issueで提案を議論
2. フィーチャーブランチを作成
3. Tsumiki方式でテストと実装を作成
4. すべてのテストがパスすることを確認
5. プルリクエストを作成

## 📄 ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## 🙏 謝辞

このプロジェクトは以下のオープンソースプロジェクトを利用しています：

- [Next.js](https://nextjs.org/)
- [OpenAI API](https://openai.com/)
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [Deepgram](https://deepgram.com/)

---

問題や質問がある場合は、[Issues](https://github.com/your-username/comment-bot/issues)でお知らせください。