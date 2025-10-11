Project: comment-bot
Purpose: YouTube Live向け日本語コメントBot。配信音声をSTTで理解し、方針/口調/頻度に基づき「必要時のみ」短文コメントを自動投稿。UIはNext.js（Vercel）、実処理はローカルエージェント（macOS, Node.js/TS, A案）。
Tech stack: TypeScript strict、Node.js（エージェント）、Next.js App Router（UI）、Tailwind/Radix/shadcn、LLM（OpenAI優先）、STT（Deepgram→GCP→Whisper）、モデレーション（OpenAI Moderation、ルールベースfallback）、YouTube Data API v3（server-side）。
Structure: モノレポ。packages/{agent,web,shared}、configs、.spec-workflow（specs/steering）、doc（要件/設計）。
Key policies: クライアント直フェッチ禁止、秘密/トークンはローカルのみ、ログはエラー時のみ最小限（PIIマスク）、コメント長20–60字、絵文字は最大1（許可リスト）。
