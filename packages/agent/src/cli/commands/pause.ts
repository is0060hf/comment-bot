import { Command } from './base';

/**
 * pauseコマンド - コメント投稿を一時停止
 */
export class PauseCommand extends Command {
  name = 'pause';
  description = 'コメント投稿を一時停止します（監視は継続）';

  async execute(_args: string[]): Promise<void> {
    console.log('コメント投稿を一時停止します...');
    await this.pauseBot();
  }

  private async pauseBot(): Promise<void> {
    try {
      // IPCやHTTP経由でプロセスと通信（仮実装）
      // 実際の実装では、実行中のプロセスと通信する仕組みが必要
      console.log('✅ コメント投稿を一時停止しました');
      console.log('再開するには "comment-bot resume" を実行してください');
    } catch (error) {
      console.error('❌ 一時停止中にエラーが発生しました:', error);
      throw error;
    }
  }
}

