/**
 * Tsumiki AITDD - Green Phase
 * タスク42: Edge Configクライアント実装
 */

import { EventEmitter } from 'events';

export interface EdgeConfigOptions {
  connectionString?: string;
  cacheTime?: number;
  retryAttempts?: number;
  retryDelay?: number;
  sanitize?: boolean;
}

interface CacheEntry {
  value: any;
  timestamp: number;
}

export class EdgeConfigClient extends EventEmitter {
  private options: EdgeConfigOptions;
  private cache: Map<string, CacheEntry> = new Map();
  private edgeConfig: any;

  constructor(options: EdgeConfigOptions = {}) {
    super();
    
    this.options = {
      cacheTime: 60000, // 1分
      retryAttempts: 3,
      retryDelay: 1000,
      sanitize: true,
      ...options,
    };

    // 接続文字列の解決（オプション > 環境変数）
    if (!this.options.connectionString && process.env.EDGE_CONFIG) {
      this.options.connectionString = process.env.EDGE_CONFIG;
    }

    // Edge Configの動的インポート（オプショナル依存）
    if (this.options.connectionString) {
      try {
        this.edgeConfig = require('@vercel/edge-config');
      } catch (error) {
        // @vercel/edge-configがインストールされていない場合
        this.edgeConfig = null;
      }
    }
  }

  isEnabled(): boolean {
    return !!(this.options.connectionString && this.edgeConfig);
  }

  async get(key: string): Promise<any> {
    if (!this.isEnabled()) {
      throw new Error('Edge Config is not enabled');
    }

    // キャッシュチェック
    const cached = this.getFromCache(key);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const value = await this.getWithRetry(key);
      
      if (value !== null) {
        // サニタイズ
        const sanitized = this.options.sanitize ? this.sanitizeConfig(value) : value;
        this.setCache(key, sanitized);
        return sanitized;
      }
      
      return null;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getAll(): Promise<Record<string, any>> {
    if (!this.isEnabled()) {
      throw new Error('Edge Config is not enabled');
    }

    const cacheKey = '__all__';
    const cached = this.getFromCache(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const values = await this.edgeConfig.getAll();
      
      if (values) {
        const sanitized = this.options.sanitize ? this.sanitizeConfig(values) : values;
        this.setCache(cacheKey, sanitized);
        return sanitized;
      }
      
      return {};
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      return await this.edgeConfig.has(key);
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  private async getWithRetry(key: string): Promise<any> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.options.retryAttempts!; attempt++) {
      try {
        return await this.edgeConfig.get(key);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.options.retryAttempts! - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, this.options.retryDelay!)
          );
        }
      }
    }
    
    throw lastError;
  }

  private getFromCache(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > this.options.cacheTime!) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  private setCache(key: string, value: any): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  private sanitizeConfig(config: any): any {
    if (!config || typeof config !== 'object') {
      return config;
    }

    const sanitized = { ...config };

    // YouTubeの認証情報を除外
    if (sanitized.youtube) {
      delete sanitized.youtube.clientId;
      delete sanitized.youtube.clientSecret;
      delete sanitized.youtube.refreshToken;
      
      if (Object.keys(sanitized.youtube).length === 0) {
        delete sanitized.youtube;
      }
    }

    // プロバイダーのAPIキーを除外
    if (sanitized.providers?.apiKeys) {
      delete sanitized.providers.apiKeys;
    }

    // 再帰的にサニタイズ
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeConfig(sanitized[key]);
      }
    }

    return sanitized;
  }
}

