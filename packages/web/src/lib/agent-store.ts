/**
 * エージェントデータストア
 * メモリ内でエージェントの状態を管理
 */

interface AgentStatus {
  agent: 'running' | 'stopped' | 'error';
  stt: 'connected' | 'disconnected' | 'connecting';
  youtube: 'authenticated' | 'unauthenticated' | 'error';
  safety: 'enabled' | 'disabled';
  uptime?: number;
  sessionComments?: number;
  lastUpdate?: string;
}

interface Comment {
  id?: string;
  content: string;
  confidence: number;
  status: 'posted' | 'blocked' | 'pending';
  blockReason?: string;
  timestamp: string;
}

interface Error {
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: string;
}

interface Command {
  id: string;
  type: 'start' | 'stop' | 'pause' | 'resume' | 'reload';
  timestamp: string;
}

class AgentStore {
  private status: AgentStatus = {
    agent: 'stopped',
    stt: 'disconnected',
    youtube: 'unauthenticated',
    safety: 'enabled',
  };

  private comments: Comment[] = [];
  private errors: Error[] = [];
  private commands: Command[] = [];

  /**
   * ステータスを更新
   */
  async updateStatus(newStatus: Partial<AgentStatus>): Promise<boolean> {
    this.status = {
      ...this.status,
      ...newStatus,
      lastUpdate: new Date().toISOString(),
    };
    return true;
  }

  /**
   * 現在のステータスを取得
   */
  getStatus(): AgentStatus {
    return { ...this.status };
  }

  /**
   * コメントを追加
   */
  async addComment(comment: Comment): Promise<string> {
    const id = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const commentWithId = { ...comment, id };
    
    this.comments.unshift(commentWithId);
    
    // 最新100件のみ保持
    if (this.comments.length > 100) {
      this.comments = this.comments.slice(0, 100);
    }
    
    return id;
  }

  /**
   * 最近のコメントを取得
   */
  getRecentComments(limit: number = 20): Comment[] {
    return this.comments.slice(0, limit);
  }

  /**
   * エラーを追加
   */
  async addError(error: Error): Promise<boolean> {
    this.errors.unshift(error);
    
    // 最新50件のみ保持
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(0, 50);
    }
    
    return true;
  }

  /**
   * 最近のエラーを取得
   */
  getRecentErrors(limit: number = 10): Error[] {
    return this.errors.slice(0, limit);
  }

  /**
   * コマンドを追加
   */
  addCommand(type: Command['type']): string {
    const id = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const command: Command = {
      id,
      type,
      timestamp: new Date().toISOString(),
    };
    
    this.commands.push(command);
    return id;
  }

  /**
   * 保留中のコマンドを取得
   */
  async getCommands(): Promise<Command[]> {
    return [...this.commands];
  }

  /**
   * コマンドをクリア
   */
  async clearCommands(): Promise<void> {
    this.commands = [];
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    const totalComments = this.comments.length;
    const postedComments = this.comments.filter(c => c.status === 'posted').length;
    const blockedComments = this.comments.filter(c => c.status === 'blocked').length;
    const averageConfidence = this.comments.length > 0
      ? this.comments.reduce((sum, c) => sum + c.confidence, 0) / this.comments.length
      : 0;

    return {
      totalComments,
      postedComments,
      blockedComments,
      averageConfidence,
      sessionComments: this.status.sessionComments || 0,
      uptime: this.formatUptime(this.status.uptime || 0),
    };
  }

  /**
   * アップタイムをフォーマット
   */
  private formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

// シングルトンインスタンス
export const agentStore = new AgentStore();
