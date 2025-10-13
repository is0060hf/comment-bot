import { CommentConfig } from '../config/types';

/**
 * コメント統計情報
 */
export interface CommentStats {
  /** 文字数 */
  length: number;
  /** ポリシーに適合しているか */
  isValid: boolean;
  /** 調整が必要か */
  needsAdjustment: boolean;
  /** 調整タイプ */
  adjustmentType?: 'extend' | 'truncate';
}

/**
 * コメント長ポリシー
 * コメントの文字数を管理し、必要に応じて調整
 */
export class CommentLengthPolicy {
  private config: CommentConfig;

  constructor(config: CommentConfig) {
    this.config = config;
  }

  /**
   * コメントが長さポリシーに適合しているか検証
   */
  validate(comment: string): boolean {
    const length = this.countCharacters(comment);
    return length >= this.config.targetLength.min && 
           length <= this.config.targetLength.max;
  }

  /**
   * 文字数をカウント（絵文字も1文字として扱う）
   */
  countCharacters(text: string): number {
    // シンプルな文字数カウント（日本語の文字も絵文字も1文字）
    return text.length;
  }

  /**
   * コメントを適切な長さに調整
   */
  adjust(comment: string): string {
    const length = this.countCharacters(comment);
    
    if (length >= this.config.targetLength.min && 
        length <= this.config.targetLength.max) {
      return comment;
    }
    
    if (length < this.config.targetLength.min) {
      return this.extendComment(comment);
    }
    
    return this.truncateComment(comment);
  }

  /**
   * 短いコメントを延長
   */
  private extendComment(comment: string): string {
    const currentLength = this.countCharacters(comment);
    const targetLength = this.config.targetLength.min;
    
    // 基本的な拡張パターン
    const extensions = [
      'とても勉強になります！',
      '素晴らしいですね！',
      'ありがとうございます！',
      '参考になります！',
      '楽しみにしています！'
    ];
    
    // コメントに適した拡張を選択
    let extended = comment;
    
    // 句読点で終わっていない場合は追加
    if (!extended.match(/[。！？]$/)) {
      extended += '！';
    }
    
    // まだ短い場合は拡張フレーズを追加
    while (this.countCharacters(extended) < targetLength) {
      const extension = extensions[Math.floor(Math.random() * extensions.length)];
      const testExtended = `${extended}${extension}`;
      
      // 最大長を超えないようにチェック
      if (this.countCharacters(testExtended) <= this.config.targetLength.max) {
        extended = testExtended;
      } else {
        // 代替の短いフレーズを追加
        extended = `${extended}よろしくお願いします。`;
        break;
      }
    }
    
    return extended;
  }

  /**
   * 長いコメントを切り詰める
   */
  private truncateComment(comment: string): string {
    const targetLength = this.config.targetLength.max;
    
    // 文の区切りを探す
    const sentences = this.splitIntoSentences(comment);
    let truncated = '';
    
    for (const sentence of sentences) {
      const testLength = this.countCharacters(truncated + sentence);
      if (testLength <= targetLength) {
        truncated += sentence;
      } else {
        // 最後の文が入らない場合
        if (truncated === '') {
          // 最初の文も長すぎる場合は強制的に切る
          truncated = this.truncateAtLength(sentence, targetLength - 3) + '...';
        }
        break;
      }
    }
    
    // 適切な終端文字を確保
    if (!truncated.match(/[。！？…]$/)) {
      if (this.countCharacters(truncated) <= targetLength - 1) {
        truncated += '！';
      }
    }
    
    return truncated;
  }

  /**
   * テキストを文に分割
   */
  private splitIntoSentences(text: string): string[] {
    // 日本語の文区切り文字で分割
    const sentences = text.split(/([。！？])/);
    const result: string[] = [];
    
    for (let i = 0; i < sentences.length; i += 2) {
      if (sentences[i]) {
        const sentence = sentences[i] + (sentences[i + 1] || '');
        result.push(sentence);
      }
    }
    
    return result.filter(s => s.length > 0);
  }

  /**
   * 指定文字数で切り詰める
   */
  private truncateAtLength(text: string, maxLength: number): string {
    return text.slice(0, maxLength);
  }

  /**
   * コメントをフォーマット（公開API）
   */
  formatComment(comment: string): string {
    return this.adjust(comment);
  }

  /**
   * コメントの統計情報を取得
   */
  getStats(comment: string): CommentStats {
    const length = this.countCharacters(comment);
    const isValid = this.validate(comment);
    
    let adjustmentType: 'extend' | 'truncate' | undefined;
    if (length < this.config.targetLength.min) {
      adjustmentType = 'extend';
    } else if (length > this.config.targetLength.max) {
      adjustmentType = 'truncate';
    }
    
    return {
      length,
      isValid,
      needsAdjustment: !isValid,
      adjustmentType
    };
  }

  /**
   * 設定を更新
   */
  updateConfig(config: CommentConfig): void {
    this.config = config;
  }
}
