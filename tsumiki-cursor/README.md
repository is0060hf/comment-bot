# Tsumiki for Cursor - AI駆動開発支援フレームワーク

TsumikiのAITDD（AI-assisted Test-Driven
Development）概念をCursor向けにアレンジしたフレームワークです。

## 概要

Cursor環境でTsumikiの開発フローを実現するため、以下の構成で実装します：

1. **Markdownテンプレート群** - 各開発フェーズの文書テンプレート
2. **シェルスクリプト** - 開発フローの自動化
3. **プロンプトテンプレート** - AIへの指示を標準化

## ディレクトリ構造

```
tsumiki-cursor/
├── templates/           # 文書テンプレート
│   ├── requirements/   # 要件定義
│   ├── design/        # 設計文書
│   ├── tasks/         # タスク管理
│   └── tests/         # テスト仕様
├── scripts/           # 自動化スクリプト
├── prompts/          # AIプロンプト集
└── docs/             # プロジェクト文書
```

## .spec-workflow 参照モード

このリポジトリに `.spec-workflow/specs/` が存在する場合、tsumiki-cursor は内部の `docs/`
を生成せず、既存の Spec 文書を参照します。

- 要件: `.spec-workflow/specs/<spec-name>/requirements.md`
- 設計: `.spec-workflow/specs/<spec-name>/design.md`
- タスク: `.spec-workflow/specs/<spec-name>/tasks.md`（チェックボックス形式）
- テスト仕様: `.spec-workflow/specs/<spec-name>/tests/test_spec.md`（必要に応じて作成）

スクリプト `scripts/kairo.sh` / `scripts/tdd.sh` / `scripts/reverse.sh`
は、参照モード時に上記パスを案内します。

## 開発フロー

### 1. Kairo（回路）フロー

```
要件定義 → 設計 → タスク分割 → TDD実装
```

### 2. TDDフロー

```
要件定義 → テストケース作成 → Red → Green → Refactor → 検証
```

注:
v0 では CLI の Red/Green/Refactor/Verify フェーズは廃止しました。以降はプロンプト駆動で実施してください（`.spec-workflow/specs/<spec-name>/tests/`
参照）。

### 3. リバースエンジニアリング

```
既存コード分析 → タスク逆生成 → 設計逆生成 → 仕様逆生成 → 要件逆生成
```

## 使用方法

1. プロジェクトルートで初期化

```bash
./tsumiki-cursor/scripts/init.sh
```

2. 開発フローの選択

- Kairoフロー: `./tsumiki-cursor/scripts/kairo.sh`
- TDDフロー: `./tsumiki-cursor/scripts/tdd.sh`
- リバース: `./tsumiki-cursor/scripts/reverse.sh`

## 特徴

- **Cursor最適化**: Cursorの機能を最大限活用
- **マークダウン中心**: 全ての文書をMarkdownで管理
- **AI支援**: 各フェーズでAIが文書生成を支援
- **品質保証**: TDDによる品質担保
