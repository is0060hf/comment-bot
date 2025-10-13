import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { FailoverManager } from '../../src/core/failover';
import { STTPort, STTResult, STTError } from '../../src/ports/stt';

describe('FailoverManager', () => {
  let manager: FailoverManager<STTPort>;
  let mockProviders: Array<jest.Mocked<STTPort>>;

  beforeEach(() => {
    // 3つのモックプロバイダを作成
    mockProviders = [
      {
        transcribe: jest.fn<STTPort['transcribe']>(),
        startStreaming: jest.fn<STTPort['startStreaming']>(),
        isHealthy: jest.fn<STTPort['isHealthy']>()
      },
      {
        transcribe: jest.fn<STTPort['transcribe']>(),
        startStreaming: jest.fn<STTPort['startStreaming']>(),
        isHealthy: jest.fn<STTPort['isHealthy']>()
      },
      {
        transcribe: jest.fn<STTPort['transcribe']>(),
        startStreaming: jest.fn<STTPort['startStreaming']>(),
        isHealthy: jest.fn<STTPort['isHealthy']>()
      }
    ];

    manager = new FailoverManager(mockProviders, {
      maxRetries: 3,
      retryDelayMs: 100,
      healthCheckIntervalMs: 5000
    });
  });

  afterEach(() => {
    // マネージャーのクリーンアップ
    manager.destroy();
  });

  describe('execute', () => {
    it('should use first provider when available', async () => {
      const expectedResult: STTResult = {
        transcript: 'test',
        confidence: 0.9,
        language: 'ja',
        timestamp: Date.now()
      };

      mockProviders[0]!.transcribe.mockResolvedValueOnce(expectedResult);

      const result = await manager.execute(
        async (provider) => provider.transcribe(Buffer.from('test'))
      );

      expect(result).toEqual(expectedResult);
      expect(mockProviders[0]!.transcribe).toHaveBeenCalledTimes(1);
      expect(mockProviders[1]!.transcribe).not.toHaveBeenCalled();
      expect(mockProviders[2]!.transcribe).not.toHaveBeenCalled();
    });

    it('should failover to next provider on error', async () => {
      const expectedResult: STTResult = {
        transcript: 'fallback',
        confidence: 0.85,
        language: 'ja',
        timestamp: Date.now()
      };

      // 最初のプロバイダは失敗
      mockProviders[0]!.transcribe.mockRejectedValueOnce(
        new STTError('Provider 1 failed', 'PROVIDER_ERROR', true)
      );

      // 2番目のプロバイダは成功
      mockProviders[1]!.transcribe.mockResolvedValueOnce(expectedResult);

      const result = await manager.execute(
        async (provider) => provider.transcribe(Buffer.from('test'))
      );

      expect(result).toEqual(expectedResult);
      expect(mockProviders[0]!.transcribe).toHaveBeenCalledTimes(1);
      expect(mockProviders[1]!.transcribe).toHaveBeenCalledTimes(1);
      expect(mockProviders[2]!.transcribe).not.toHaveBeenCalled();
    });

    it('should try all providers before failing', async () => {
      // 全てのプロバイダが失敗
      mockProviders.forEach((provider, index) => {
        provider.transcribe.mockRejectedValueOnce(
          new STTError(`Provider ${index + 1} failed`, 'PROVIDER_ERROR', true)
        );
      });

      await expect(
        manager.execute(async (provider) => provider.transcribe(Buffer.from('test')))
      ).rejects.toThrow('All providers failed');
    });

    it('should not retry non-retryable errors', async () => {
      // リトライ不可能なエラー
      mockProviders[0]!.transcribe.mockRejectedValueOnce(
        new STTError('Invalid input', 'INVALID_INPUT', false)
      );

      await expect(
        manager.execute(async (provider) => provider.transcribe(Buffer.from('test')))
      ).rejects.toThrow('Invalid input');

      expect(mockProviders[0]!.transcribe).toHaveBeenCalledTimes(1);
      expect(mockProviders[1]!.transcribe).not.toHaveBeenCalled();
    });
  });

  describe('health checks', () => {
    it('should mark unhealthy providers', async () => {
      // プロバイダ1を不健全に設定
      mockProviders[0]!.isHealthy.mockResolvedValueOnce(false);
      mockProviders[1]!.isHealthy.mockResolvedValueOnce(true);
      mockProviders[2]!.isHealthy.mockResolvedValueOnce(true);

      // ヘルスチェックを実行
      await manager.checkHealth();

      // プロバイダ1は不健全なのでプロバイダ2が使用される
      const expectedResult: STTResult = {
        transcript: 'provider2',
        confidence: 0.9,
        language: 'ja',
        timestamp: Date.now()
      };

      mockProviders[1]!.transcribe.mockResolvedValueOnce(expectedResult);

      const result = await manager.execute(
        async (provider) => provider.transcribe(Buffer.from('test'))
      );

      expect(result).toEqual(expectedResult);
      expect(mockProviders[0]!.transcribe).not.toHaveBeenCalled();
      expect(mockProviders[1]!.transcribe).toHaveBeenCalledTimes(1);
    });

    it('should recover unhealthy providers', async () => {
      // プロバイダ1を一時的に不健全に
      mockProviders[0]!.isHealthy.mockResolvedValueOnce(false);
      await manager.checkHealth();

      // プロバイダ1が回復
      mockProviders[0]!.isHealthy.mockResolvedValueOnce(true);
      await manager.checkHealth();

      // プロバイダ1が再び使用可能に
      const expectedResult: STTResult = {
        transcript: 'recovered',
        confidence: 0.95,
        language: 'ja',
        timestamp: Date.now()
      };

      mockProviders[0]!.transcribe.mockResolvedValueOnce(expectedResult);

      const result = await manager.execute(
        async (provider) => provider.transcribe(Buffer.from('test'))
      );

      expect(result).toEqual(expectedResult);
      expect(mockProviders[0]!.transcribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentProvider', () => {
    it('should return current active provider info', () => {
      const info = manager.getCurrentProvider();

      expect(info).toEqual({
        index: 0,
        healthy: true,
        totalProviders: 3
      });
    });
  });
});
