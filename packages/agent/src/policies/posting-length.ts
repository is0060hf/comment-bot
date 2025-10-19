/**
 * YouTube投稿文字数ポリシー
 * YouTubeのコメント文字数制限（200文字）を処理
 */

import { Logger } from '../logging/logger';

export interface ValidationResult {
  isValid: boolean;
  length: number;
  exceedsLimit: boolean;
  excessCharacters?: number;
}

export interface TruncateResult {
  text: string;
  truncated: boolean;
  originalLength: number;
  removedUrls?: boolean;
}

export interface SplitResult {
  parts: string[];
  wasSplit: boolean;
  originalLength: number;
}

export interface TruncateOptions {
  preservePunctuation?: boolean;
  removeUrls?: boolean;
  ellipsis?: string;
}

export interface PostingStatistics {
  totalProcessed: number;
  truncatedCount: number;
  splitCount: number;
  averageLength: number;
  maxLength: number;
}

export class PostingLengthPolicy {
  private static readonly YOUTUBE_LIMIT = 200;
  private static readonly ELLIPSIS = '...';
  private static readonly CONTINUATION_MARKER = '(続く)';
  private static readonly URL_PATTERN = /https?:\/\/[^\s]+/g;
  
  private statistics = {
    totalProcessed: 0,
    truncatedCount: 0,
    splitCount: 0,
    totalLength: 0,
    maxLength: 0
  };

  constructor(private readonly logger: Logger) {
    this.logger.debug('PostingLengthPolicy initialized');
  }

  /**
   * コメントの文字数を検証
   */
  validate(comment: string): ValidationResult {
    const length = this.calculateLength(comment);
    const exceedsLimit = length > PostingLengthPolicy.YOUTUBE_LIMIT;
    
    this.updateStatistics(length);
    
    return {
      isValid: !exceedsLimit,
      length,
      exceedsLimit,
      excessCharacters: exceedsLimit ? length - PostingLengthPolicy.YOUTUBE_LIMIT : undefined
    };
  }

  /**
   * 長いコメントを適切に切り詰める
   */
  truncate(comment: string, options: TruncateOptions = {}): TruncateResult {
    const validation = this.validate(comment);
    
    if (validation.isValid) {
      return {
        text: comment,
        truncated: false,
        originalLength: validation.length
      };
    }

    this.statistics.truncatedCount++;
    
    const {
      preservePunctuation = false,
      removeUrls = true,
      ellipsis = PostingLengthPolicy.ELLIPSIS
    } = options;

    let processedComment = comment;
    let removedUrls = false;

    // URLを削除してスペースを節約
    if (removeUrls && PostingLengthPolicy.URL_PATTERN.test(comment)) {
      processedComment = processedComment.replace(PostingLengthPolicy.URL_PATTERN, '');
      removedUrls = true;
      
      // URL削除後に制限内に収まるか確認
      if (this.calculateLength(processedComment + ellipsis) <= PostingLengthPolicy.YOUTUBE_LIMIT) {
        return {
          text: processedComment.trim() + ellipsis,
          truncated: true,
          originalLength: validation.length,
          removedUrls
        };
      }
    }

    // 文字数制限に合わせて切り詰め
    const maxLength = PostingLengthPolicy.YOUTUBE_LIMIT - this.calculateLength(ellipsis);
    let truncatedText = this.intelligentTruncate(processedComment, maxLength, preservePunctuation);
    
    // 句読点を保持する場合で、句読点で終わっていたら...を句読点の後に
    if (preservePunctuation && truncatedText.match(/[！？。]$/)) {
      return {
        text: truncatedText + ellipsis,
        truncated: true,
        originalLength: validation.length,
        removedUrls
      };
    }
    
    return {
      text: truncatedText + ellipsis,
      truncated: true,
      originalLength: validation.length,
      removedUrls
    };
  }

  /**
   * 長いコメントを複数のパートに分割
   */
  split(comment: string): SplitResult {
    const validation = this.validate(comment);
    
    if (validation.isValid) {
      return {
        parts: [comment],
        wasSplit: false,
        originalLength: validation.length
      };
    }

    this.statistics.splitCount++;
    
    const parts: string[] = [];
    const maxPartLength = PostingLengthPolicy.YOUTUBE_LIMIT - 20; // マーカー用のスペース
    
    // 文章を適切な位置で分割
    const sentences = this.splitIntoSentences(comment);
    let currentPart = '';
    
    for (const sentence of sentences) {
      if (this.calculateLength(currentPart + sentence) > maxPartLength) {
        if (currentPart) {
          parts.push(currentPart.trim());
          currentPart = sentence;
        } else {
          // 1文が長すぎる場合は強制分割
          const forceSplit = this.forceSplitLongText(sentence, maxPartLength);
          parts.push(...forceSplit);
          currentPart = '';
        }
      } else {
        currentPart += sentence;
      }
    }
    
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }
    
