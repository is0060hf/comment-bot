import { ConfigCommand } from './commands/config';
import { PauseCommand } from './commands/pause';
import { ResumeCommand } from './commands/resume';
import { SafetyCommand } from './commands/safety';
import { StartCommand } from './commands/start';
import { StatusCommand } from './commands/status';
import { StopCommand } from './commands/stop';

import type { Command } from './commands/base';

/**
 * Comment Bot CLI
 */
export class CommentBotCLI {
  private commands: Map<string, Command>;
  private version = '1.0.0';

  constructor() {
    this.commands = new Map<string, Command>();
    this.commands.set('start', new StartCommand());
    this.commands.set('stop', new StopCommand());
    this.commands.set('pause', new PauseCommand());
    this.commands.set('resume', new ResumeCommand());
    this.commands.set('status', new StatusCommand());
    this.commands.set('safety', new SafetyCommand());
    this.commands.set('config', new ConfigCommand());
  }

  /**
   * CLIを実行
   */
  async run(args: string[]): Promise<void> {
    try {
      // バージョン表示
      if (args.includes('--version') || args.includes('-v')) {
        console.log(this.version);
        return;
      }

      // ヘルプ表示
      if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        this.showHelp();
        return;
      }

      // コマンドを実行
      const commandName = args[0];
      const command = this.commands.get(commandName!);

      if (!command) {
        console.error(`不明なコマンド: ${commandName}`);
        this.showHelp();
        process.exit(1);
      }

      await command.execute(args.slice(1));
    } catch (error) {
      console.error('エラー:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * ヘルプメッセージを表示
   */
  private showHelp(): void {
    console.log('Usage: comment-bot <command> [options]');
    console.log('');
    console.log('Commands:');
    
    const maxNameLength = Math.max(...Array.from(this.commands.values()).map((cmd) => cmd.name.length));
    
    for (const command of this.commands.values()) {
      const padding = ' '.repeat(maxNameLength - command.name.length + 2);
      console.log(`  ${command.name}${padding}${command.description}`);
    }
    
    console.log('');
    console.log('Options:');
    console.log('  --version, -v  バージョンを表示');
    console.log('  --help, -h     このヘルプを表示');
    console.log('');
    console.log('Examples:');
    console.log('  comment-bot start VIDEO_ID                  # 配信の監視を開始');
    console.log('  comment-bot start VIDEO_ID --config my.yaml # カスタム設定で開始');
    console.log('  comment-bot status                          # 現在の状態を表示');
    console.log('  comment-bot safety strict                   # 安全レベルを厳格に設定');
    console.log('  comment-bot stop                            # 監視を停止');
  }
}
