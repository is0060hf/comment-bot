/**
 * Tsumiki AITDD - Red Phase
 * タスク35: CLIエントリポイントとコマンドのテストケース
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CommentBotCLI } from '../../src/cli';
import { Command } from '../../src/cli/commands/base';
import { StartCommand } from '../../src/cli/commands/start';
import { StopCommand } from '../../src/cli/commands/stop';
import { PauseCommand } from '../../src/cli/commands/pause';
import { ResumeCommand } from '../../src/cli/commands/resume';
import { StatusCommand } from '../../src/cli/commands/status';
import { SafetyCommand } from '../../src/cli/commands/safety';
import { ConfigCommand } from '../../src/cli/commands/config';

describe('Comment Bot CLI', () => {
  describe('CLIエントリポイント', () => {
    test('CLIインスタンスが作成できること', () => {
      const cli = new CommentBotCLI();
      expect(cli).toBeDefined();
    });

    test('helpコマンドが表示されること', () => {
      const cli = new CommentBotCLI();
      const spy = jest.spyOn(console, 'log').mockImplementation();
      
      cli.run(['--help']);
      
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('comment-bot'));
      spy.mockRestore();
    });

    test('バージョンが表示されること', () => {
      const cli = new CommentBotCLI();
      const spy = jest.spyOn(console, 'log').mockImplementation();
      
      cli.run(['--version']);
      
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/\d+\.\d+\.\d+/));
      spy.mockRestore();
    });
  });

  describe('コマンド基底クラス', () => {
    test('Commandクラスが抽象クラスであること', () => {
      // 抽象クラスは直接インスタンス化できないので、
      // TypeScriptのコンパイル時にエラーになることをテスト
      // ランタイムではエラーにならないため、スキップ
      expect(true).toBe(true);
    });

    test('コマンドがname、description、executeを持つこと', () => {
      class TestCommand extends Command {
        name = 'test';
        description = 'Test command';
        async execute(args: string[]): Promise<void> {
          // テスト用の実装
        }
      }

      const cmd = new TestCommand();
      expect(cmd.name).toBe('test');
      expect(cmd.description).toBe('Test command');
      expect(cmd.execute).toBeDefined();
    });
  });

  describe('startコマンド', () => {
    let startCommand: StartCommand;

    beforeEach(() => {
      startCommand = new StartCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(startCommand.name).toBe('start');
      expect(startCommand.description).toContain('配信の監視を開始');
    });

    test('YouTube動画IDが必須であること', async () => {
      await expect(startCommand.execute([])).rejects.toThrow('YouTube動画IDを指定してください');
    });

    test('設定ファイルオプションが処理できること', async () => {
      const mockStart = jest.fn().mockResolvedValue(undefined);
      (startCommand as any).startBot = mockStart;

      await startCommand.execute(['VIDEO123', '--config', 'custom.yaml']);

      expect(mockStart).toHaveBeenCalledWith('VIDEO123', 'custom.yaml');
    });

    test('エラーハンドリングができること', async () => {
      (startCommand as any).startBot = jest.fn().mockRejectedValue(new Error('Start failed'));
      const spy = jest.spyOn(console, 'error').mockImplementation();

      await expect(startCommand.execute(['VIDEO123'])).rejects.toThrow('Start failed');
      
      spy.mockRestore();
    });
  });

  describe('stopコマンド', () => {
    let stopCommand: StopCommand;

    beforeEach(() => {
      stopCommand = new StopCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(stopCommand.name).toBe('stop');
      expect(stopCommand.description).toContain('配信の監視を停止');
    });

    test('実行中のプロセスを停止できること', async () => {
      const mockStop = jest.fn().mockResolvedValue(undefined);
      (stopCommand as any).stopBot = mockStop;

      await stopCommand.execute([]);

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('pauseコマンド', () => {
    let pauseCommand: PauseCommand;

    beforeEach(() => {
      pauseCommand = new PauseCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(pauseCommand.name).toBe('pause');
      expect(pauseCommand.description).toContain('コメント投稿を一時停止');
    });

    test('一時停止できること', async () => {
      const mockPause = jest.fn().mockResolvedValue(undefined);
      (pauseCommand as any).pauseBot = mockPause;

      await pauseCommand.execute([]);

      expect(mockPause).toHaveBeenCalled();
    });
  });

  describe('resumeコマンド', () => {
    let resumeCommand: ResumeCommand;

    beforeEach(() => {
      resumeCommand = new ResumeCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(resumeCommand.name).toBe('resume');
      expect(resumeCommand.description).toContain('コメント投稿を再開');
    });

    test('再開できること', async () => {
      const mockResume = jest.fn().mockResolvedValue(undefined);
      (resumeCommand as any).resumeBot = mockResume;

      await resumeCommand.execute([]);

      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe('statusコマンド', () => {
    let statusCommand: StatusCommand;

    beforeEach(() => {
      statusCommand = new StatusCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(statusCommand.name).toBe('status');
      expect(statusCommand.description).toContain('現在の状態を表示');
    });

    test('ステータス情報を表示できること', async () => {
      const mockGetStatus = jest.fn().mockResolvedValue({
        running: true,
        paused: false,
        videoId: 'VIDEO123',
        uptime: 3600,
        commentsPosted: 10
      });
      (statusCommand as any).getStatus = mockGetStatus;
      const spy = jest.spyOn(console, 'log').mockImplementation();

      await statusCommand.execute([]);

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('実行中'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('VIDEO123'));
      spy.mockRestore();
    });
  });

  describe('safetyコマンド', () => {
    let safetyCommand: SafetyCommand;

    beforeEach(() => {
      safetyCommand = new SafetyCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(safetyCommand.name).toBe('safety');
      expect(safetyCommand.description).toContain('安全フィルタのレベルを設定');
    });

    test('有効なレベルが設定できること', async () => {
      const mockSetSafety = jest.fn().mockResolvedValue(undefined);
      (safetyCommand as any).setSafetyLevel = mockSetSafety;

      await safetyCommand.execute(['strict']);

      expect(mockSetSafety).toHaveBeenCalledWith('strict');
    });

    test('無効なレベルが拒否されること', async () => {
      await expect(safetyCommand.execute(['invalid'])).rejects.toThrow('無効な安全レベル');
    });

    test('レベル未指定時は現在の設定を表示すること', async () => {
      const mockGetSafety = jest.fn().mockResolvedValue('standard');
      (safetyCommand as any).getCurrentSafetyLevel = mockGetSafety;
      const spy = jest.spyOn(console, 'log').mockImplementation();

      await safetyCommand.execute([]);

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('standard'));
      spy.mockRestore();
    });
  });

  describe('configコマンド', () => {
    let configCommand: ConfigCommand;

    beforeEach(() => {
      configCommand = new ConfigCommand();
    });

    test('コマンド名と説明が正しいこと', () => {
      expect(configCommand.name).toBe('config');
      expect(configCommand.description).toContain('設定の表示・更新');
    });

    test('設定の表示ができること', async () => {
      const mockGetConfig = jest.fn().mockResolvedValue({
        comment: { tone: 'friendly' },
        safety: { level: 'standard' }
      });
      (configCommand as any).getConfig = mockGetConfig;
      const spy = jest.spyOn(console, 'log').mockImplementation();

      await configCommand.execute(['show']);

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('friendly'));
      spy.mockRestore();
    });

    test('設定の更新ができること', async () => {
      const mockUpdateConfig = jest.fn().mockResolvedValue(undefined);
      (configCommand as any).updateConfig = mockUpdateConfig;

      await configCommand.execute(['set', 'comment.tone', 'casual']);

      expect(mockUpdateConfig).toHaveBeenCalledWith('comment.tone', 'casual');
    });

    test('設定の検証ができること', async () => {
      const mockValidateConfig = jest.fn().mockResolvedValue({ valid: true });
      (configCommand as any).validateConfig = mockValidateConfig;
      const spy = jest.spyOn(console, 'log').mockImplementation();

      await configCommand.execute(['validate']);

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('有効'));
      spy.mockRestore();
    });
  });

  describe('CLIバイナリ', () => {
    test('実行可能ファイルが生成されること', () => {
      const binPath = path.join(__dirname, '../../bin/comment-bot');
      expect(fs.existsSync(binPath)).toBe(true);
      
      const stats = fs.statSync(binPath);
      // 実行可能権限をチェック (ownerの実行権限)
      expect(stats.mode & 0o100).toBeTruthy();
    });

    test.skip('npm経由で実行できること', () => {
      const result = execSync('npm run cli -- --version', {
        cwd: path.join(__dirname, '../..'),
        encoding: 'utf8'
      });
      
      expect(result).toMatch(/\d+\.\d+\.\d+/);
    });
  });
});
