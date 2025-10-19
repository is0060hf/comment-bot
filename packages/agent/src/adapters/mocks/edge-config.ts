/**
 * Tsumiki AITDD - Green Phase
 * タスク42: Edge Configモック実装
 */

export class MockEdgeConfigClient {
  private mockData: Map<string, any> = new Map();
  private _isEnabled: boolean = false;
  
  constructor() {
    // モックデータの初期化
  }

  setEnabled(enabled: boolean): void {
    this._isEnabled = enabled;
  }

  isEnabled(): boolean {
    return this._isEnabled;
  }

  setMockData(key: string, value: any): void {
    this.mockData.set(key, value);
  }

  async get(key: string): Promise<any> {
    if (!this._isEnabled) {
      throw new Error('Edge Config is not enabled');
    }
    return this.mockData.get(key) || null;
  }

  async getAll(): Promise<Record<string, any>> {
    if (!this._isEnabled) {
      throw new Error('Edge Config is not enabled');
    }
    const result: Record<string, any> = {};
    this.mockData.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  async has(key: string): Promise<boolean> {
    if (!this._isEnabled) {
      return false;
    }
    return this.mockData.has(key);
  }

  clearCache(key?: string): void {
    // モックなのでキャッシュクリアは何もしない
  }

  on(event: string, handler: Function): void {
    // モックなのでイベントハンドリングは何もしない
  }
}

