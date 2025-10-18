import * as fs from 'fs';
import * as path from 'path';

import { Command } from './base';

interface StatusInfo {
  running: boolean;
  paused: boolean;
  videoId?: string;
  uptime?: number;
  commentsPosted?: number;
}

/**
 * statusコマンド - 現在の状態を表示
 */
export class StatusCommand extends Command {
  name = 'status';
  description = '現在の状態を表示します';

  async execute(_args: string[]): Promise<void> {
    const status = await this.getStatus();
    this.displayStatus(status);
  }

  private async getStatus(): Promise<StatusInfo> {
    try {
      // PIDファイルの存在確認
      const pidFile = path.join(process.cwd(), '.comment-bot.pid');
      
      if (!fs.existsSync(pidFile)) {
        return { running: false, paused: false };
      }

      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
      
      // プロセスの存在確認
      try {
        process.kill(pid, 0); // シグナル0はプロセスの存在確認のみ
        
        // 状態ファイルから詳細情報を読み取り（仮実装）
        // 実際の実装では、実行中のプロセスから状態を取得
        return {
          running: true,
          paused: false,
          videoId: 'VIDEO123',
          uptime: 3600,
          commentsPosted: 10,
        };
      } catch {
        // プロセスが存在しない
        return { running: false, paused: false };
      }
    } catch (error) {
      console.error('状態取得中にエラーが発生しました:', error);
      return { running: false, paused: false };
    }
  }

  private displayStatus(status: StatusInfo): void {
    console.log('=== Comment Bot ステータス ===');
    console.log(`状態: ${status.running ? '実行中' : '停止中'}`);
    
    if (status.running) {
      console.log(`一時停止: ${status.paused ? 'はい' : 'いいえ'}`);
      
      if (status.videoId) {
        console.log(`監視中の動画: ${status.videoId}`);
      }
      
      if (status.uptime) {
        const hours = Math.floor(status.uptime / 3600);
        const minutes = Math.floor((status.uptime % 3600) / 60);
        console.log(`稼働時間: ${hours}時間${minutes}分`);
      }
      
      if (status.commentsPosted !== undefined) {
        console.log(`投稿したコメント数: ${status.commentsPosted}`);
      }
    }
  }
}

