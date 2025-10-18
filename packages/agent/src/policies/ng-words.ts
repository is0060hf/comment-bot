import { CommentConfig } from '../config/types';

/**
 * NG語検出結果
 */
export interface NGWordDetectionResult {
  /** 検証結果（NG語が含まれていない場合true） */
  isValid: boolean;
  /** 検出されたNG語のリスト */
  detectedWords: string[];
  /** 正規化されたテキスト（detectWithNormalizationの場合） */
  normalizedText?: string;
}

/**
 * NG語ポリシー
 * 不適切な語句を検出・正規化・除去
 */
export class NGWordsPolicy {
  private ngWords: Set<string>;
  private normalizedNGWords: Set<string>;

  constructor(config: CommentConfig) {
    this.ngWords = new Set(config.ngWords);
    this.normalizedNGWords = new Set();
    this.updateNormalizedNGWords();
  }

  /**
   * デフォルトのNG語リストを取得
   */
  static getDefaultNGWords(): string[] {
    return [
      // 攻撃的な表現
      '死ね',
      '殺す',
      '消えろ',
      'くたばれ',

      // 侮辱的な表現
      'バカ',
      'アホ',
      'マヌケ',
      'クズ',
      'ゴミ',
      'カス',
      'ブス',
      'ブサイク',
      'デブ',
      'ハゲ',

      // 下品な表現
      'クソ',
      'ウンコ',
      'ウンチ',
      'くそ',

      // 差別的な表現
      'ガイジ',
      'キチガイ',
      'メンヘラ',

      // URLパターン（スパム防止）
      'http://',
      'https://',
      'bit.ly',
      'tinyurl.com',

      // 個人情報パターン
      '090-',
      '080-',
      '070-',
      '03-',
      '@gmail.com',
      '@yahoo.co.jp',

      // 金銭要求
      '振込',
      '送金',
      'PayPay',
      'LINE Pay',
      '口座番号',

      // 宣伝・勧誘
      '稼げる',
      '儲かる',
      '副業',
      '在宅ワーク',
      'FX',
      '仮想通貨',
      '登録はこちら',
      '詳細はプロフ',
      'DMください',
    ];
  }

  /**
   * コメントを検証（NG語が含まれていないかチェック）
   */
  validate(comment: string): NGWordDetectionResult {
    const detectedWords: string[] = [];

    for (const ngWord of this.ngWords) {
      if (comment.includes(ngWord)) {
        detectedWords.push(ngWord);
      }
    }

    return {
      isValid: detectedWords.length === 0,
      detectedWords,
    };
  }

  /**
   * テキストを正規化
   * - ひらがな→カタカナ変換
   * - 全角英数字→半角変換
   * - 文字の繰り返しを削減
   * - スペースや特殊文字を除去
   */
  normalize(text: string): string {
    let normalized = text;

    // 1. 半角カナを全角カナに変換
    normalized = this.halfWidthKanaToFullWidth(normalized);

    // 2. ひらがなをカタカナに変換
    normalized = this.hiraganaToKatakana(normalized);

    // 3. 全角英数字を半角に変換
    normalized = this.fullWidthToHalfWidth(normalized);

    // 4. 長音符の正規化（ァ→ア、ィ→イ、ゥ→ウ、ェ→エ、ォ→オ）
    normalized = normalized.replace(/[ァィゥェォ]/g, (char) => {
      const map: Record<string, string> = {
        ァ: 'ア',
        ィ: 'イ',
        ゥ: 'ウ',
        ェ: 'エ',
        ォ: 'オ',
      };
      return map[char] || char;
    });

    // 5. 文字の繰り返しを削減（3文字以上の繰り返しを2文字に）
    normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');

    // 6. スペースと特殊文字を除去
    normalized = normalized.replace(/[\s　・]/g, '');

    return normalized;
  }

