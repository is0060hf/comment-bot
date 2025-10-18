import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockSTTAdapter } from '../../../src/adapters/mocks/stt';
import { STTPort, STTResult, STTError } from '../../../src/ports/stt';

describe('MockSTTAdapter', () => {
  let adapter: MockSTTAdapter;

  beforeEach(() => {
    adapter = new MockSTTAdapter();
  });

  describe('transcribe', () => {
    it('should return predefined transcript for specific audio pattern', async () => {
      const mockAudio = Buffer.from('mock-audio-content');

      const result = await adapter.transcribe(mockAudio);

      expect(result).toMatchObject({
        transcript: expect.any(String),
        confidence: 0.95,
        language: 'ja',
        timestamp: expect.any(Number),
      });
      expect(result.transcript.length).toBeGreaterThan(0);
    });

    it('should handle empty audio buffer', async () => {
      const emptyAudio = Buffer.alloc(0);

      await expect(adapter.transcribe(emptyAudio)).rejects.toThrow(STTError);
    });

    it('should simulate random failures based on configuration', async () => {
      const failingAdapter = new MockSTTAdapter({ failureRate: 1.0 });
      const mockAudio = Buffer.from('mock-audio-content');

      await expect(failingAdapter.transcribe(mockAudio)).rejects.toThrow(STTError);
    });
  });

  describe('startStreaming', () => {
    it('should emit transcript chunks for streaming mode', (done) => {
      const chunks: STTResult[] = [];

      const stream = adapter.startStreaming();
      stream.on('data', (chunk: STTResult) => {
        chunks.push(chunk);
        if (chunks.length === 3) {
          stream.destroy();
        }
      });

      stream.on('close', () => {
        expect(chunks).toHaveLength(3);
        expect(chunks[0]?.transcript).toBeTruthy();
        expect(chunks[0]?.confidence).toBeGreaterThan(0);
        done();
      });

      // Simulate audio input
      stream.write(Buffer.from('chunk1'));
      stream.write(Buffer.from('chunk2'));
      stream.write(Buffer.from('chunk3'));
    });

    it('should handle stream errors', (done) => {
      const failingAdapter = new MockSTTAdapter({ failureRate: 1.0 });
      const stream = failingAdapter.startStreaming();

      stream.on('error', (error) => {
        expect(error).toBeInstanceOf(STTError);
        done();
      });

      stream.write(Buffer.from('audio-chunk'));
    });
  });

  describe('isHealthy', () => {
    it('should return health status', async () => {
      const health = await adapter.isHealthy();

      expect(health).toBe(true);
    });

    it('should return false when configured unhealthy', async () => {
      const unhealthyAdapter = new MockSTTAdapter({ healthy: false });
      const health = await unhealthyAdapter.isHealthy();

      expect(health).toBe(false);
    });
  });
});
