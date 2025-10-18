# Requirements Document

## Introduction

配信の音声内容を日本語で常時認識し、文脈に沿った自然な短文コメントを適切なタイミングで自動投稿する。第一段階はYouTube
Liveを対象とし、将来的にZoom等へ拡張可能とする。

## Alignment with Product Vision

- 自動化により配信運用の負荷を下げつつ、視聴体験を向上
- 安全（モデレーション）と低遅延（1–3秒）の両立
- サーバーサイド経由のみのAPI呼び出し（クライアント直フェッチ禁止）

## Requirements

### Requirement 1: プラットフォーム/アカウント

**User Story:**
配信運営として、YouTubeで安全にボット運用するために、専用ボットアカウントで投稿したい。

#### Acceptance Criteria

1. WHEN ボットが投稿を実行 THEN ボット専用アカウントの資格情報が使用される
2. IF アクティブ配信が存在しない THEN 投稿処理は実行されない

### Requirement 2: 音声取り込み/認識

**User Story:**
運営として、配信内容を即時に把握するために、システム音声を取り込み日本語で低遅延認識したい。

#### Acceptance Criteria

1. WHEN BlackHole/Loopbackが有効 THEN 音声を16kHz/monoで取得できる
2. WHEN 認識中 THEN interimとfinalの両方の結果を受領できる
3. IF ネットワーク断 THEN 再接続が自動で試行される

### Requirement 3: コメント機会検知

**User Story:** 視聴体験を向上させるため、コメントが求められている局面のみ投下したい。

#### Acceptance Criteria

1. WHEN 呼びかけ/質問/話題転換/デモ検知 THEN スコアリングし閾値超で候補化
2. WHEN 候補化 THEN クールダウン/重複抑止/最大件数制限が適用される
3. WHEN 分類実行 THEN 必要/不要/保留のいずれかを返す

### Requirement 4: コメント生成

**User Story:** 運営方針に沿って、口調・NG/推奨表現・長さ制約を守った短文を生成したい。

#### Acceptance Criteria

1. WHEN 生成 THEN 設定の口調/方針/長さを満たす
2. IF 生成失敗 OR 安全部門でNG THEN テンプレートにフォールバック

### Requirement 5: 安全フィルタ

**User Story:** 不適切な表現やPIIが含まれる投稿を未然に防ぎたい。

#### Acceptance Criteria

1. WHEN 生成文にNGが含まれる THEN 投稿は阻止される（または修正）
2. WHEN PII検出 THEN 伏字または抑止が適用される

### Requirement 6: 投稿（A案）

**User Story:** レイテンシと安定性を重視し、ローカルから直接YouTubeに投稿したい。

#### Acceptance Criteria

1. WHEN 投稿 THEN `liveChatMessages.insert`がローカルから実行される
2. IF 429/5xx THEN 指数バックオフで再試行（上限あり）

### Requirement 7: 設定/運用

**User Story:** UIで編集した設定を安全に配布し、ローカルに反映したい。

#### Acceptance Criteria

1. WHEN UI保存 THEN サニタイズ済設定のみがEdge Config/KVへ保存される
2. WHEN ローカル起動/同期 THEN YAMLにマージ反映される（秘密はローカルのみ）
3. WHEN CLI操作 THEN start/pause/resume/safety/stopが動作する

### Requirement 8: 非機能

**User Story:** 低遅延・安全・型安全で運用したい。

#### Acceptance Criteria

1. WHEN 通常運用 THEN E2E遅延は概ね1–3秒
2. WHEN ログ出力 THEN エラー時のみ最小限でPIIはマスク
3. WHEN ビルド THEN TS strictで型エラーゼロ（`any`/`unknown`禁止）

## Non-Functional Requirements

- セキュリティ: クライアント直フェッチ禁止、最小権限、秘密はローカルのみ
- 可用性: バックオフ/フォールバック/代替プロバイダ

## Operational Defaults（Best Practice 提案）

- レート制御初期値
  - `minIntervalSeconds`: 60
  - `maxPer10Min`: 8
  - `cooldownSeconds`: 45
  - `dedupeWindowSec`: 300
- YouTube Live Chat 文字数上限: 200字を上限として運用
  - 200字超は短縮（要約）を優先、やむを得ず分割する場合は最大2分割・間隔>= `cooldownSeconds`
- コメント長ポリシー: 20–60字（UI可変: 下限10–30/上限40–120 の範囲）
- LLM/分類/モデレーションのタイムアウト/リトライ
  - 生成: timeout 2000ms / retry 2（指数 250→500ms）
  - 分類: timeout 800ms / retry 2
  - モデレーション: timeout 800ms / retry 2
- STT優先/モデル（初期案・要実機検証）
  - Deepgram: "nova"（ja）→ GCP: "latest-ja-conversational" → Whisper API
- LLM優先: OpenAI（例: gpt-4o-mini）
- モデレーション優先: OpenAI Moderation → ルールベース

## Testing Strategy（要求水準）

- ユニット: 機会検知/生成/安全フィルタ/投稿の個別検証
- 統合: STT→検知→生成→安全→投稿の流れ（外部APIはモック）
- 受け入れ: Acceptance Criteriaの全充足
