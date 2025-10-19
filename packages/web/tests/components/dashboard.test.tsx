/**
 * Tsumiki AITDD - Red Phase
 * ダッシュボードコンポーネントのテスト
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../../src/app/dashboard/page';
import { DashboardStats } from '../../src/components/dashboard/DashboardStats';
import { StatusIndicator } from '../../src/components/dashboard/StatusIndicator';
import { RecentComments } from '../../src/components/dashboard/RecentComments';
import { StreamInfo } from '../../src/components/dashboard/StreamInfo';

// モックデータ
const mockStats = {
  totalComments: 42,
  sessionComments: 5,
  averageInterval: 45,
  uptime: '02:34:56',
};

const mockStatus = {
  agent: 'running' as const,
  stt: 'connected' as const,
  youtube: 'authenticated' as const,
  safety: 'enabled' as const,
};

const mockRecentComments = [
  {
    id: '1',
    content: 'すごく面白い配信ですね！',
    timestamp: new Date().toISOString(),
    confidence: 0.9,
    status: 'posted' as const,
  },
  {
    id: '2',
    content: 'なるほど、勉強になります',
    timestamp: new Date(Date.now() - 60000).toISOString(),
    confidence: 0.85,
    status: 'posted' as const,
  },
  {
    id: '3',
    content: '不適切なコメント',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    confidence: 0.7,
    status: 'blocked' as const,
    blockReason: 'safety_filter',
  },
];

const mockStreamInfo = {
  title: 'プログラミング配信 #42',
  viewerCount: 1234,
  duration: '01:23:45',
  chatId: 'abc123',
};

// APIモック
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

describe('Dashboard', () => {
  const mockApiClient = require('../../src/lib/api').apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Dashboard Page', () => {
    it('should render dashboard with all components', async () => {
      mockApiClient.get.mockImplementation((path: string) => {
        if (path === '/api/stats') return Promise.resolve(mockStats);
        if (path === '/api/status') return Promise.resolve(mockStatus);
        if (path === '/api/comments/recent') return Promise.resolve(mockRecentComments);
        if (path === '/api/stream/info') return Promise.resolve(mockStreamInfo);
        return Promise.reject(new Error('Unknown path'));
      });

      render(<Dashboard />);

      // データがロードされるまで待つ
      await waitFor(() => {
        // タイトルの確認
        expect(screen.getByText('ダッシュボード')).toBeInTheDocument();
        
        // 各セクションが表示される
        expect(screen.getByText('統計情報')).toBeInTheDocument();
        expect(screen.getByText('システムステータス')).toBeInTheDocument();
        expect(screen.getByText('最近のコメント')).toBeInTheDocument();
        expect(screen.getByText('配信情報')).toBeInTheDocument();
      });
    });

    it('should handle loading state', () => {
      mockApiClient.get.mockImplementation(() => new Promise(() => {})); // 永遠にpending

      render(<Dashboard />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      mockApiClient.get.mockRejectedValue(new Error('API Error'));

      render(<Dashboard />);

      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
      });
    });
  });

  describe('DashboardStats Component', () => {
    it('should display statistics correctly', () => {
      render(<DashboardStats stats={mockStats} />);

      expect(screen.getByText('総コメント数')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      
      expect(screen.getByText('セッション中')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      
      expect(screen.getByText('平均間隔')).toBeInTheDocument();
      expect(screen.getByText('45秒')).toBeInTheDocument();
      
      expect(screen.getByText('稼働時間')).toBeInTheDocument();
      expect(screen.getByText('02:34:56')).toBeInTheDocument();
    });
  });

  describe('StatusIndicator Component', () => {
    it('should show correct status indicators', () => {
      render(<StatusIndicator status={mockStatus} />);

      // エージェント状態
      const agentStatus = screen.getByTestId('status-agent');
      expect(agentStatus).toHaveTextContent('エージェント');
      expect(agentStatus).toHaveClass('text-green-600');

      // STT状態
      const sttStatus = screen.getByTestId('status-stt');
      expect(sttStatus).toHaveTextContent('音声認識');
      expect(sttStatus).toHaveClass('text-green-600');

      // YouTube状態
      const youtubeStatus = screen.getByTestId('status-youtube');
      expect(youtubeStatus).toHaveTextContent('YouTube');
      expect(youtubeStatus).toHaveClass('text-green-600');

      // 安全フィルター状態
      const safetyStatus = screen.getByTestId('status-safety');
      expect(safetyStatus).toHaveTextContent('安全フィルター');
      expect(safetyStatus).toHaveClass('text-green-600');
    });

    it('should show error states', () => {
      const errorStatus = {
        agent: 'stopped' as const,
        stt: 'disconnected' as const,
        youtube: 'unauthenticated' as const,
        safety: 'disabled' as const,
      };

      render(<StatusIndicator status={errorStatus} />);

      const agentStatus = screen.getByTestId('status-agent');
      expect(agentStatus).toHaveClass('text-red-600');
    });
  });

  describe('RecentComments Component', () => {
    it('should display recent comments', () => {
      render(<RecentComments comments={mockRecentComments} />);

      // 投稿されたコメント
      expect(screen.getByText('すごく面白い配信ですね！')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument(); // 信頼度

      // ブロックされたコメント
      const blockedComment = screen.getByText('不適切なコメント');
      expect(blockedComment).toBeInTheDocument();
      expect(screen.getByText('ブロック済み')).toBeInTheDocument();
    });

    it('should show empty state', () => {
      render(<RecentComments comments={[]} />);

      expect(screen.getByText('まだコメントがありません')).toBeInTheDocument();
    });
  });

  describe('StreamInfo Component', () => {
    it('should display stream information', () => {
      render(<StreamInfo info={mockStreamInfo} />);

      expect(screen.getByText('プログラミング配信 #42')).toBeInTheDocument();
      expect(screen.getByText('1,234人')).toBeInTheDocument();
      expect(screen.getByText('01:23:45')).toBeInTheDocument();
    });

    it('should show no stream state', () => {
      render(<StreamInfo info={null} />);

      expect(screen.getByText('配信情報なし')).toBeInTheDocument();
    });
  });
});
