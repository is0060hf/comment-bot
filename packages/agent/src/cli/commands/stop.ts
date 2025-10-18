import * as fs from 'fs';
import * as path from 'path';

import { Command } from './base';

/**
 * stopコマンド - 配信の監視を停止
 */
export class StopCommand extends Command {
  name = 'stop';
  description = '配信の監視を停止します';

  async execute(_args: string[]): Promise<void> {
    console.log('配信の監視を停止します...');
    await this.stopBot();
  }

  private async stopBot(): Promise<void> {
    try {
      // PIDファイルからプロセスIDを読み取り
      const pidFile = path.join(process.cwd(), '.comment-bot.pid');
      
      if (!fs.existsSync(pidFile)) {
        console.log('実行中のプロセスが見つかりません');
        return;
      }

      const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
      
      // プロセスに終了シグナルを送信
      try {
        process.kill(pid, 'SIGTERM');
        console.log('✅ 停止シグナルを送信しました');
        
        // PIDファイルを削除
        fs.unlinkSync(pidFile);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
          console.log('プロセスは既に停止しています');
          fs.unlinkSync(pidFile);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('❌ 停止中にエラーが発生しました:', error);
      throw error;
    }
  }
}

