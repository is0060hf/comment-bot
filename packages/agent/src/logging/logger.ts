/**
 * Tsumiki AITDD - Green Phase
 * タスク9: ロガー実装
 */

import * as fs from 'fs';
import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  level: LogLevel;
  logDir?: string;
  maxFileSize?: number;
  maxFiles?: number;
  console?: boolean;
  retentionDays?: number;
}

// LogEntry interface removed as it was not being used

export class Logger {
  private config: LoggerConfig;
  private currentStream?: WriteStream;
  private currentFileSize = 0;
  private fileIndex = 0;

  constructor(config: LoggerConfig) {
    this.config = {
      maxFileSize: 10 * 1024 * 1024, // 10MB default
      maxFiles: 5,
      console: true,
      retentionDays: 7,
      ...config,
    };

    if (this.config.logDir) {
      this.ensureLogDir();
      // ファイル出力は最初のログ書き込み時に初期化
    }
  }

  private ensureLogDir(): void {
    if (this.config.logDir && !fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private maskPII(message: string): string {
    let masked = message;

    // メールアドレス
    masked = masked.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      '[EMAIL]'
    );

    // 電話番号（日本の形式）
    masked = masked.replace(
      /(\+81-?|0)\d{1,4}-?\d{1,4}-?\d{4}/g,
      '[PHONE]'
    );

    // IPアドレス
    masked = masked.replace(
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
      '[IP]'
    );

    // URLのクエリパラメータ
    masked = masked.replace(
      /(\?|&)[^=]+=[^&\s]+/g,
      '[PARAMS]'
    );

    return masked;
  }

  private formatMessage(level: LogLevel, message: string, error?: Error, context?: any): string {
    const levelName = LogLevel[level];
    const timestamp = new Date().toISOString();
    const maskedMessage = this.maskPII(message);

    let formatted = `[${timestamp}] [${levelName}] ${maskedMessage}`;

    if (error) {
      formatted += `\n  Error: ${error.message}`;
      if (error.stack) {
        // スタックトレースもPIIマスクする
        const maskedStack = this.maskPII(error.stack);
        formatted += `\n  Stack: ${maskedStack}`;
      }
    }

    if (context) {
      // コンテキストもPIIマスクする
      const maskedContext = JSON.stringify(context, null, 2);
      const maskedContextStr = this.maskPII(maskedContext);
      formatted += `\n  Context: ${maskedContextStr}`;
    }

    return formatted;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private writeToFile(message: string): void {
    if (!this.config.logDir) return;

    // ストリームが未初期化なら初期化
    if (!this.currentStream) {
      this.rotateLogFile();
    }

    const messageSize = Buffer.byteLength(message + '\n');
    
    if (this.currentFileSize + messageSize > (this.config.maxFileSize || 0)) {
      this.rotateLogFile();
    }

    this.currentStream!.write(message + '\n');
    this.currentFileSize += messageSize;
  }

  private rotateLogFile(): void {
    if (!this.config.logDir) return;

    if (this.currentStream) {
      this.currentStream.end();
    }

    // ディレクトリが存在することを確認
    this.ensureLogDir();

    // 古いファイルを削除
    this.cleanupOldFiles();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `app-${timestamp}.log`;
    const filepath = path.resolve(this.config.logDir, filename);

    this.currentStream = createWriteStream(filepath, { flags: 'a' });
    this.currentFileSize = 0;
    this.fileIndex++;
  }

  private cleanupOldFiles(): void {
    if (!this.config.logDir) return;

    // ディレクトリが存在しない場合は何もしない
    if (!fs.existsSync(this.config.logDir)) return;

    try {
      const files = fs.readdirSync(this.config.logDir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.config.logDir!, f),
          mtime: fs.statSync(path.join(this.config.logDir!, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // 最大ファイル数を超えた分を削除
      if (this.config.maxFiles && files.length >= this.config.maxFiles) {
        files.slice(this.config.maxFiles - 1).forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      // ファイルシステムエラーは無視
    }
  }

  private log(level: LogLevel, message: string, error?: Error, context?: any): string {
    if (!this.shouldLog(level)) return message;

    const formatted = this.formatMessage(level, message, error, context);

    // コンソール出力
    if (this.config.console) {
      if (level === LogLevel.ERROR) {
        console.error(formatted);
      } else if (level >= LogLevel.INFO) {
        console.log(formatted);
      }
    }

    // ファイル出力
    this.writeToFile(formatted);

    // フォーマットされたメッセージを返す（エラー情報も含む）
    return formatted;
  }

  debug(message: string, context?: any): string {
    if (!this.shouldLog(LogLevel.DEBUG)) return message;
    return this.log(LogLevel.DEBUG, message, undefined, context);
  }

  info(message: string, context?: any): string {
    return this.log(LogLevel.INFO, message, undefined, context);
  }

  warn(message: string, context?: any): string {
    return this.log(LogLevel.WARN, message, undefined, context);
  }

  error(message: string, error?: Error | any, context?: any): string {
    if (error && !(error instanceof Error)) {
      // errorがcontextの場合
      context = error;
      error = undefined;
    }
    return this.log(LogLevel.ERROR, message, error, context);
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  getLevel(): LogLevel {
    return this.config.level;
  }

  setConsoleOutput(enabled: boolean): void {
    this.config.console = enabled;
  }

  close(): void {
    if (this.currentStream) {
      this.currentStream.end();
      this.currentStream = undefined;
    }
  }

  async cleanup(): Promise<void> {
    if (!this.config.logDir || !this.config.retentionDays) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const files = fs.readdirSync(this.config.logDir);
    
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      
      const filepath = path.join(this.config.logDir, file);
      const stats = fs.statSync(filepath);
      
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filepath);
      }
    }
  }

  static fromEnv(): Logger {
    const level = process.env.LOG_LEVEL?.toUpperCase() as keyof typeof LogLevel;
    const logDir = process.env.LOG_DIR;

    return new Logger({
      level: level ? LogLevel[level] : LogLevel.INFO,
      logDir,
      console: process.env.LOG_CONSOLE !== 'false',
    });
  }
}
