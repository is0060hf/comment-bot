/**
 * コンテキストストア
 * 配信の文脈情報を管理
 */

export interface TranscriptEntry {
  text: string;
  timestamp: number;
}

export interface ContextSummary {
  recentTranscripts: TranscriptEntry[];
  topics: string[];
  keywords: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  lastUpdateTime: number;
}

export class ContextStore {
  private transcripts: TranscriptEntry[] = [];
  private topics: Set<string> = new Set();
  private keywords: Set<string> = new Set();
  private readonly maxTranscripts = 50;
  private readonly maxAge = 5 * 60 * 1000; // 5分

  /**
   * トランスクリプトを追加
   */
  addTranscript(entry: TranscriptEntry): void {
    this.transcripts.push(entry);
    this.cleanup();
    
    // キーワード抽出（簡易版）
    const words = entry.text.split(/\s+/);
    words.forEach(word => {
      if (word.length > 3) {
        this.keywords.add(word);
      }
    });
  }

  /**
   * トピックを追加
   */
  addTopic(topic: string): void {
    this.topics.add(topic);
  }

  /**
   * キーワードを追加
   */
  addKeyword(keyword: string): void {
    this.keywords.add(keyword);
  }

  /**
   * 最近のトランスクリプトを取得
   */
  getRecentTranscripts(count: number = 10): TranscriptEntry[] {
    return this.transcripts.slice(-count);
  }

  /**
   * 最後のトランスクリプトを取得
   */
  getLastTranscript(): TranscriptEntry | undefined {
    return this.transcripts[this.transcripts.length - 1];
  }

  /**
   * トピックリストを取得
   */
  getTopics(): string[] {
    return Array.from(this.topics);
  }

  /**
   * キーワードリストを取得
   */
  getKeywords(): string[] {
    return Array.from(this.keywords);
  }

  /**
   * コンテキストサマリーを取得
   */
  getSummary(): ContextSummary {
    return {
      recentTranscripts: this.getRecentTranscripts(),
      topics: this.getTopics(),
      keywords: this.getKeywords(),
      lastUpdateTime: this.getLastTranscript()?.timestamp || Date.now()
    };
  }

  /**
   * センチメントを推定（簡易版）
   */
  estimateSentiment(): 'positive' | 'negative' | 'neutral' {
    const recentText = this.getRecentTranscripts(5)
      .map(t => t.text)
      .join(' ')
      .toLowerCase();

    const positiveWords = ['いい', 'すごい', '素晴らしい', '楽しい', '嬉しい'];
    const negativeWords = ['悪い', 'つまらない', '難しい', '嫌い', '困った'];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach(word => {
      if (recentText.includes(word)) positiveCount++;
    });

    negativeWords.forEach(word => {
      if (recentText.includes(word)) negativeCount++;
    });

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * コンテキストをクリア
   */
  clear(): void {
    this.transcripts = [];
    this.topics.clear();
    this.keywords.clear();
  }

  /**
   * 古いエントリを削除
   */
  private cleanup(): void {
    const now = Date.now();
    
    // 古いトランスクリプトを削除
    this.transcripts = this.transcripts.filter(
      t => now - t.timestamp < this.maxAge
    );

    // 最大数を超えた場合は古いものから削除
    if (this.transcripts.length > this.maxTranscripts) {
      this.transcripts = this.transcripts.slice(-this.maxTranscripts);
    }
  }
}
