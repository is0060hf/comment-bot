/**
 * Vercel Edge Config クライアント
 */

import { get, has, getAll } from '@vercel/edge-config';

export class EdgeConfigClient {
  /**
   * 指定されたキーの設定を取得
   */
  async getConfig<T = any>(key: string): Promise<T | null> {
    try {
      const config = await get(key);
      return config as T;
    } catch (error) {
      console.error('Failed to get Edge Config:', error);
      throw error;
    }
  }

  /**
   * 指定されたキーの設定が存在するかチェック
   */
  async hasConfig(key: string): Promise<boolean> {
    try {
      return await has(key);
    } catch (error) {
      console.error('Failed to check Edge Config:', error);
      return false;
    }
  }

  /**
   * すべての設定を取得
   */
  async getAllConfigs(): Promise<Record<string, any>> {
    try {
      const configs = await getAll();
      return configs || {};
    } catch (error) {
      console.error('Failed to get all Edge Configs:', error);
      throw error;
    }
  }
}
