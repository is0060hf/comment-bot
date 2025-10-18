import { CommentConfig } from '../config/types';

/**
 * 絵文字検証結果
 */
export interface EmojiValidationResult {
  /** 検証結果 */
  isValid: boolean;
  /** 検出された絵文字の数 */
  emojiCount: number;
  /** 検出された絵文字のリスト */
  detectedEmojis: string[];
  /** 違反内容 */
  violations?: Array<'too_many' | 'not_allowed'>;
}

/**
 * 最近のコメント情報
 */
export interface RecentComment {
  text: string;
  timestamp: number;
}

/**
 * 絵文字ポリシー
 * 絵文字の使用制限と類似抑止を管理
 */
export class EmojiPolicy {
  private config: CommentConfig;

  // 絵文字を検出する正規表現
  // 参考: https://unicode.org/reports/tr51/#emoji_data
  // private readonly emojiRegex = /[\u{1F300}-\u{1F5FF}...]/gu;

  constructor(config: CommentConfig) {
    this.config = config;
  }

  /**
   * コメントの絵文字を検証
   */
  validate(comment: string): EmojiValidationResult {
    const detectedEmojis = this.extractEmojis(comment);
    const emojiCount = detectedEmojis.length;
    const violations: Array<'too_many' | 'not_allowed'> = [];

    // ポリシーが無効の場合は常に有効
    if (!this.config.emojiPolicy.enabled) {
      return {
        isValid: true,
        emojiCount,
        detectedEmojis,
      };
    }

    // 絵文字数のチェック
    if (emojiCount > this.config.emojiPolicy.maxCount) {
      violations.push('too_many');
    }

    // 許可リストのチェック
    // 許可リストが空の場合も、絵文字があれば許可されていないとみなす
    const allowedEmojis = new Set(this.config.emojiPolicy.allowedEmojis);
    if (this.config.emojiPolicy.allowedEmojis.length === 0) {
      // 許可リストが空の場合、すべての絵文字が許可されていない
      if (detectedEmojis.length > 0) {
        violations.push('not_allowed');
      }
    } else {
      // 許可リストがある場合、リスト外の絵文字をチェック
      const hasDisallowedEmoji = detectedEmojis.some((emoji) => !allowedEmojis.has(emoji));
      if (hasDisallowedEmoji) {
        violations.push('not_allowed');
      }
    }

    return {
      isValid: violations.length === 0,
      emojiCount,
      detectedEmojis,
      violations: violations.length > 0 ? violations : undefined,
    };
  }

  /**
   * テキストから絵文字を抽出
   */
  extractEmojis(text: string): string[] {
    // 絵文字を含むセグメントを抽出
    const emojiPattern =
      /(?:\p{RI}\p{RI}|\p{Emoji}(?:\p{EMod}|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007F}]+\u{E007F})?(?:\u{200D}\p{Emoji}(?:\p{EMod}|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007F}]+\u{E007F})?)*)/gu;

    const matches = text.match(emojiPattern);
    if (!matches) return [];

    // 重複を除去
    return [...new Set(matches)];
  }

  /**
   * 絵文字をサニタイズ（過剰な絵文字を除去）
   */
  sanitize(comment: string): string {
    if (!this.config.emojiPolicy.enabled) {
      return comment;
    }

    const detectedEmojis = this.extractEmojis(comment);
    const allowedEmojis = new Set(this.config.emojiPolicy.allowedEmojis);

    let sanitized = comment;
    // let allowedCount = 0;

    // 各絵文字を処理
    let keptCount = 0;
    for (const emoji of detectedEmojis) {
      const isAllowed =
        allowedEmojis.has(emoji) || this.config.emojiPolicy.allowedEmojis.length === 0;

      if (!isAllowed) {
        // 許可されていない絵文字はすべて削除
        sanitized = sanitized.replace(new RegExp(this.escapeRegExp(emoji), 'g'), '');
      } else if (keptCount < this.config.emojiPolicy.maxCount) {
        // 上限内の場合は最初の1つだけ残す
        const firstIndex = sanitized.indexOf(emoji);
        if (firstIndex !== -1) {
          keptCount++;
          // 2つ目以降を削除
          const before = sanitized.substring(0, firstIndex + emoji.length);
          const after = sanitized.substring(firstIndex + emoji.length);
          sanitized = before + after.replace(new RegExp(this.escapeRegExp(emoji), 'g'), '');
        }
      } else {
        // 上限を超えた絵文字はすべて削除
        sanitized = sanitized.replace(new RegExp(this.escapeRegExp(emoji), 'g'), '');
      }
    }

    // 連続するスペースを1つに圧縮
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * 類似性チェック（同じ絵文字の連投を防ぐ）
   */
  checkSimilarity(
    comment: string,
    recentComments: RecentComment[],
    timeWindowMs: number = 60000 // デフォルト1分
  ): boolean {
    const currentEmojis = this.extractEmojis(comment);
    if (currentEmojis.length === 0) return false;

    const now = Date.now();
    const currentEmojiSet = new Set(currentEmojis);

    // 時間窓内の最近のコメントをチェック
    for (const recent of recentComments) {
      if (now - recent.timestamp > timeWindowMs) continue;

      const recentEmojis = this.extractEmojis(recent.text);
      const recentEmojiSet = new Set(recentEmojis);

      // 同じ絵文字が含まれているかチェック
      for (const emoji of currentEmojiSet) {
        if (recentEmojiSet.has(emoji)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * コメントに適切な絵文字を追加
   */
  formatWithEmoji(comment: string): string {
    if (!this.config.emojiPolicy.enabled) {
      return comment;
    }

    const validation = this.validate(comment);

    // 既に絵文字がある場合はそのまま返す
    if (validation.emojiCount > 0) {
      return comment;
    }

    // 上限に達している場合は追加しない
    if (validation.emojiCount >= this.config.emojiPolicy.maxCount) {
      return comment;
    }

    // 許可された絵文字からランダムに選択
    const allowedEmojis = this.config.emojiPolicy.allowedEmojis;
    if (allowedEmojis.length === 0) {
      return comment;
    }

    const randomEmoji = allowedEmojis[Math.floor(Math.random() * allowedEmojis.length)];

    // 文末に絵文字を追加
    if (comment.match(/[。！？]$/)) {
      return comment.replace(/([。！？])$/, `$1${randomEmoji}`);
    } else {
      return `${comment}${randomEmoji}`;
    }
  }

  /**
   * 設定を更新
   */
  updateConfig(config: CommentConfig): void {
    this.config = config;
  }

  /**
   * 正規表現の特殊文字をエスケープ
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
