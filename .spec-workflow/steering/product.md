# Product Overview (comment-bot)

## Product Purpose
YouTube配信の文脈を音声認識で把握し、適切なタイミングで自然な日本語コメントを自動投稿するBot。UIはNext.js（Vercel）、処理はローカルエージェント（macOS, Node.js）。

## Target Users
- 配信者/運営（YouTube Live中心、将来Zoom等へ拡張）
- コメント補助/盛り上げを自動化したい個人/法人

## Key Features
1. 音声取り込み（BlackHole/Loopback）と日本語STT（低遅延）
2. コメント機会検知（ルール＋LLM分類）
3. コメント生成（方針/口調/NG・推奨表現/長さ）
4. 安全フィルタ（モデレーション＋ルール）
5. YouTube Liveチャット投稿（A案: ローカルが直接、レート制御）
6. 設定UI（Next.js, サーバーサイドのみ）と設定配布（Edge Config/KV, 秘密は保存しない）

## Business Objectives
- 配信体験の品質向上（即時性/文脈適合/安全）
- 運用負荷の削減（自動化・テンプレートFallback）
- 将来のマルチプラットフォーム対応

## Success Metrics
- コメント採用率/非スパム率
- レイテンシ1–3s内の達成率
- モデレーションNG率の低減
- 運用停止なしの配信セッション完走率

## Product Principles
1. クライアント直フェッチ禁止（常にサーバーサイド経由）
2. 秘密/トークンはローカルのみ保持（UIに保存しない）
3. ログはエラー時のみ最小限（PIIマスク）
4. 型厳格（`any`/`unknown`禁止）

## Monitoring & Visibility
- ダッシュボード（Vercel UI）: 設定表示・編集（保存はサニタイズ済のみ）
- ローカル: 最小限のメトリクス（保存なし）

## Future Vision
- Zoom等への拡張（投稿アダプタ追加）
- UIの差分プレビュー/アクセシビリティ強化
