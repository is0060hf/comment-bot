/**
 * Tsumiki AITDD - Green Phase
 * タスク43: プロセス管理実装
 */

import { EventEmitter } from 'events';
import * as http from 'http';
import * as fs from 'fs';
import * as net from 'net';
import { Logger } from '../logging/logger';

export interface ProcessManagerOptions {
  logger?: Logger;
  gracefulShutdownTimeout?: number;
  exitOnError?: boolean;
}

interface CleanupTask {
  name: string;
  handler: () => Promise<void>;
}

interface ShutdownOptions {
  signal?: string;
  exitCode?: number;
}

export class ProcessManager extends EventEmitter {
  private options: ProcessManagerOptions;
  private logger?: Logger;
  private isShuttingDown = false;
  private cleanupTasks: CleanupTask[] = [];
  private httpServers: Map<string, http.Server> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private fileHandles: Map<string, fs.promises.FileHandle> = new Map();
  private webSockets: Map<string, any> = new Map();
  private running = false;
  private signalHandlers: Map<NodeJS.Signals, () => void> = new Map();

  constructor(options: ProcessManagerOptions = {}) {
    super();
    
    this.options = {
      gracefulShutdownTimeout: 30000, // 30秒
      exitOnError: true,
      ...options,
    };

    this.logger = options.logger;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    // シグナルハンドラーを登録
    this.registerSignalHandlers();

    // 未処理の例外とPromiseリジェクションをキャッチ
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));

    this.emit('started');
    this.logger?.info('Process manager started');
  }

  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;

    // シグナルハンドラーを削除
    this.unregisterSignalHandlers();

    // プロセスイベントハンドラーを削除
    process.removeListener('uncaughtException', this.handleUncaughtException);
    process.removeListener('unhandledRejection', this.handleUnhandledRejection);

    this.emit('stopped');
    this.logger?.info('Process manager stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private registerSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    signals.forEach(signal => {
      const handler = () => {
        this.logger?.info(`Received ${signal} signal`);
        
        const code = signal === 'SIGINT' ? 130 : 143;
        this.emit('shutdown', { signal, code });

        this.shutdown({ signal, exitCode: code }).catch(error => {
          this.logger?.error('Shutdown failed', error);
          process.exit(1);
        });
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    });
  }

  private unregisterSignalHandlers(): void {
    this.signalHandlers.forEach((handler, signal) => {
      process.removeListener(signal, handler);
    });
    this.signalHandlers.clear();
  }

  private handleUncaughtException(error: Error): void {
    this.logger?.error('Uncaught exception', error);
    this.emit('error', error);

    if (this.options.exitOnError) {
      this.shutdown({ exitCode: 1 }).catch(() => {
        process.exit(1);
      });
    }
  }

  private handleUnhandledRejection(reason: any): void {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.logger?.error('Unhandled rejection', error);
    this.emit('error', error);

    if (this.options.exitOnError) {
      this.shutdown({ exitCode: 1 }).catch(() => {
        process.exit(1);
      });
    }
  }

  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.isShuttingDown) {
      this.logger?.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const exitCode = options.exitCode ?? 0;

    this.logger?.info('Starting graceful shutdown');

    try {
      // タイムアウトを設定
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Graceful shutdown timeout'));
        }, this.options.gracefulShutdownTimeout!);
      });

      // クリーンアップタスクを実行
      const cleanupPromise = this.runCleanupTasks();

      await Promise.race([cleanupPromise, timeoutPromise]);

      this.logger?.info('Cleanup completed successfully');
    } catch (error) {
      this.logger?.warn('Graceful shutdown timeout or error', error);
    }

    // プロセスを終了
    process.exit(exitCode);
  }

  private async runCleanupTasks(): Promise<void> {
    // HTTPサーバーを停止
    await this.closeHttpServers();

    // タイマーをクリア
    this.clearTimers();

    // ファイルハンドルをクローズ
    await this.closeFileHandles();

    // WebSocketをクローズ
    this.closeWebSockets();

    // カスタムクリーンアップタスクを実行
    await this.runCustomCleanupTasks();
  }

  private async closeHttpServers(): Promise<void> {
    const closePromises = Array.from(this.httpServers.entries()).map(
      ([name, server]) => {
        return new Promise<void>((resolve) => {
          server.close((error) => {
            if (error) {
              this.logger?.error('Failed to close HTTP server', { server: name, error });
            } else {
              this.logger?.info(`HTTP server closed: ${name}`);
            }
            resolve();
          });
        });
      }
    );

    await Promise.all(closePromises);
  }

  clearTimers(): void {
    this.timers.forEach((timer, name) => {
      clearTimeout(timer);
      this.logger?.debug(`Timer cleared: ${name}`);
    });
    this.timers.clear();

    this.intervals.forEach((interval, name) => {
      clearInterval(interval);
      this.logger?.debug(`Interval cleared: ${name}`);
    });
    this.intervals.clear();
  }

  private async closeFileHandles(): Promise<void> {
    const closePromises = Array.from(this.fileHandles.entries()).map(
      async ([name, handle]) => {
        try {
          await handle.close();
          this.logger?.info(`File handle closed: ${name}`);
        } catch (error) {
          this.logger?.error('Failed to close file handle', { handle: name, error });
        }
      }
    );

    await Promise.all(closePromises);
  }

  private closeWebSockets(): void {
    this.webSockets.forEach((ws, name) => {
      if (ws.readyState === 1) { // OPEN
        ws.close();
        this.logger?.info(`WebSocket closed: ${name}`);
      }
    });
    this.webSockets.clear();
  }

  private async runCustomCleanupTasks(): Promise<void> {
    const taskPromises = this.cleanupTasks.map(async (task) => {
      try {
        await task.handler();
        this.logger?.info(`Cleanup task completed: ${task.name}`);
      } catch (error) {
        this.logger?.error('Cleanup task failed', { task: task.name, error });
      }
    });

    await Promise.all(taskPromises);
  }

  registerCleanupTask(name: string, handler: () => Promise<void>): void {
    this.cleanupTasks.push({ name, handler });
  }

  registerHttpServer(name: string, server: http.Server): void {
    this.httpServers.set(name, server);
  }

  registerTimer(name: string, timer: NodeJS.Timeout): void {
    this.timers.set(name, timer);
  }

  registerInterval(name: string, interval: NodeJS.Timeout): void {
    this.intervals.set(name, interval);
  }

  registerFileHandle(name: string, handle: fs.promises.FileHandle): void {
    this.fileHandles.set(name, handle);
  }

  registerWebSocket(name: string, ws: any): void {
    this.webSockets.set(name, ws);
  }
}

