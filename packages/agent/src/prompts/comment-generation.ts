import { CommentConfig } from '../config/types';

/**
 * コメント生成のコンテキスト
 */
export interface CommentGenerationContext {
  recentTopics: string[];
  keywords: string[];
  transcript: string;
  chatHistory: Array<{
    author: string;
    message: string;
    timestamp: number;
  }>;
}

/**
 * コメント生成プロンプト管理クラス
 */
export class CommentGenerationPrompt {
  private config: CommentConfig;

  constructor(config: CommentConfig) {
    this.config = config;
  }

  /**
   * システムプロンプトを生成
   */
  generateSystemPrompt(): string {
    const toneInstructions = this.getToneInstructions();
    const lengthConstraints = this.getLengthConstraints();
    const emojiInstructions = this.getEmojiInstructions();
    const ngWordWarnings = this.getNGWordWarnings();
    const encouragedExpressions = this.getEncouragedExpressions();
    
    return `あなたはYouTube配信へのコメントを投稿する視聴者です。

キャラクター設定:
- ${this.config.characterPersona}

口調・トーン:
${toneInstructions}

コメントの制約:
${lengthConstraints}
${emojiInstructions}
${ngWordWarnings}

${encouragedExpressions}

重要な注意事項:
- 配信者や他の視聴者に対して敬意を持ってコメントしてください
- 自然な日本語で、違和感のないコメントを生成してください
- 配信の内容に関連したコメントを心がけてください
- スパムや宣伝と受け取られるようなコメントは避けてください`;
  }

  /**
   * ユーザープロンプトをフォーマット
   */
  formatUserPrompt(context: CommentGenerationContext): string {
    const topicsSection = context.recentTopics.length > 0
      ? `最近の話題: ${context.recentTopics.join(', ')}`
      : '';
    
    const keywordsSection = context.keywords.length > 0
      ? `キーワード: ${context.keywords.join(', ')}`
      : '';
    
    const recentCommentsSection = this.formatRecentComments(context.chatHistory);
    
    return `現在の配信状況:
${topicsSection}
${keywordsSection}

配信者の発言:
「${context.transcript}」

${recentCommentsSection}

上記の状況を踏まえて、自然なコメントを1つ生成してください。
${this.formatExamples()}`;
  }

  /**
   * コメント例をフォーマット
   */
  formatExamples(): string {
    const examples = this.generateExampleComments();
    
    return `
例:
${examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n')}`;
  }

  /**
   * 設定を更新
   */
  updateConfig(config: CommentConfig): void {
    this.config = config;
  }

  /**
   * トーンに応じた指示を取得
   */
  private getToneInstructions(): string {
    const toneMap: Record<string, string> = {
      formal: `- 丁寧で礼儀正しい口調を使用してください
- です・ます調で統一してください
- 敬語を適切に使用してください`,
      
      casual: `- カジュアルで親しみやすい口調を使用してください
- 友達と話すような自然な言葉遣いにしてください
- だ・である調でも構いません`,
      
      friendly: `- フレンドリーで温かみのある口調を使用してください
- 親しみやすさと適度な丁寧さのバランスを保ってください
- 相手を尊重する姿勢を示してください`,
      
      enthusiastic: `- 熱心で感動的な口調を使用してください
- 興奮や感動を表現する言葉を使ってください
- 「！」を適度に使用して感情を表現してください`
    };
    
    const tone = this.config.tone as keyof typeof toneMap;
    return toneMap[tone] ?? toneMap.friendly!;
  }

  /**
   * 文字数制約を取得
   */
  private getLengthConstraints(): string {
    return `- コメントは${this.config.targetLength.min}文字以上、${this.config.targetLength.max}文字以下にしてください
- 文字数には絵文字も含まれます`;
  }

  /**
   * 絵文字に関する指示を取得
   */
  private getEmojiInstructions(): string {
    if (!this.config.emojiPolicy.enabled) {
      return '- 絵文字は使用しないでください';
    }
    
    return `- 絵文字は${this.config.emojiPolicy.maxCount}個まで使用可能です
- 使用できる絵文字: ${this.config.emojiPolicy.allowedEmojis.join(' ')}
- 絵文字は自然な位置に配置してください`;
  }

  /**
   * NG語の警告を取得
   */
  private getNGWordWarnings(): string {
    if (this.config.ngWords.length === 0) {
      return '';
    }
    
    return `
使用禁止語句（NG語）:
- 以下の言葉や類似表現は絶対に使用しないでください: ${this.config.ngWords.join(', ')}
- これらの言葉を含む表現も避けてください`;
  }

  /**
   * 推奨表現の指示を取得
   */
  private getEncouragedExpressions(): string {
    if (this.config.encouragedExpressions.length === 0) {
      return '';
    }
    
    return `推奨表現:
- 以下の表現を適切に使用することを推奨します: ${this.config.encouragedExpressions.join(', ')}
- ただし、文脈に合わない場合は無理に使用する必要はありません`;
  }

  /**
   * 最近のコメントをフォーマット
   */
  private formatRecentComments(chatHistory: CommentGenerationContext['chatHistory']): string {
    if (chatHistory.length === 0) {
      return '';
    }
    
    const recentComments = chatHistory
      .slice(-5) // 最新5件
      .map(comment => `- ${comment.author}: ${comment.message}`)
      .join('\n');
    
    return `最近のコメント:
${recentComments}`;
  }

  /**
   * 例文を生成
   */
  private generateExampleComments(): string[] {
    const examples: string[] = [];
    
    // キャラクターペルソナとトーンに基づいた例を生成
    if (this.config.characterPersona.includes('初心者')) {
      examples.push(
        'なるほど、そういうことだったんですね！',
        'すごい！初めて知りました',
        '勉強になります！メモしておきます'
      );
    }
    
    if (this.config.tone === 'enthusiastic') {
      examples.push(
        'めちゃくちゃ面白い！最高です！',
        'これは感動しました！！',
        'ワクワクが止まりません！'
      );
    }
    
    // 絵文字を含む例
    if (this.config.emojiPolicy.enabled && this.config.emojiPolicy.allowedEmojis.length > 0) {
      const emoji = this.config.emojiPolicy.allowedEmojis[0];
      examples.push(
        `いいですね${emoji}`,
        `応援してます！${emoji}`
      );
    }
    
    // デフォルトの例
    if (examples.length < 3) {
      examples.push(
        'これは興味深いですね',
        'とても参考になります',
        '次も楽しみにしています'
      );
    }
    
    return examples.slice(0, 5); // 最大5つの例
  }
}
