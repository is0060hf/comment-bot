Defaults (best practice):
- Rate: minInterval=60s, maxPer10Min=8, cooldown=45s, dedupeWindow=300s.
- Message length: target 20–60 chars; hard cap ~200 chars for YouTube; prefer shortening over splitting; at most 2-way split with cooldown gap.
- Timeouts/retries: generate 2000ms×2, classify 800ms×2, moderation 800ms×2 (exponential backoff).
- Providers: STT Deepgram→GCP→Whisper; LLM OpenAI (gpt-4o-mini); Moderation OpenAI→rule-based.
- Emojis: allow, max 1, allowlist [👏 ✨ 🙏 💡].
- NG words: category seeds + normalization (kana/width/repeat/symbol strip).
