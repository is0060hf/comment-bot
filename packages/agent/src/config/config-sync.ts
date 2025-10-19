/**
 * Tsumiki AITDD - Green Phase
 * タスク42: 設定同期機能実装
 */

import { EventEmitter } from 'events';
import { ConfigManager } from './config-manager';
import { AppConfig } from './types';
import { EdgeConfigClient } from '../adapters/edge-config';
import { Logger } from '../logging/logger';
import _ from 'lodash';

export interface ConfigSyncOptions {
  configManager: ConfigManager;
  edgeConfigClient: EdgeConfigClient;
  syncInterval?: number;
  enableAutoSync?: boolean;
  logger?: Logger;
  conflictStrategy?: 'local' | 'remote' | 'safety-first' | 'timestamp';
}

export interface SyncResult {
  success: boolean;
  updatedFields: string[];
  conflicts?: ConflictInfo[];
  error?: Error;
}

export interface ConflictInfo {
  field: string;
  localValue: any;
  remoteValue: any;
  resolution: 'local' | 'remote';
  reason?: string;
}

export class ConfigSync extends EventEmitter {
  private options: ConfigSyncOptions;
  private syncTimer?: NodeJS.Timeout;
  private isSyncing = false;

  constructor(options: ConfigSyncOptions) {
    super();
    
    this.options = {
      syncInterval: 60000, // 1分
      enableAutoSync: false,
      conflictStrategy: 'remote',
      ...options,
    };

    // enableAutoSyncがtrueの場合は、初期化後に別途startを呼ぶ
  }

  start(): void {
    if (this.syncTimer) {
      return;
    }

    // 初回同期
    this.sync().catch(error => {
      this.emit('syncError', error);
    });

    // 定期同期
    this.syncTimer = setInterval(() => {
      this.sync().catch(error => {
        this.emit('syncError', error);
      });
    }, this.options.syncInterval!);
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  async fetchEdgeConfig(): Promise<any> {
    if (!this.options.edgeConfigClient.isEnabled()) {
      return null;
    }

    try {
      return await this.options.edgeConfigClient.get('comment-bot-config');
    } catch (error) {
      this.options.logger?.error('Failed to fetch Edge Config', error as Error);
      throw error; // Re-throw the error so sync can handle it
    }
  }

  async sync(options?: { conflictStrategy?: ConfigSyncOptions['conflictStrategy'] }): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        updatedFields: [],
        error: new Error('Sync already in progress'),
      };
    }

    this.isSyncing = true;
    this.emit('beforeSync');

    try {
      // Edge Configから設定を取得
      const edgeConfig = await this.fetchEdgeConfig();
      if (!edgeConfig) {
        return {
          success: true,
          updatedFields: [],
        };
      }

      // 現在のローカル設定を読み込み
      const localConfig = await this.options.configManager.loadConfig();

      // 設定をマージ
      const strategy = options?.conflictStrategy || this.options.conflictStrategy;
      const mergedConfig = this.mergeConfigs(localConfig, edgeConfig, strategy);

      // バリデーション
      try {
        this.options.configManager.validateConfig(mergedConfig);
      } catch (validationError) {
        this.emit('syncError', {
          type: 'validation',
          message: (validationError as Error).message,
          error: validationError,
        });
        
        return {
          success: false,
          updatedFields: [],
          error: validationError as Error,
        };
      }

      // 更新されたフィールドを検出
      const updatedFields = this.detectUpdatedFields(localConfig, mergedConfig);

      // 設定を保存
      await this.options.configManager.saveConfig(mergedConfig);

      const result: SyncResult = {
        success: true,
        updatedFields,
      };

      this.emit('afterSync', result);
      return result;

    } catch (error) {
      const syncError = error as Error;
      this.emit('syncError', syncError);
      
      return {
        success: false,
        updatedFields: [],
        error: syncError,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  mergeConfigs(
    localConfig: AppConfig, 
    edgeConfig: any,
    strategy: ConfigSyncOptions['conflictStrategy'] = 'remote'
  ): AppConfig {
    // シークレット情報を保護
    const protectedPaths = [
      '_youtube.clientId',
      '_youtube.clientSecret', 
      '_youtube.refreshToken',
      'providers.apiKeys',
      'youtube.clientId',
      'youtube.clientSecret',
      'youtube.refreshToken',
    ];

    // Edge Configから保護されたパスを削除
    const sanitizedEdgeConfig = _.cloneDeep(edgeConfig);
    protectedPaths.forEach(path => {
      _.unset(sanitizedEdgeConfig, path);
    });

    // 安全性優先戦略の場合の特別処理
    if (strategy === 'safety-first' && sanitizedEdgeConfig.safety?.level && localConfig.safety?.level) {
      const safetyLevels = ['low', 'medium', 'high'];
      const edgeLevel = safetyLevels.indexOf(sanitizedEdgeConfig.safety.level);
      const localLevel = safetyLevels.indexOf(localConfig.safety.level);
      
      if (localLevel > edgeLevel) {
        // ローカルの方が厳しい場合は保持
        delete sanitizedEdgeConfig.safety.level;
      }
    }

    // ディープマージ（Edge Configの値が優先）
    return _.merge({}, localConfig, sanitizedEdgeConfig);
  }

  async detectConflicts(): Promise<ConflictInfo[]> {
    const localConfig = await this.options.configManager.loadConfig();
    const edgeConfig = await this.fetchEdgeConfig();
    
    if (!edgeConfig) {
      return [];
    }

    const conflicts: ConflictInfo[] = [];
    
    // 両方に存在するフィールドで値が異なるものを検出
    const checkConflicts = (localObj: any, remoteObj: any, path: string[] = []) => {
      for (const key in remoteObj) {
        const currentPath = [...path, key];
        const pathStr = currentPath.join('.');
        
        if (key in localObj) {
          if (typeof localObj[key] === 'object' && typeof remoteObj[key] === 'object') {
            checkConflicts(localObj[key], remoteObj[key], currentPath);
          } else if (localObj[key] !== remoteObj[key]) {
            // タイムスタンプベースの解決
            let resolution: 'local' | 'remote' = 'remote';
            let reason = 'Default to remote';
            
            if (pathStr.includes('lastModified')) {
              const localTime = new Date(localObj[key]).getTime();
              const remoteTime = new Date(remoteObj[key]).getTime();
              resolution = localTime > remoteTime ? 'local' : 'remote';
              reason = 'Newer timestamp wins';
            }
            
            conflicts.push({
              field: pathStr,
              localValue: localObj[key],
              remoteValue: remoteObj[key],
              resolution,
              reason,
            });
          }
        }
      }
    };
    
    checkConflicts(localConfig, edgeConfig);
    return conflicts;
  }

  private detectUpdatedFields(oldConfig: AppConfig, newConfig: AppConfig): string[] {
    const updatedFields: string[] = [];
    
    const detectChanges = (oldObj: any, newObj: any, path: string[] = []) => {
      for (const key in newObj) {
        const currentPath = [...path, key];
        const pathStr = currentPath.join('.');
        
        if (!(key in oldObj) || oldObj[key] !== newObj[key]) {
          if (typeof newObj[key] === 'object' && typeof oldObj[key] === 'object') {
            detectChanges(oldObj[key] || {}, newObj[key], currentPath);
          } else {
            updatedFields.push(pathStr);
          }
        }
      }
    };
    
    detectChanges(oldConfig, newConfig);
    return updatedFields;
  }
}
