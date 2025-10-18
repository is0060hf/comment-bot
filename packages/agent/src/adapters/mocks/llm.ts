import {
  LLMPort,
  LLMMessage,
  LLMError,
  CommentGenerationContext,
  CommentGenerationResult,
  CommentOpportunityContext,
  CommentClassificationResult,
  CommentClassification,
  ChatResult,
} from '../../ports/llm';

/**
 * MockLLMアダプタの設定
 */
export interface MockLLMConfig {
  /** 失敗率 (0-1) */
  failureRate?: number;
  /** ヘルスチェックの状態 */
  healthy?: boolean;
  /** デフォルトの信頼度 */
  defaultConfidence?: number;
  /** トークン計算の係数 */
  tokenMultiplier?: number;
}

/**
 * テスト用のLLMモックアダプタ
 */
export class MockLLMAdapter implements LLMPort {
  private readonly config: Required<MockLLMConfig>;

  constructor(config: MockLLMConfig = {}) {
    this.config = {
      failureRate: config.failureRate ?? 0,
      healthy: config.healthy ?? true,
      defaultConfidence: config.defaultConfidence ?? 0.85,
      tokenMultiplier: config.tokenMultiplier ?? 0.3,
    };
  }

  async generateComment(context: CommentGenerationContext): Promise<CommentGenerationResult> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new LLMError('Mock LLM service failure', 'MOCK_LLM_ERROR', true);
    }

    // コンテキストに基づいたコメント生成
    const templates = this.getCommentTemplates(context.policy.characterPersona);
    const template = templates[Math.floor(Math.random() * templates.length)] ?? templates[0];

    // トピックやキーワードを含めたコメント生成
    let comment = template ?? '';
    if (context.keywords.length > 0) {
      const keyword = context.keywords[Math.floor(Math.random() * context.keywords.length)];
      if (keyword) {
        comment = comment.replace('{keyword}', keyword);
      }
    }

    // 推奨表現を使用
    if (context.policy.encouragedExpressions.length > 0) {
      const expression =
        context.policy.encouragedExpressions[
          Math.floor(Math.random() * context.policy.encouragedExpressions.length)
        ];
      if (expression) {
        comment = comment.replace('{expression}', expression);
      }
    }

    // 文字数調整
    comment = this.adjustCommentLength(comment, context.policy.targetLength);

    return {
      comment,
      confidence: this.config.defaultConfidence,
    };
  }

  async classifyCommentOpportunity(
    context: CommentOpportunityContext
  ): Promise<CommentClassificationResult> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new LLMError('Mock LLM classification failure', 'MOCK_LLM_ERROR', true);
    }

    // キーワードベースの簡易分類
    const transcript = context.transcript.toLowerCase();
    let classification: CommentClassification;
    let confidence: number;
    let reason: string;

    if (
      transcript.includes('質問') ||
      transcript.includes('どう思いますか') ||
      transcript.includes('コメント') ||
      transcript.includes('教えてください')
    ) {
      classification = 'necessary';
      confidence = 0.9;
      reason = '視聴者への問いかけを検出';
    } else if (
      transcript.includes('次のスライド') ||
      transcript.includes('移ります') ||
      transcript.includes('準備中')
    ) {
      classification = 'unnecessary';
      confidence = 0.8;
      reason = '移行中のコンテンツ';
    } else if (context.engagementLevel > 0.7) {
      classification = 'necessary';
      confidence = 0.7;
      reason = '高エンゲージメント';
    } else if (context.engagementLevel < 0.3) {
      classification = 'unnecessary';
      confidence = 0.6;
      reason = '低エンゲージメント';
    } else {
      classification = 'hold';
      confidence = 0.5;
      reason = '判断保留';
    }

    return { classification, confidence, reason };
  }

  async chat(messages: LLMMessage[], _options?: Record<string, unknown>): Promise<ChatResult> {
    // 失敗シミュレーション
    if (Math.random() < this.config.failureRate) {
      throw new LLMError('Mock LLM chat failure', 'MOCK_LLM_ERROR', true);
    }

    // 最後のユーザーメッセージに基づいて応答を生成
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user');

    const responseContent = lastUserMessage
      ? `了解しました。「${lastUserMessage.content}」について回答します。これはモック応答です。`
      : 'モックアシスタントの応答です。';

    const promptTokens = messages.reduce(
      (sum, msg) => sum + Math.ceil(msg.content.length * this.config.tokenMultiplier),
      0
    );
    const completionTokens = Math.ceil(responseContent.length * this.config.tokenMultiplier);

    return {
      message: {
        role: 'assistant',
        content: responseContent,
      },
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.config.healthy;
  }

  private getCommentTemplates(persona: string): string[] {
    const templates: Record<string, string[]> = {
      好奇心旺盛な初心者: [
        '{expression}！{keyword}について詳しく知りたいです！',
        '{keyword}って面白そうですね！{expression}',
        '初めて聞きました！{keyword}についてもっと教えてください',
        '{expression}、勉強になります！',
      ],
      エンジニア: [
        '{keyword}の実装について興味深いですね',
        'なるほど、{keyword}のアーキテクチャは{expression}',
        '{keyword}の設計思想が素晴らしいです',
        '技術的に{expression}な実装ですね',
      ],
      default: [
        '{keyword}について{expression}！',
        'とても勉強になります！{expression}',
        '{keyword}の話、興味深いです',
        '{expression}、ありがとうございます！',
      ],
    };

    return templates[persona] ?? templates.default ?? [];
  }

  private adjustCommentLength(comment: string, targetLength: { min: number; max: number }): string {
    // プレースホルダーを除去
    comment = comment.replace(/\{[^}]+\}/g, '');

    if (comment.length < targetLength.min) {
      // 短すぎる場合は定型句を追加
      const suffixes = ['よろしくお願いします！', '楽しみです！', '頑張ってください！'];
      comment += suffixes[Math.floor(Math.random() * suffixes.length)];
    } else if (comment.length > targetLength.max) {
      // 長すぎる場合は切り詰め
      comment = `${comment.substring(0, targetLength.max - 3)  }...`;
    }

    return comment;
  }
}
