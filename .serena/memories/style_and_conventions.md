Language: TypeScript strict（any/unknown禁止）。
Naming: 変数/関数は意味的・記述的。公開APIは型注釈必須。制御フローはガード節優先。try/catchは必要最小限。
UI: Server Components/Actions/Route Handlersのみ。アクセシビリティ（WCAG2.2）。Tailwind/Radix/shadcn。
Policies: APIはサーバーサイドのみ。OAuth/秘密はローカルのみ保持。ログはエラー時のみ最小限（PIIマスク）。
Comment length: 20–60字。Emoji: 許可、最大1、許可リスト（👏✨🙏💡）。NG語は正規化後に検知。