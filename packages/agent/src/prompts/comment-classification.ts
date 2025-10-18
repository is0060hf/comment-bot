import { CommentConfig } from '../config/types';

/**
 * コメント分類のコンテキスト
 */
export interface CommentClassificationContext {
  recentTopics: string[];
  keywords: string[];
  transcript: string;
  lastCommentTime: number;
  viewerEngagement: 'high' | 'medium' | 'low';
  recentComments?: Array<{
    message: string;
    timestamp: number;
  }>;
}

/**
 * コメント分類レベル
 */
export type CommentClassification = 'high' | 'medium' | 'low' | 'none';

/**
 * コメント機会分類プロンプト管理クラス
 */
export class CommentClassificationPrompt {
  private config: CommentConfig;

  constructor(config: CommentConfig) {
    this.config = config;
  }

  /**
   * システムプロンプトを生成
   */
  generateSystemPrompt(): string {
    return `あなたは配信へのコメント機会を判定する分析システムです。

キャラクター設定を考慮:
- ${this.config.characterPersona}
- このキャラクターがコメントしたくなる状況を判断してください

分類カテゴリ:
- high: コメントすべき絶好の機会
  - 配信者が質問している
  - 意見を求めている
  - 視聴者との対話を促している
  - ${this.config.characterPersona}の興味に直結する話題
  
- medium: コメントしても良い機会
  - 話題が転換した
  - 盛り上がりのピーク
  - 共感できる内容
  - 興味深い情報の共有
  
- low: コメント可能だが優先度は低い
  - 通常の会話
  - 一般的な内容
  - 特に反応を求めていない状況
  
- none: コメントすべきでない
  - 最近コメントしたばかり（30秒以内）
  - 不適切なタイミング
  - 類似コメントが多数ある
  - 配信者が集中している

判定時の考慮事項:
- トーン設定: ${this.config.tone}
- コメント間隔の適切性
- 視聴者エンゲージメントレベル
- 話題の新鮮さ`;
  }

  /**
   * ユーザープロンプトをフォーマット
   */
  formatUserPrompt(context: CommentClassificationContext): string {
    const timeSinceLastComment = this.formatTimeSinceLastComment(context.lastCommentTime);
    const recentCommentsSection = this.formatRecentComments(context.recentComments);

    return `現在の配信状況:
話題: ${context.recentTopics.join(', ') || 'なし'}
キーワード: ${context.keywords.join(', ') || 'なし'}
エンゲージメント: ${context.viewerEngagement}

配信者の発言:
「${context.transcript}」

${timeSinceLastComment}
${recentCommentsSection}

${this.formatClassificationRules()}

${this.formatResponseFormat()}`;
  }

  /**
   * 分類ルールをフォーマット
   */
  formatClassificationRules(): string {
    const personaRules = this.getPersonaSpecificRules();
    const toneRules = this.getToneSpecificRules();

    return `分類基準:
${personaRules}
${toneRules}

一般的な判定基準:
- high: 直接的な問いかけ、意見募集、${this.config.characterPersona}の専門分野
- medium: 話題転換、感動的な瞬間、共感できる内容
- low: 日常的な会話、情報提供
- none: 短時間での連投、重複コメント、不適切なタイミング`;
  }

  /**
   * レスポンスフォーマットを指定
   */
  formatResponseFormat(): string {
    return `以下のJSON形式で回答してください:
{
  "classification": "high/medium/low/none",
  "confidence": 0.0-1.0,
  "reasoning": "判定理由を簡潔に説明"
}

例:
{
  "classification": "high",
  "confidence": 0.9,
  "reasoning": "配信者が直接質問をしており、視聴者の意見を求めている"
}`;
  }

  /**
   * 設定を更新
   */
  updateConfig(config: CommentConfig): void {
    this.config = config;
  }

  /**
   * 最後のコメントからの経過時間をフォーマット
   */
  private formatTimeSinceLastComment(lastCommentTime: number): string {
    if (lastCommentTime === 0) {
      return '前回コメント: なし';
    }

    const elapsed = Date.now() - lastCommentTime;
    const seconds = Math.floor(elapsed / 1000);

    if (seconds < 30) {
      return `前回コメント: ${seconds}秒前（短時間での連投に注意）`;
    } else if (seconds < 60) {
      return `前回コメント: ${seconds}秒前`;
    } else {
      const minutes = Math.floor(seconds / 60);
      return `前回コメント: ${minutes}分前`;
    }
  }

  /**
   * 最近のコメントをフォーマット
   */
  private formatRecentComments(
    recentComments?: CommentClassificationContext['recentComments']
  ): string {
    if (!recentComments || recentComments.length === 0) {
      return '';
    }

    const similarityWarning = this.checkForSimilarComments(recentComments);

    return `最近のコメント傾向:
${recentComments
  .slice(0, 3)
  .map((c) => `- ${c.message}`)
  .join('\n')}
${similarityWarning}`;
  }

  /**
   * 類似コメントをチェック
   */
  private checkForSimilarComments(
    recentComments: CommentClassificationContext['recentComments']
  ): string {
    // 簡易的な類似性チェック（実際の実装ではより高度な処理が必要）
    const commonWords = ['すごい', '面白い', 'いいね', '最高'];
    const recentMessages = recentComments?.map((c) => c.message) || [];

    for (const word of commonWords) {
      const count = recentMessages.filter((m) => m.includes(word)).length;
      if (count >= 2) {
        return `\n注意: 「${word}」を含む類似コメントが複数あります。重複を避けてください。`;
      }
    }

    return '';
  }

  /**
   * ペルソナ固有のルールを取得
   */
  private getPersonaSpecificRules(): string {
    const persona = this.config.characterPersona;

    if (persona.includes('初心者')) {
      return `${persona}として:
- 新しい知識や技術の説明時は high
- 基本的な質問への回答募集時は high
- 専門的すぎる話題は low`;
    }

    if (persona.includes('エンジニア') || persona.includes('技術')) {
      return `${persona}として:
- 技術的な話題や問題解決時は high
- プログラミングやシステムの話題は medium以上
- 一般的な雑談は low`;
    }

    if (persona.includes('ファン') || persona.includes('応援')) {
      return `${persona}として:
- 配信者の成功や達成時は high
- 励ましが必要な場面は high
- 定期的な応援メッセージは medium`;
    }

    // デフォルト
    return `${persona}として:
- キャラクターの興味分野は medium以上
- 共感できる内容は medium
- 関心の薄い話題は low`;
  }

  /**
   * トーン固有のルールを取得
   */
  private getToneSpecificRules(): string {
    const toneRules: Record<string, string> = {
      formal: `フォーマルなトーンとして:
- 真面目な議論や質問時は high
- カジュアルすぎる話題は low
- 適切な距離感を保つ`,

      casual: `カジュアルなトーンとして:
- 楽しい話題や冗談は medium以上
- 堅い話題でも気軽にコメント可能
- 親しみやすさを重視`,

      friendly: `フレンドリーなトーンとして:
- 共感や励ましの機会は high
- ポジティブな反応を示せる場面は medium以上
- ネガティブな話題は慎重に`,

      enthusiastic: `熱心なトーンとして:
- 盛り上がりのピークは必ず high
- 感動的な瞬間は high
- テンションの高い反応を優先`,
    };

    const tone = this.config.tone;
    return toneRules[tone] ?? toneRules.friendly!;
  }
}
