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

  constructor(private config: CommentConfig) {
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
      '死ね', '殺す', '消えろ', 'くたばれ',
      
      // 侮辱的な表現
      'バカ', 'アホ', 'マヌケ', 'クズ', 'ゴミ', 'カス',
      'ブス', 'ブサイク', 'デブ', 'ハゲ',
      
      // 下品な表現
      'クソ', 'ウンコ', 'ウンチ', 'くそ',
      
      // 差別的な表現
      'ガイジ', 'キチガイ', 'メンヘラ',
      
      // URLパターン（スパム防止）
      'http://', 'https://', 'bit.ly', 'tinyurl.com',
      
      // 個人情報パターン
      '090-', '080-', '070-', '03-', '@gmail.com', '@yahoo.co.jp',
      
      // 金銭要求
      '振込', '送金', 'PayPay', 'LINE Pay', '口座番号',
      
      // 宣伝・勧誘
      '稼げる', '儲かる', '副業', '在宅ワーク', 'FX', '仮想通貨',
      '登録はこちら', '詳細はプロフ', 'DMください'
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
      detectedWords
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
        'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ'
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
          'カ': 'ア', 'キ': 'イ', 'ク': 'ウ', 'ケ': 'エ', 'コ': 'オ',
          'ガ': 'ア', 'ギ': 'イ', 'グ': 'ウ', 'ゲ': 'エ', 'ゴ': 'オ',
          'サ': 'ア', 'シ': 'イ', 'ス': 'ウ', 'セ': 'エ', 'ソ': 'オ',
          'ザ': 'ア', 'ジ': 'イ', 'ズ': 'ウ', 'ゼ': 'エ', 'ゾ': 'オ',
          'タ': 'ア', 'チ': 'イ', 'ツ': 'ウ', 'テ': 'エ', 'ト': 'オ',
          'ダ': 'ア', 'ヂ': 'イ', 'ヅ': 'ウ', 'デ': 'エ', 'ド': 'オ',
          'ナ': 'ア', 'ニ': 'イ', 'ヌ': 'ウ', 'ネ': 'エ', 'ノ': 'オ',
          'ハ': 'ア', 'ヒ': 'イ', 'フ': 'ウ', 'ヘ': 'エ', 'ホ': 'オ',
          'バ': 'ア', 'ビ': 'イ', 'ブ': 'ウ', 'ベ': 'エ', 'ボ': 'オ',
          'パ': 'ア', 'ピ': 'イ', 'プ': 'ウ', 'ペ': 'エ', 'ポ': 'オ',
          'マ': 'ア', 'ミ': 'イ', 'ム': 'ウ', 'メ': 'エ', 'モ': 'オ',
          'ヤ': 'ア', 'ユ': 'ウ', 'ヨ': 'オ',
          'ラ': 'ア', 'リ': 'イ', 'ル': 'ウ', 'レ': 'エ', 'ロ': 'オ',
          'ワ': 'ア', 'ヲ': 'オ', 'ン': ''
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
      normalizedText: normalizedComment
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
        sanitized = sanitized.substring(0, originalStart) + '***' + sanitized.substring(originalEnd);
        
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
    this.config = config;
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
   * 全角英数字を半角に変換
   */
  private fullWidthToHalfWidth(text: string): string {
    return text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/[：／．]/g, (s) => {
      const map: Record<string, string> = {
        '：': ':',
        '／': '/',
        '．': '.'
      };
      return map[s] || s;
    }).toLowerCase(); // URL検出のため小文字化
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

  /**
   * 正規化されたテキストでの位置から元のテキストでの位置を推定
   */
  private findOriginalPosition(original: string, ngWord: string, normalizedIndex: number): number {
    // 簡易実装: 元のテキストから直接検索
    const index = original.indexOf(ngWord);
    if (index !== -1) return index;
    
    // ひらがなバージョンを検索
    const hiraganaVersion = this.katakanaToHiragana(ngWord);
    const hiraganaIndex = original.indexOf(hiraganaVersion);
    if (hiraganaIndex !== -1) return hiraganaIndex;
    
    // 正規化前のバリエーションを検索（簡易版）
    const lowerOriginal = original.toLowerCase();
    const lowerNGWord = ngWord.toLowerCase();
    const lowerIndex = lowerOriginal.indexOf(lowerNGWord);
    if (lowerIndex !== -1) return lowerIndex;
    
    return -1;
  }

  /**
   * カタカナをひらがなに変換（補助関数）
   */
  private katakanaToHiragana(text: string): string {
    return text.replace(/[\u30A1-\u30F6]/g, (match) => {
      const code = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(code);
    });
  }

  /**
   * 半角カナを全角カナに変換
   */
  private halfWidthKanaToFullWidth(text: string): string {
    const halfKana = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｧｨｩｪｫｯｬｭｮ';
    const fullKana = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォッャュョ';
    const halfDakuten = 'ｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾊﾋﾌﾍﾎ';
    const fullDakuten = 'ガギグゲゴザジズゼゾダヂヅデドバビブベボ';
    const halfHandakuten = 'ﾊﾋﾌﾍﾎ';
    const fullHandakuten = 'パピプペポ';
    
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;
      const nextChar = text[i + 1];
      
      if (nextChar === 'ﾞ' && halfDakuten.includes(char)) {
        // 濁点
        const index = halfDakuten.indexOf(char);
        result += fullDakuten[index]!;
        i++; // 濁点をスキップ
      } else if (nextChar === 'ﾟ' && halfHandakuten.includes(char)) {
        // 半濁点
        const index = halfHandakuten.indexOf(char);
        result += fullHandakuten[index]!;
        i++; // 半濁点をスキップ
      } else {
        // 通常の変換
        const index = halfKana.indexOf(char);
        if (index !== -1) {
          result += fullKana[index]!;
        } else {
          result += char;
        }
      }
    }
    
    return result;
  }
  
  /**
   * 正規表現の特殊文字をエスケープ
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * 半角カナのバリエーションを取得
   */
  private getHalfWidthVariations(char: string): string {
    const fullToHalf: Record<string, string> = {
      'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
      'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
      'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
      'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
      'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
      'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
      'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
      'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
      'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
      'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
      'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
      'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
      'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
      'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
      'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ'
    };
    
    return fullToHalf[char] || '';
  }
}