  /**
   * 正規化を含めた検出
   */
  detectWithNormalization(comment: string): NGWordDetectionResult {
    const normalizedComment = this.normalize(comment);
    const detectedWords: string[] = [];
    const detectedSet = new Set<string>(); // 重複防止

    // 正規化されたNG語で検索
    for (const ngWord of this.ngWords) {
      const normalizedNGWord = this.normalize(ngWord);

      // 通常の包含チェック
      if (normalizedComment.includes(normalizedNGWord)) {
        if (!detectedSet.has(ngWord)) {
          detectedWords.push(ngWord);
          detectedSet.add(ngWord);
        }
        continue;
      }

      // 長音符対応: 各文字の後に母音の挿入を許可
      // 例: 「バカ」→「バ[ア]?カ[ア]?」で「バアカ」にもマッチ
      let expandedPattern = '';
      const chars = Array.from(normalizedNGWord);

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        expandedPattern += char;

        // カナ文字の後に対応する母音の挿入を許可
        const vowelMap: Record<string, string> = {
          カ: 'ア',
          キ: 'イ',
          ク: 'ウ',
          ケ: 'エ',
          コ: 'オ',
          ガ: 'ア',
          ギ: 'イ',
          グ: 'ウ',
          ゲ: 'エ',
          ゴ: 'オ',
          サ: 'ア',
          シ: 'イ',
          ス: 'ウ',
          セ: 'エ',
          ソ: 'オ',
          ザ: 'ア',
          ジ: 'イ',
          ズ: 'ウ',
          ゼ: 'エ',
          ゾ: 'オ',
          タ: 'ア',
          チ: 'イ',
          ツ: 'ウ',
          テ: 'エ',
          ト: 'オ',
          ダ: 'ア',
          ヂ: 'イ',
          ヅ: 'ウ',
          デ: 'エ',
          ド: 'オ',
          ナ: 'ア',
          ニ: 'イ',
          ヌ: 'ウ',
          ネ: 'エ',
          ノ: 'オ',
          ハ: 'ア',
          ヒ: 'イ',
          フ: 'ウ',
          ヘ: 'エ',
          ホ: 'オ',
          バ: 'ア',
          ビ: 'イ',
          ブ: 'ウ',
          ベ: 'エ',
          ボ: 'オ',
          パ: 'ア',
          ピ: 'イ',
          プ: 'ウ',
          ペ: 'エ',
          ポ: 'オ',
          マ: 'ア',
          ミ: 'イ',
          ム: 'ウ',
          メ: 'エ',
          モ: 'オ',
          ヤ: 'ア',
          ユ: 'ウ',
          ヨ: 'オ',
          ラ: 'ア',
          リ: 'イ',
          ル: 'ウ',
          レ: 'エ',
          ロ: 'オ',
          ワ: 'ア',
          ヲ: 'オ',
          ン: '',
        };

        const vowel = vowelMap[char!];
        if (vowel !== undefined) {
          expandedPattern += `${vowel}*`; // 0個以上の母音を許可
        }
      }

      try {
        const regex = new RegExp(expandedPattern);
        if (regex.test(normalizedComment)) {
          if (!detectedSet.has(ngWord)) {
            detectedWords.push(ngWord);
            detectedSet.add(ngWord);
          }
        }
      } catch {
        // 正規表現エラーは無視
      }
    }

