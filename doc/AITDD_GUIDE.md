# AI-Assisted Test-Driven Development (AITDD) ガイド

## 概要

AITDD（AI-Assisted Test-Driven Development）は、従来のTDDにAIアシスタントを組み合わせた開発手法です。このプロジェクトではTsumiki方式と呼ばれる具体的な実装パターンを採用しています。

## Tsumiki方式の4つのフェーズ

### 🔴 Red Phase（赤）

**目的**: 失敗するテストを作成し、要件を明確にする

```typescript
// 例: packages/agent/tests/policies/comment-length.test.ts

describe('CommentLengthPolicy', () => {
  it('should validate comment length', () => {
    const policy = new CommentLengthPolicy({ min: 10, max: 100 });
    
    // まだ実装されていないメソッドをテスト
    expect(policy.validate('短い')).toBe(false);
    expect(policy.validate('ちょうど良い長さのコメント')).toBe(true);
    expect(policy.validate('非常に長い...')).toBe(false);
  });
});
```

**ポイント**:
- 実装前にテストを書く
- インターフェースと期待する動作を定義
- テストは必ず失敗する（実装がないため）

### 🟢 Green Phase（緑）

**目的**: テストをパスする最小限の実装を作成

```typescript
// 例: packages/agent/src/policies/comment-length.ts

export class CommentLengthPolicy {
  constructor(private config: { min: number; max: number }) {}

  validate(comment: string): boolean {
    const length = comment.length;
    return length >= this.config.min && length <= this.config.max;
  }
}
```

**ポイント**:
- テストをパスすることだけに集中
- 過度な最適化は避ける
- シンプルで直接的な実装

### 🔵 Refactor Phase（青）

**目的**: コードの品質を向上させる

```typescript
// リファクタリング後
export class CommentLengthPolicy {
  private readonly minLength: number;
  private readonly maxLength: number;

  constructor(config: CommentLengthConfig) {
    this.validateConfig(config);
    this.minLength = config.min;
    this.maxLength = config.max;
  }

  validate(comment: string): ValidationResult {
    const length = this.calculateLength(comment);
    
    if (length < this.minLength) {
      return { valid: false, reason: 'too_short' };
    }
    
    if (length > this.maxLength) {
      return { valid: false, reason: 'too_long' };
    }
    
    return { valid: true };
  }

  private calculateLength(text: string): number {
    // 絵文字を考慮した文字数計算
    return Array.from(text).length;
  }

  private validateConfig(config: CommentLengthConfig): void {
    if (config.min < 0 || config.max < config.min) {
      throw new Error('Invalid configuration');
    }
  }
}
```

**ポイント**:
- 可読性の向上
- エラーハンドリングの追加
- パフォーマンスの最適化
- テストは常にパスし続ける

### ✅ Verify Phase（検証）

**目的**: 品質を確認し、完了を宣言

```bash
# テストの実行
npm test -- --coverage

# 型チェック
npm run type-check

# リンターの実行
npm run lint

# 統合テスト
npm run test:e2e
```

**チェックリスト**:
- [ ] すべてのテストがパス
- [ ] カバレッジが十分（80%以上）
- [ ] 型エラーがない
- [ ] リンターエラーがない
- [ ] ドキュメントが更新されている

## spec-workflowとの連携

### 仕様の管理

```
.spec-workflow/
├── specs/
│   └── comment-bot/
│       ├── requirements.md    # 要件定義
│       ├── design.md          # 設計
│       └── tasks.md           # タスク管理
└── config.toml               # 設定
```

### ワークフロー

1. **仕様作成**
   ```bash
   # spec-workflow MCPサーバーの起動
   npx @pimzino/spec-workflow-mcp@latest . --AutoStartDashboard
   ```

2. **タスクの選択**
   - ダッシュボードでタスクを確認
   - 優先度の高いタスクから選択

3. **Tsumiki実行**
   - Red → Green → Refactor → Verify
   - 各フェーズで仕様を参照

4. **完了報告**
   - タスクのステータスを更新
   - 実装内容をドキュメント化

## ベストプラクティス

### 1. 小さなステップで進める

```typescript
// ❌ 悪い例: 大きすぎるテスト
it('should handle all comment operations', () => {
  // 複数の機能を一度にテスト
});

// ✅ 良い例: 焦点を絞ったテスト
it('should truncate long comments', () => {
  // 1つの機能に集中
});

it('should preserve important punctuation', () => {
  // 別の機能は別のテストで
});
```

### 2. 明確な名前付け

```typescript
// ❌ 悪い例
const p = new Policy(c);
const r = p.check(t);

// ✅ 良い例
const lengthPolicy = new CommentLengthPolicy(config);
const validationResult = lengthPolicy.validate(userComment);
```

### 3. エッジケースの考慮

```typescript
describe('edge cases', () => {
  it('should handle empty strings', () => {
    expect(policy.validate('')).toBe(false);
  });

  it('should handle emoji correctly', () => {
    expect(policy.validate('👍')).toBe(true);
  });

  it('should handle special characters', () => {
    expect(policy.validate('Hello\n\nWorld')).toBe(true);
  });
});
```

### 4. モックの適切な使用

```typescript
// 外部依存のモック
jest.mock('../../src/adapters/openai-llm', () => ({
  OpenAILLMAdapter: jest.fn().mockImplementation(() => ({
    generateComment: jest.fn().mockResolvedValue({
      content: 'モックされたコメント',
      confidence: 0.9
    })
  }))
}));
```

## トラブルシューティング

### テストが失敗する場合

1. **エラーメッセージを読む**
   ```bash
   Expected: "too_short"
   Received: "too short"
   ```

2. **デバッグ情報を追加**
   ```typescript
   console.log('Input:', comment);
   console.log('Length:', comment.length);
   console.log('Result:', result);
   ```

3. **単体でテストを実行**
   ```bash
   npm test -- --testNamePattern="should validate comment length"
   ```

### 型エラーが発生する場合

1. **型定義を確認**
   ```typescript
   // tsconfig.jsonの設定を確認
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true
     }
   }
   ```

2. **インポートパスを確認**
   ```typescript
   // 相対パスではなくエイリアスを使用
   import { Policy } from '@comment-bot/shared';
   ```

## AIアシスタントとの協働

### 効果的なプロンプト

```
「CommentLengthPolicyのテストをTsumiki方式で実装してください。
要件：
- 最小10文字、最大100文字
- 絵文字は2文字としてカウント
- URLは短縮表示」
```

### レビューの依頼

```
「実装したCommentSchedulerのコードレビューをお願いします。
特に以下の点を確認してください：
- エラーハンドリング
- 並行処理の安全性
- テストカバレッジ」
```

## まとめ

AITDD/Tsumiki方式は、品質の高いコードを効率的に開発するための手法です。AIアシスタントと協力しながら、以下のサイクルを回すことで、保守性の高いシステムを構築できます：

1. 🔴 要件を明確にする（Red）
2. 🟢 動くものを作る（Green）
3. 🔵 品質を高める（Refactor）
4. ✅ 完成を確認する（Verify）

このガイドを参考に、効果的な開発を進めてください！
