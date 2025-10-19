import { Transform } from 'stream';
import { STTPort, STTResult } from '../../src/ports/stt';

describe('STT Streaming', () => {
  let mockAdapter: jest.Mocked<STTPort>;
  let transform: Transform;

  beforeEach(() => {
    mockAdapter = {
      transcribe: jest.fn(),
      startStreaming: jest.fn(),
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    transform = new Transform({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        this.push(chunk);
        callback();
      }
    });
  });

  describe('startStreaming', () => {
    it('should handle streaming results', async () => {
      const mockResults: STTResult[] = [
        {
          transcript: 'これは',
          confidence: 0.9,
          language: 'ja',
          timestamp: Date.now(),
          segments: [],
          isFinal: false,
          provider: 'mock'
        },
        {
          transcript: 'テストです',
          confidence: 0.95,
          language: 'ja',
          timestamp: Date.now(),
          segments: [],
          isFinal: true,
          provider: 'mock'
        }
      ];

      mockAdapter.startStreaming.mockImplementation(async (t: Transform) => {
        // Simulate streaming results
        setTimeout(() => {
          t.push(mockResults[0]);
        }, 100);
        setTimeout(() => {
          t.push(mockResults[1]);
          t.end();
        }, 200);
        return t;
      });

      const results: STTResult[] = [];
      transform.on('data', (data) => {
        results.push(data);
      });

      await mockAdapter.startStreaming(transform);

      // Wait for results
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(results).toHaveLength(2);
      expect(results[0].transcript).toBe('これは');
      expect(results[0].isFinal).toBe(false);
      expect(results[1].transcript).toBe('テストです');
      expect(results[1].isFinal).toBe(true);
    });

    it('should handle errors', async () => {
      const errorMessage = 'Streaming failed';
      mockAdapter.startStreaming.mockImplementation(async (t: Transform) => {
        setTimeout(() => {
          t.emit('error', new Error(errorMessage));
        }, 100);
        return t;
      });

      const errorPromise = new Promise((_, reject) => {
        transform.on('error', reject);
      });

      await mockAdapter.startStreaming(transform);

      await expect(errorPromise).rejects.toThrow(errorMessage);
    });
  });
});