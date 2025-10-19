/**
 * Vercel KV ストア
 */

import { createClient } from '@vercel/kv';

interface AgentState {
  status: string;
  lastSeen: string;
  sessionComments: number;
}

interface Comment {
  id: string;
  content: string;
  timestamp: string;
  [key: string]: any;
}

export class KVStore {
  private kv: ReturnType<typeof createClient>;

  constructor() {
    // 環境変数が設定されていない場合はモッククライアントを使用
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      this.kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
    } else {
      // テスト環境用のダミークライアント
      this.kv = createClient({
        url: 'redis://localhost:6379',
        token: 'dummy-token',
      });
    }
  }

  /**
   * エージェント状態を保存
   */
  async setAgentState(state: AgentState): Promise<void> {
    try {
      await this.kv.set('agent:state', JSON.stringify(state), {
        ex: 3600, // 1時間で期限切れ
      });
    } catch (error) {
      console.error('Failed to set agent state:', error);
      throw error;
    }
  }

  /**
   * エージェント状態を取得
   */
  async getAgentState(): Promise<AgentState | null> {
    try {
      const state = await this.kv.get('agent:state');
      return state ? JSON.parse(state as string) : null;
    } catch (error) {
      console.error('Failed to get agent state:', error);
      return null;
    }
  }

  /**
   * コメントを追加
   */
  async addComment(comment: Comment): Promise<void> {
    try {
      await this.kv.hset('comments', {
        [comment.id]: JSON.stringify(comment),
      });
    } catch (error) {
      console.error('Failed to add comment:', error);
      throw error;
    }
  }

  /**
   * コメントを取得
   */
  async getComment(id: string): Promise<Comment | null> {
    try {
      const comment = await this.kv.hget('comments', id);
      return comment ? JSON.parse(comment as string) : null;
    } catch (error) {
      console.error('Failed to get comment:', error);
      return null;
    }
  }

  /**
   * 最近のコメントを取得
   */
  async getRecentComments(limit: number): Promise<Comment[]> {
    try {
      const allComments = await this.kv.hgetall('comments');
      if (!allComments) return [];

      const comments = Object.values(allComments)
        .map(c => JSON.parse(c as string))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return comments;
    } catch (error) {
      console.error('Failed to get recent comments:', error);
      return [];
    }
  }
}
