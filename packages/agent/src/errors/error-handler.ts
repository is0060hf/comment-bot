/**
 * Tsumiki AITDD - Green Phase
 * タスク9: エラーハンドラー実装
 */

import { Logger } from '../logging/logger';

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  API = 'API',
  RATE_LIMIT = 'RATE_LIMIT',
  AUTHENTICATION = 'AUTHENTICATION',
  VALIDATION = 'VALIDATION',
  CONFIGURATION = 'CONFIGURATION',
  UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
  category: ErrorCategory;
  isRetryable: boolean;
  context?: any;
  stack?: string;
  maxRetries?: number;
  retryDelay?: number;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    isRetryable = false,
    context?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.isRetryable = isRetryable;
    this.context = context;
  }
}

export class RetryableError extends AppError {
  constructor(
    message: string,
    category: ErrorCategory,
    maxRetries = 3,
    retryDelay = 1000,
    context?: any
  ) {
    super(message, category, true, context);
    this.name = 'RetryableError';
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }
}

export class NonRetryableError extends AppError {
  constructor(message: string, category: ErrorCategory, context?: any) {
    super(message, category, false, context);
    this.name = 'NonRetryableError';
  }
}

export interface ErrorHandlerConfig {
  logger: Logger;
  enableStackTrace?: boolean;
  maxRetries?: number;
  retryDelayMs?: number;
  reportErrors?: boolean;
  errorReporter?: (error: any) => Promise<void>;
}

interface ErrorStatistics {
  total: number;
  byCategory: Record<string, number>;
  timeline: Array<{
    timestamp: Date;
    category: ErrorCategory;
  }>;
}

interface RecoveryStrategy {
  shouldRetry: boolean;
  retryDelay: number;
  alternativeAction: string;
}

interface RetryOptions {
  useExponentialBackoff?: boolean;
}

export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private statistics: ErrorStatistics = {
    total: 0,
    byCategory: {},
    timeline: [],
  };

  constructor(config: ErrorHandlerConfig) {
    this.config = {
      enableStackTrace: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      reportErrors: false,
      ...config,
    };
  }

  handle(error: Error | AppError, context?: any): AppError {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
      if (context) {
        appError.context = { ...appError.context, ...context };
      }
    } else {
      // エラーをカテゴライズ
      const category = this.categorizeError(error);
      const isRetryable = this.isRetryable(error, category);
      
      appError = new AppError(error.message, category, isRetryable, context);
      appError.stack = error.stack;
      
      // レート制限エラーの場合、リトライ遅延を設定
      if (category === ErrorCategory.RATE_LIMIT) {
        appError.retryDelay = 5000; // 5秒
      }
    }

    // スタックトレース処理
    if (!this.config.enableStackTrace) {
      appError.stack = undefined;
    }

    // ログ出力
    const logContext = {
      category: appError.category,
      isRetryable: appError.isRetryable,
      context: appError.context,
      stack: appError.stack,
    };

    if (appError instanceof NonRetryableError) {
      this.config.logger.error(`Non-retryable error: ${appError.message}`, logContext);
    } else {
      this.config.logger.error(appError.message, logContext);
    }

    // 統計更新
    this.updateStatistics(appError);

    return appError;
  }

  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name?.toLowerCase() || '';

    // ネットワークエラー
    if (
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('network') ||
      message.includes('fetch failed')
    ) {
      return ErrorCategory.NETWORK;
    }

    // レート制限
    if (
      message.includes('rate limit') ||
      name.includes('ratelimit')
    ) {
      return ErrorCategory.RATE_LIMIT;
    }

    // 認証エラー
    if (
      message.includes('unauthorized') ||
      message.includes('invalid token') ||
      message.includes('authentication')
    ) {
      return ErrorCategory.AUTHENTICATION;
    }

    // バリデーションエラー
    if (
      name.includes('validation') ||
      message.includes('invalid input')
    ) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  private isRetryable(_error: Error, category: ErrorCategory): boolean {
    // カテゴリ別のリトライ可否
    switch (category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.RATE_LIMIT:
      case ErrorCategory.API:
        return true;
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.VALIDATION:
      case ErrorCategory.CONFIGURATION:
        return false;
      default:
        return false;
    }
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt < this.config.maxRetries!) {
      try {
        return await operation();
      } catch (_error) {
        lastError = _error as Error;
        const appError = this.handle(_error as Error);

        if (!appError.isRetryable) {
          throw _error;
        }
        
        attempt++;
        if (attempt >= this.config.maxRetries!) {
          throw _error;
        }

        const delay = options?.useExponentialBackoff
          ? this.config.retryDelayMs! * Math.pow(2, attempt - 1)
          : appError.retryDelay || this.config.retryDelayMs!;

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  getRecoveryStrategy(error: AppError): RecoveryStrategy {
    const baseDelay = error.retryDelay || this.config.retryDelayMs || 1000;

    switch (error.category) {
      case ErrorCategory.NETWORK:
        return {
          shouldRetry: true,
          retryDelay: baseDelay,
          alternativeAction: 'Check network connection and retry',
        };
      
      case ErrorCategory.RATE_LIMIT:
        return {
          shouldRetry: true,
          retryDelay: baseDelay * 5, // より長い待機
          alternativeAction: 'Wait for rate limit reset and backoff',
        };
      
      case ErrorCategory.AUTHENTICATION:
        return {
          shouldRetry: false,
          retryDelay: 0,
          alternativeAction: 'Check credentials and reauthenticate',
        };
      
      case ErrorCategory.VALIDATION:
        return {
          shouldRetry: false,
          retryDelay: 0,
          alternativeAction: 'Check input data and fix_input',
        };
      
      default:
        return {
          shouldRetry: error.isRetryable,
          retryDelay: baseDelay,
          alternativeAction: 'Check logs for details',
        };
    }
  }

  private updateStatistics(error: AppError): void {
    this.statistics.total++;
    
    if (!this.statistics.byCategory[error.category]) {
      this.statistics.byCategory[error.category] = 0;
    }
    this.statistics.byCategory[error.category]!++;

    this.statistics.timeline.push({
      timestamp: new Date(),
      category: error.category,
    });

    // 古いエントリを削除（24時間以上前）
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    this.statistics.timeline = this.statistics.timeline.filter(
      entry => entry.timestamp > cutoff
    );
  }

  getStatistics(options?: { since?: Date }): {
    total: number;
    byCategory: Record<string, number>;
  } {
    if (options?.since) {
      const filtered = this.statistics.timeline.filter(
        entry => entry.timestamp > options.since!
      );

      const byCategory: Record<string, number> = {};
      filtered.forEach(entry => {
        if (!byCategory[entry.category]) {
          byCategory[entry.category] = 0;
        }
        byCategory[entry.category]!++;
      });

      return {
        total: filtered.length,
        byCategory,
      };
    }

    return {
      total: this.statistics.total,
      byCategory: { ...this.statistics.byCategory },
    };
  }

  async handleAndReport(error: Error, context?: any): Promise<AppError> {
    const appError = this.handle(error, context);

    if (this.config.reportErrors && this.config.errorReporter) {
      // 重大なエラーのみ報告
      const isCritical = error.name?.includes('Critical') || 
                        error.message.includes('Critical');
      
      if (isCritical) {
        await this.config.errorReporter({
          message: appError.message,
          category: appError.category,
          severity: 'critical',
          context: appError.context,
          stack: appError.stack,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return appError;
  }
}
