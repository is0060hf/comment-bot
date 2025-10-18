/**
 * コンテキスト管理モジュール
 * 配信の文脈を追跡し、コメント生成のための情報を管理
 */

import { TranscriptSegment, ContextSummary } from '@comment-bot/shared';

export interface ContextConfig {
  maxTranscripts: number;
  maxTopics: number;
  maxKeywords: number;
  topicWindowMs: number;
  keywordDecayMs: number;
}

interface TranscriptEntry {
  segment: TranscriptSegment;
  addedAt: number;
}

interface KeywordEntry {
  keyword: string;
  count: number;
  lastSeen: number;
  score: number;
}

export class ContextStore {
  private config: ContextConfig;
  private transcripts: TranscriptEntry[] = [];
  private topics: Map<string, number> = new Map();
  private keywords: Map<string, KeywordEntry> = new Map();
  private viewerQuestions: string[] = [];
  private engagementLevel = 0.5;

  constructor(config: ContextConfig) {
    this.config = config;
  }

  addTranscript(segment: TranscriptSegment): void {
    // 暫定結果は無視
    if (!segment.isFinal) {
      return;
    }

    // トランスクリプトを追加
    this.transcripts.push({
      segment,
      addedAt: Date.now(),
    });

    // 最大数を超えたら古いものを削除
    if (this.transcripts.length > this.config.maxTranscripts) {
      this.transcripts.shift();
    }

    // トピックとキーワードを抽出
    this.extractTopics(segment);
    this.extractKeywords(segment);
    this.detectViewerQuestions(segment);
    this.updateEngagementLevel(segment);
  }

  private extractTopics(segment: TranscriptSegment): void {
    const text = segment.text;
    
    // 簡易的なトピック抽出（実際はより高度な処理が必要）
    const topicPatterns = [
      /TypeScript|JavaScript|React|Next\.js|Node\.js|Python|Java|C\+\+/gi,
      /プログラミング|開発|コーディング|実装|設計/gi,
      /質問|説明|紹介|解説|チュートリアル/gi,
    ];

    topicPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const topic = match; // 元のケースを保持
          this.topics.set(topic, segment.timestamp);
        });
      }
    });

    // 古いトピックを削除
    const cutoff = Date.now() - this.config.topicWindowMs;
    for (const [topic, timestamp] of this.topics) {
      if (timestamp < cutoff) {
        this.topics.delete(topic);
      }
    }

    // 最大数を維持
    if (this.topics.size > this.config.maxTopics) {
      const sorted = Array.from(this.topics.entries())
        .sort((a, b) => b[1] - a[1]);
      this.topics = new Map(sorted.slice(0, this.config.maxTopics));
    }
  }

  private extractKeywords(segment: TranscriptSegment): void {
    const text = segment.text;
    
    // 重要な単語を抽出（形態素解析の簡易版）
    // まず名詞的な表現を抽出
    const nounPatterns = [
      /TypeScript|JavaScript|React|Next\.js|Node\.js|Python|Java|C\+\+/gi,
      /型安全性|プログラミング言語|スーパーセット/gi,
      /[一-龥ぁ-んァ-ヶー]{2,}/g, // 日本語の2文字以上
    ];
    
    const extractedWords = new Set<string>();
    
    nounPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!this.isStopWord(match)) {
            extractedWords.add(match);
          }
        });
      }
    });

    extractedWords.forEach(word => {
      const existing = this.keywords.get(word);
      if (existing) {
        existing.count++;
        existing.lastSeen = Date.now();
        existing.score = this.calculateKeywordScore(existing);
      } else {
        this.keywords.set(word, {
          keyword: word,
          count: 1,
          lastSeen: Date.now(),
          score: 1,
        });
      }
    });

    // スコアでソートして最大数を維持
    this.pruneKeywords();
  }

  private isStopWord(word: string): boolean {
    const stopWords = [
      'です', 'ます', 'した', 'する', 'これ', 'それ', 'あれ',
      'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ',
      'という', 'といった', 'として', 'において', 'について',
    ];
    return stopWords.includes(word.toLowerCase());
  }

  private calculateKeywordScore(entry: KeywordEntry): number {
    const age = Date.now() - entry.lastSeen;
    const decayFactor = Math.exp(-age / this.config.keywordDecayMs);
    return entry.count * decayFactor;
  }

  private pruneKeywords(): void {
    const sorted = Array.from(this.keywords.entries())
      .map(([key, entry]) => ({
        key,
        score: this.calculateKeywordScore(entry),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxKeywords);

    const newKeywords = new Map<string, KeywordEntry>();
    sorted.forEach(({ key }) => {
      const entry = this.keywords.get(key);
      if (entry) {
        newKeywords.set(key, entry);
      }
    });
    this.keywords = newKeywords;
  }

  private detectViewerQuestions(segment: TranscriptSegment): void {
    const text = segment.text;
    
    // 視聴者の質問パターン
    const questionPatterns = [
      /「(.+?)[？?]」/g,
      /『(.+?)[？?]』/g,
      /チャットで「(.+?)」/g,
      /「(.+?)」という質問/g,
    ];

    const newQuestions: string[] = [];
    questionPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && !this.viewerQuestions.includes(match[1])) {
          newQuestions.push(match[1]);
        }
      }
    });

    // 新しい質問を追加
    this.viewerQuestions.push(...newQuestions);

    // 最新の5つのみ保持
    if (this.viewerQuestions.length > 5) {
      this.viewerQuestions = this.viewerQuestions.slice(-5);
    }
  }

  private updateEngagementLevel(segment: TranscriptSegment): void {
    const text = segment.text.toLowerCase();
    
    // エンゲージメントを上げる要因
    if (text.includes('質問') || text.includes('どう思') || text.includes('コメント')) {
      this.engagementLevel = Math.min(1, this.engagementLevel + 0.1);
    }
    
    // 話題転換
    if (text.includes('次は') || text.includes('では') || text.includes('さて')) {
      this.engagementLevel = Math.min(1, this.engagementLevel + 0.05);
    }
    
    // 自然減衰
    this.engagementLevel = Math.max(0.3, this.engagementLevel - 0.01);
  }

  getContext(): ContextSummary {
    return {
      recentTranscripts: this.transcripts.map(t => t.segment.text),
      topics: Array.from(this.topics.keys()),
      keywords: Array.from(this.keywords.keys()),
      engagementLevel: this.engagementLevel,
      lastCommentTime: Date.now(),
      viewerQuestions: this.viewerQuestions.length > 0 ? [...this.viewerQuestions] : undefined,
    };
  }

  getKeywordScores(): Map<string, number> {
    const scores = new Map<string, number>();
    this.keywords.forEach((entry, key) => {
      scores.set(key, this.calculateKeywordScore(entry));
    });
    return scores;
  }

  reset(): void {
    this.transcripts = [];
    this.topics.clear();
    this.keywords.clear();
    this.viewerQuestions = [];
    this.engagementLevel = 0.5;
  }

  getSummary(): string {
    const context = this.getContext();
    return `コンテキストサマリー:
- 最近のトランスクリプト: ${context.recentTranscripts.length}件
- トピック: ${context.topics.join(', ')}
- キーワード: ${context.keywords.slice(0, 10).join(', ')}
- エンゲージメントレベル: ${(context.engagementLevel * 100).toFixed(0)}%
- 視聴者の質問: ${context.viewerQuestions?.length || 0}件`;
  }
}
