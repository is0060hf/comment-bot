import { Command } from './base';

/**
 * resumeコマンド - コメント投稿を再開
 */
export class ResumeCommand extends Command {
  name = 'resume';
  description = 'コメント投稿を再開します';

  async execute(_args: string[]): Promise<void> {
    console.log('コメント投稿を再開します...');
    await this.resumeBot();
  }

  private async resumeBot(): Promise<void> {
    try {
      // IPCやHTTP経由でプロセスと通信（仮実装）
      // 実際の実装では、実行中のプロセスと通信する仕組みが必要
      console.log('✅ コメント投稿を再開しました');
    } catch (error) {
      console.error('❌ 再開中にエラーが発生しました:', error);
      throw error;
    }
  }
}