    return {
      isValid: detectedWords.length === 0,
      detectedWords,
      normalizedText: normalizedComment,
    };
  }

  /**
   * NG語を除去（サニタイズ）
   */
  sanitize(comment: string): string {
    let sanitized = comment;

    // detectWithNormalizationを使って検出
    const detection = this.detectWithNormalization(comment);
    if (detection.isValid) {
      return comment; // NG語がない場合はそのまま返す
    }

    // 各NG語に対して、様々なバリエーションを検出して置換
    for (const ngWord of this.ngWords) {
      const normalizedNG = this.normalize(ngWord);

      // 簡単なアプローチ: 正規化されたテキストと正規化されたNG語を比較
      // マッチした範囲を元のテキストから削除
      const normalizedComment = this.normalize(sanitized);

      // 正規化されたテキストでNG語を検索
      let searchStart = 0;
      while (true) {
        const index = normalizedComment.indexOf(normalizedNG, searchStart);
        if (index === -1) break;

        // 元のテキストでの対応位置を探す
        // 正規化前後で文字数が変わる可能性があるため、周辺を含めて検索
        let originalStart = 0;
        let normalizedPos = 0;

        // 正規化された位置まで元のテキストを進める
        while (normalizedPos < index && originalStart < sanitized.length) {
          const originalChar = sanitized[originalStart];
          const normalizedChunk = this.normalize(originalChar!);
          normalizedPos += normalizedChunk.length;
          originalStart++;
        }

        // NG語の長さを考慮して終端位置を決定
        let originalEnd = originalStart;
        let normalizedEndPos = normalizedPos;

        while (normalizedEndPos < index + normalizedNG.length && originalEnd < sanitized.length) {
          const originalChar = sanitized[originalEnd];
          const normalizedChunk = this.normalize(originalChar!);
          normalizedEndPos += normalizedChunk.length;
          originalEnd++;
        }

        // 置換
        sanitized =
          `${sanitized.substring(0, originalStart)  }***${  sanitized.substring(originalEnd)}`;

        searchStart = index + normalizedNG.length;
      }
    }

    return sanitized;
  }

  /**
   * NG語を追加
   */
  addNGWord(word: string): void {
    this.ngWords.add(word);
    // カタカナバージョンも追加（ひらがな→カタカナ変換対応）
    const katakanaVersion = this.hiraganaToKatakana(word);
    if (katakanaVersion !== word) {
      this.ngWords.add(katakanaVersion);
    }
    this.updateNormalizedNGWords();
  }

  /**
   * NG語を削除
   */
  removeNGWord(word: string): void {
    this.ngWords.delete(word);
    this.updateNormalizedNGWords();
  }

  /**
   * 設定を更新
   */
  updateConfig(config: CommentConfig): void {
    this.ngWords = new Set(config.ngWords);
    this.updateNormalizedNGWords();
  }

  /**
   * ひらがなをカタカナに変換
   */
  private hiraganaToKatakana(text: string): string {
    return text.replace(/[\u3041-\u3096]/g, (match) => {
      const code = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(code);
    });
  }

  /**
   * カタカナをひらがなに変換
   */
  /*
  private katakanaToHiragana(text: string): string {
    return text.replace(/[\u30a1-\u30f6]/g, (match) => {
      const code = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(code);
    });
  }
  */

  /**
   * 全角英数字を半角に変換
   */
  private fullWidthToHalfWidth(text: string): string {
    return text
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
        return String.fromCharCode(s.charCodeAt(0) - 0xfee0);
      })
      .replace(/[：／．]/g, (s) => {
        const map: Record<string, string> = {
          '：': ':',
          '／': '/',
          '．': '.',
        };
        return map[s] || s;
      })
      .toLowerCase(); // URL検出のため小文字化
  }

  /**
   * 半角カナを全角カナに変換
   */
  private halfWidthKanaToFullWidth(text: string): string {
    const halfToFull: Record<string, string> = {
      ｱ: 'ア',
      ｲ: 'イ',
      ｳ: 'ウ',
      ｴ: 'エ',
      ｵ: 'オ',
      ｶ: 'カ',
      ｷ: 'キ',
      ｸ: 'ク',
      ｹ: 'ケ',
      ｺ: 'コ',
      ｻ: 'サ',
      ｼ: 'シ',
      ｽ: 'ス',
      ｾ: 'セ',
      ｿ: 'ソ',
      ﾀ: 'タ',
      ﾁ: 'チ',
      ﾂ: 'ツ',
      ﾃ: 'テ',
      ﾄ: 'ト',
      ﾅ: 'ナ',
      ﾆ: 'ニ',
      ﾇ: 'ヌ',
      ﾈ: 'ネ',
      ﾉ: 'ノ',
      ﾊ: 'ハ',
      ﾋ: 'ヒ',
      ﾌ: 'フ',
      ﾍ: 'ヘ',
      ﾎ: 'ホ',
      ﾏ: 'マ',
      ﾐ: 'ミ',
      ﾑ: 'ム',
      ﾒ: 'メ',
      ﾓ: 'モ',
      ﾔ: 'ヤ',
      ﾕ: 'ユ',
      ﾖ: 'ヨ',
      ﾗ: 'ラ',
      ﾘ: 'リ',
      ﾙ: 'ル',
      ﾚ: 'レ',
      ﾛ: 'ロ',
      ﾜ: 'ワ',
      ｦ: 'ヲ',
      ﾝ: 'ン',
      ｰ: 'ー',
      ｯ: 'ッ',
      ｬ: 'ャ',
      ｭ: 'ュ',
      ｮ: 'ョ',
      ｧ: 'ァ',
      ｨ: 'ィ',
      ｩ: 'ゥ',
      ｪ: 'ェ',
      ｫ: 'ォ',
      ﾞ: '゛',
      ﾟ: '゜',
    };

    // 濁点・半濁点付き文字の変換マップ
    const dakutenMap: Record<string, string> = {
      ｶﾞ: 'ガ', ｷﾞ: 'ギ', ｸﾞ: 'グ', ｹﾞ: 'ゲ', ｺﾞ: 'ゴ',
      ｻﾞ: 'ザ', ｼﾞ: 'ジ', ｽﾞ: 'ズ', ｾﾞ: 'ゼ', ｿﾞ: 'ゾ',
      ﾀﾞ: 'ダ', ﾁﾞ: 'ヂ', ﾂﾞ: 'ヅ', ﾃﾞ: 'デ', ﾄﾞ: 'ド',
      ﾊﾞ: 'バ', ﾋﾞ: 'ビ', ﾌﾞ: 'ブ', ﾍﾞ: 'ベ', ﾎﾞ: 'ボ',
      ﾊﾟ: 'パ', ﾋﾟ: 'ピ', ﾌﾟ: 'プ', ﾍﾟ: 'ペ', ﾎﾟ: 'ポ',
    };

    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      const nextChar = text[i + 1];
      
      // 濁点・半濁点付き文字をチェック
      if (nextChar === 'ﾞ' || nextChar === 'ﾟ') {
        const combined = char + nextChar;
        if (dakutenMap[combined]) {
          result += dakutenMap[combined];
          i++; // 濁点・半濁点をスキップ
          continue;
        }
      }
      
      // 通常の半角カナ変換
      if (halfToFull[char]) {
        result += halfToFull[char];
      } else {
        result += char;
      }
    }

    return result;
  }

  /**
   * 正規化されたNG語リストを更新
   */
  private updateNormalizedNGWords(): void {
    this.normalizedNGWords.clear();
    for (const word of this.ngWords) {
      this.normalizedNGWords.add(this.normalize(word));
    }
  }
}