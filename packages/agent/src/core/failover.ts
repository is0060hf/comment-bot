/**
 * フェイルオーバー設定
 */
export interface FailoverConfig {
  /** 最大リトライ回数 */
  maxRetries: number;
  /** リトライ間隔（ミリ秒） */
  retryDelayMs: number;
  /** ヘルスチェック間隔（ミリ秒） */
  healthCheckIntervalMs: number;
}

/**
 * プロバイダ情報
 */
export interface ProviderInfo {
  /** プロバイダインデックス */
  index: number;
  /** 健全性 */
  healthy: boolean;
  /** 総プロバイダ数 */
  totalProviders: number;
}

/**
 * ヘルスチェック可能なインターフェース
 */
export interface HealthCheckable {
  isHealthy(): Promise<boolean>;
}

/**
 * フェイルオーバーマネージャー
 * 複数のプロバイダ間でフェイルオーバーを管理
 */
export class FailoverManager<T extends HealthCheckable> {
  private currentProviderIndex = 0;
  private providerHealthStatus: boolean[];
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(
    private readonly providers: T[],
    private readonly config: FailoverConfig
  ) {
    if (providers.length === 0) {
      throw new Error('At least one provider is required');
    }

    // 初期状態では全てのプロバイダを健全とみなす
    this.providerHealthStatus = new Array(providers.length).fill(true);

    // 定期的なヘルスチェックを開始
    this.startHealthChecks();
  }

  /**
   * 操作を実行（フェイルオーバー付き）
   * @param operation プロバイダを使用した操作
   * @returns 操作結果
   * @throws 全てのプロバイダが失敗した場合
   */
  async execute<R>(operation: (provider: T) => Promise<R>): Promise<R> {
    const errors: Error[] = [];
    let lastError: Error | undefined;

    // 健全なプロバイダから順に試行
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const providerIndex = this.findNextHealthyProvider();

      if (providerIndex === -1) {
        // 健全なプロバイダがない場合は全てを試す
        break;
      }

      const provider = this.providers[providerIndex];
      if (!provider) continue;

      try {
        // 操作を実行
        const result = await operation(provider);

        // 成功したらこのプロバイダを優先的に使用
        this.currentProviderIndex = providerIndex;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        errors.push(lastError);

        // リトライ不可能なエラーの場合は即座に失敗
        if (this.isNonRetryableError(lastError)) {
          throw lastError;
        }

        // このプロバイダを一時的に不健全とマーク
        this.providerHealthStatus[providerIndex] = false;

        // リトライ前に待機
        if (attempt < this.providers.length - 1) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    // 全てのプロバイダが失敗
    throw new Error(`All providers failed: ${errors.map((e) => e.message).join(', ')}`);
  }

  /**
   * 全プロバイダのヘルスチェックを実行
   */
  async checkHealth(): Promise<void> {
    const healthChecks = this.providers.map(async (provider, index) => {
      try {
        const isHealthy = await provider.isHealthy();
        this.providerHealthStatus[index] = isHealthy;
      } catch {
        // ヘルスチェック自体が失敗した場合は不健全とみなす
        this.providerHealthStatus[index] = false;
      }
    });

    await Promise.all(healthChecks);
  }

  /**
   * 現在のプロバイダ情報を取得
   */
  getCurrentProvider(): ProviderInfo {
    return {
      index: this.currentProviderIndex,
      healthy: this.providerHealthStatus[this.currentProviderIndex] ?? false,
      totalProviders: this.providers.length,
    };
  }

  /**
   * クリーンアップ
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * 次の健全なプロバイダのインデックスを検索
   */
  private findNextHealthyProvider(): number {
    // 現在のプロバイダが健全ならそれを使用
    if (this.providerHealthStatus[this.currentProviderIndex]) {
      return this.currentProviderIndex;
    }

    // 健全なプロバイダを検索
    for (let i = 0; i < this.providers.length; i++) {
      if (this.providerHealthStatus[i]) {
        return i;
      }
    }

    // 健全なプロバイダがない場合
    return 0; // 最初のプロバイダから再試行
  }

  /**
   * 定期的なヘルスチェックを開始
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth().catch((error) => {
        console.error('Health check failed:', error);
      });
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * リトライ不可能なエラーかどうかを判定
   */
  private isNonRetryableError(error: Error): boolean {
    // エラーオブジェクトにretryableプロパティがある場合はそれを使用
    if ('retryable' in error && typeof error.retryable === 'boolean') {
      return !error.retryable;
    }

    // デフォルトではリトライ可能
    return false;
  }

  /**
   * 指定時間待機
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
