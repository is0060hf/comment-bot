/**
 * Tsumiki AITDD - Red Phase
 * エージェント通信APIのテスト
 */

import { NextRequest } from 'next/server';
import { POST as updateStatus } from '../../src/app/api/agent/status/route';
import { POST as reportComment } from '../../src/app/api/agent/comment/route';
import { POST as reportError } from '../../src/app/api/agent/error/route';
import { GET as getCommands } from '../../src/app/api/agent/commands/route';

// モックの設定
jest.mock('../../src/lib/auth', () => ({
  verifyAgentAuth: jest.fn(),
}));

jest.mock('../../src/lib/agent-store', () => ({
  agentStore: {
    updateStatus: jest.fn(),
    addComment: jest.fn(),
    addError: jest.fn(),
    getCommands: jest.fn(),
    clearCommands: jest.fn(),
  },
}));

describe('Agent API Routes', () => {
  const mockAuth = require('../../src/lib/auth');
  const { agentStore } = require('../../src/lib/agent-store');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.verifyAgentAuth.mockResolvedValue(true);
  });

  describe('POST /api/agent/status', () => {
    it('should update agent status', async () => {
      const statusData = {
        agent: 'running',
        stt: 'connected',
        youtube: 'authenticated',
        safety: 'enabled',
        uptime: 3600,
        sessionComments: 5,
      };

      agentStore.updateStatus.mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/agent/status', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(statusData),
      });

      const response = await updateStatus(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(agentStore.updateStatus).toHaveBeenCalledWith(statusData);
    });

    it('should require authentication', async () => {
      mockAuth.verifyAgentAuth.mockResolvedValue(false);

      const request = new NextRequest('http://localhost:3000/api/agent/status', {
        method: 'POST',
        body: JSON.stringify({ agent: 'running' }),
      });

      const response = await updateStatus(request);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: 'Unauthorized',
      });
    });

    it('should validate status data', async () => {
      const invalidData = {
        agent: 'invalid-status',
      };

      const request = new NextRequest('http://localhost:3000/api/agent/status', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(invalidData),
      });

      const response = await updateStatus(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Invalid status data',
      });
    });
  });

  describe('POST /api/agent/comment', () => {
    it('should report a new comment', async () => {
      const commentData = {
        content: 'すごく面白い配信ですね！',
        confidence: 0.9,
        status: 'posted',
        timestamp: new Date().toISOString(),
      };

      agentStore.addComment.mockResolvedValue('comment-123');

      const request = new NextRequest('http://localhost:3000/api/agent/comment', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(commentData),
      });

      const response = await reportComment(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBe('comment-123');
      expect(agentStore.addComment).toHaveBeenCalledWith(commentData);
    });

    it('should handle blocked comments', async () => {
      const blockedComment = {
        content: '不適切なコメント',
        confidence: 0.7,
        status: 'blocked',
        blockReason: 'safety_filter',
        timestamp: new Date().toISOString(),
      };

      agentStore.addComment.mockResolvedValue('comment-456');

      const request = new NextRequest('http://localhost:3000/api/agent/comment', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(blockedComment),
      });

      const response = await reportComment(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(agentStore.addComment).toHaveBeenCalledWith(blockedComment);
    });

    it('should validate comment data', async () => {
      const invalidComment = {
        // content is missing
        confidence: 0.9,
      };

      const request = new NextRequest('http://localhost:3000/api/agent/comment', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(invalidComment),
      });

      const response = await reportComment(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Invalid comment data',
      });
    });
  });

  describe('POST /api/agent/error', () => {
    it('should report an error', async () => {
      const errorData = {
        type: 'stt_error',
        message: 'Failed to connect to STT service',
        severity: 'warning',
        timestamp: new Date().toISOString(),
      };

      agentStore.addError.mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/agent/error', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(errorData),
      });

      const response = await reportError(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(agentStore.addError).toHaveBeenCalledWith(errorData);
    });

    it('should handle critical errors', async () => {
      const criticalError = {
        type: 'youtube_auth',
        message: 'YouTube authentication failed',
        severity: 'critical',
        timestamp: new Date().toISOString(),
      };

      agentStore.addError.mockResolvedValue(true);

      const request = new NextRequest('http://localhost:3000/api/agent/error', {
        method: 'POST',
        headers: {
          'X-Agent-Key': 'test-key',
        },
        body: JSON.stringify(criticalError),
      });

      const response = await reportError(request);

      expect(response.status).toBe(200);
      expect(agentStore.addError).toHaveBeenCalledWith(criticalError);
    });
  });

  describe('GET /api/agent/commands', () => {
    it('should get pending commands', async () => {
      const commands = [
        { id: 'cmd-1', type: 'pause', timestamp: new Date().toISOString() },
        { id: 'cmd-2', type: 'resume', timestamp: new Date().toISOString() },
      ];

      agentStore.getCommands.mockResolvedValue(commands);

      const request = new NextRequest('http://localhost:3000/api/agent/commands', {
        method: 'GET',
        headers: {
          'X-Agent-Key': 'test-key',
        },
      });

      const response = await getCommands(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.commands).toEqual(commands);
      expect(agentStore.getCommands).toHaveBeenCalled();
    });

    it('should clear commands after retrieval', async () => {
      const commands = [
        { id: 'cmd-1', type: 'stop', timestamp: new Date().toISOString() },
      ];

      agentStore.getCommands.mockResolvedValue(commands);

      const request = new NextRequest('http://localhost:3000/api/agent/commands', {
        method: 'GET',
        headers: {
          'X-Agent-Key': 'test-key',
        },
      });

      await getCommands(request);

      expect(agentStore.clearCommands).toHaveBeenCalled();
    });

    it('should return empty array when no commands', async () => {
      agentStore.getCommands.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/agent/commands', {
        method: 'GET',
        headers: {
          'X-Agent-Key': 'test-key',
        },
      });

      const response = await getCommands(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.commands).toEqual([]);
    });
  });
});