    // パート番号を追加
    const totalParts = parts.length;
    const numberedParts = parts.map((part, index) => {
      const partNumber = `(${index + 1}/${totalParts})`;
      const continuation = index < totalParts - 1 ? ' ' + PostingLengthPolicy.CONTINUATION_MARKER : '';
      
      // パート番号と継続マーカーの長さを計算
      const prefixLength = this.calculateLength(partNumber + ' ');
      const suffixLength = this.calculateLength(continuation);
      const availableLength = PostingLengthPolicy.YOUTUBE_LIMIT - prefixLength - suffixLength;
      
      // パートの内容を調整
      const adjustedPart = this.calculateLength(part) > availableLength
        ? this.intelligentTruncate(part, availableLength, false)
        : part;
      
      const result = partNumber + ' ' + adjustedPart + continuation;
      
      // 最終確認：200文字を超えていたら再調整
      if (this.calculateLength(result) > PostingLengthPolicy.YOUTUBE_LIMIT) {
        const finalAvailable = PostingLengthPolicy.YOUTUBE_LIMIT - prefixLength - suffixLength - 3; // ...の分
        const finalAdjusted = this.intelligentTruncate(part, finalAvailable, false);
        return partNumber + ' ' + finalAdjusted + '...' + continuation;
      }
      
      return result;
    });
    
    return {
      parts: numberedParts,
      wasSplit: true,
      originalLength: validation.length
    };
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): PostingStatistics {
    return {
      totalProcessed: this.statistics.totalProcessed,
      truncatedCount: this.statistics.truncatedCount,
      splitCount: this.statistics.splitCount,
      averageLength: this.statistics.totalProcessed > 0 
        ? Math.round(this.statistics.totalLength / this.statistics.totalProcessed)
        : 0,
      maxLength: this.statistics.maxLength
    };
  }

  /**
   * 文字数を正確に計算（絵文字対応）
   */
  private calculateLength(text: string): number {
    // YouTubeは文字数ベースでカウント（絵文字は2文字として扱われる）
    // Array.fromは絵文字を1つの要素として扱うが、YouTubeは絵文字を2文字としてカウント
    let length = 0;
    const chars = Array.from(text);
    for (const char of chars) {
      // 絵文字かどうかを判定（簡易的な判定）
      const codePoint = char.codePointAt(0) || 0;
      if (codePoint > 0xFFFF) {
        // サロゲートペアまたは絵文字
        length += 2;
      } else {
        length += 1;
      }
    }
    return length;
  }

  /**
   * インテリジェントな切り詰め（単語・文の境界を考慮）
   */
  private intelligentTruncate(text: string, maxLength: number, preservePunctuation: boolean): string {
    if (this.calculateLength(text) <= maxLength) {
      return text;
    }

    // 文字配列として扱う（絵文字対応）
    const chars = Array.from(text);
    let currentLength = 0;
    let cutIndex = 0;
    
    // maxLengthに収まる最大のインデックスを見つける
    for (let i = 0; i < chars.length; i++) {
      const charLength = this.calculateLength(chars[i]!);
      if (currentLength + charLength > maxLength) {
        break;
      }
      currentLength += charLength;
      cutIndex = i + 1;
    }
    
    let truncated = chars.slice(0, cutIndex).join('');
    
    // 句読点を保持する場合
    if (preservePunctuation) {
      // 重要な句読点で終わるように調整
      const importantPunctuations = ['！', '？', '。'];
      let bestPunctIndex = -1;
      
      // 最も後ろにある句読点を探す
      for (const punct of importantPunctuations) {
        const lastIndex = truncated.lastIndexOf(punct);
        if (lastIndex > bestPunctIndex) {
          bestPunctIndex = lastIndex;
        }
      }
      
      // 句読点が見つかり、かつ適切な位置にある場合
      // 短いコメントでも句読点を保持できるよう、最小5文字以降の句読点は保持
      if (bestPunctIndex >= 5) {
        return truncated.substring(0, bestPunctIndex + 1);
      }
    }
    
    // 単語の境界で切る（句読点を避ける）
    const lastSpace = truncated.lastIndexOf(' ');
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('、'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？')
    );
    
    // 句読点の直前で切らないようにする
    if (lastPunctuation === truncated.length - 1) {
      truncated = truncated.substring(0, lastPunctuation);
    } else if (lastSpace > truncated.length * 0.7 && lastSpace > lastPunctuation) {
      truncated = truncated.substring(0, lastSpace);
    } else if (lastPunctuation > truncated.length * 0.7) {
      truncated = truncated.substring(0, lastPunctuation);
    }
    
    return truncated.trim();
  }

  /**
   * 文章を文単位で分割
   */
  private splitIntoSentences(text: string): string[] {
    // 日本語と英語の文末記号で分割
    const sentences = text.split(/(?<=[。！？.!?])\s*/);
    return sentences.filter(s => s.length > 0);
  }

  /**
   * 長すぎるテキストを強制的に分割
   */
  private forceSplitLongText(text: string, maxLength: number): string[] {
    const parts: string[] = [];
    const chars = Array.from(text);
    
    for (let i = 0; i < chars.length; i += maxLength) {
      parts.push(chars.slice(i, i + maxLength).join(''));
    }
    
    return parts;
  }

  /**
   * 統計情報を更新
   */
  private updateStatistics(length: number): void {
    this.statistics.totalProcessed++;
    this.statistics.totalLength += length;
    this.statistics.maxLength = Math.max(this.statistics.maxLength, length);
  }
}
