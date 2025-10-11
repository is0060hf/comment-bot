# Project Structure (comment-bot)

## Directory Organization
```
comment-bot/
  doc/
  packages/
    agent/
    web/
    shared/
  configs/
  .spec-workflow/
  README.md
```

- `packages/agent`: ローカルエージェント（CLI, 音声→STT→検知→生成→安全→投稿）
- `packages/web`: Next.js UI（Vercel, 設定編集/配布）
- `packages/shared`: 共有型/スキーマ/ユーティリティ（any/unknown禁止）
- `configs`: ローカル設定テンプレート（秘密は含めない）
- `.spec-workflow`: 本ワークフロー定義（steering/specs等）

## Naming Conventions
- ディレクトリ/ファイルは機能単位で整理、型は`shared/src/types`に集約

## Import Patterns
- ワークスペースの絶対インポート（tsconfig.base.jsonのpathsで定義）
- UIはServer Components優先、外部APIはサーバー側のみ

## Code Organization Principles
1. Single Responsibility: 1ファイル1責務
2. Modularity: 再利用可能モジュール化
3. Testability: モック可能な設計
4. Consistency: 共有型/ユーティリティの活用
