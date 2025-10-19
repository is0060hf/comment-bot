/**
 * システムステータスインジケーターコンポーネント
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface StatusIndicatorProps {
  status: {
    agent: 'running' | 'stopped' | 'error';
    stt: 'connected' | 'disconnected' | 'connecting';
    youtube: 'authenticated' | 'unauthenticated' | 'error';
    safety: 'enabled' | 'disabled';
  };
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const getStatusColor = (value: string) => {
    switch (value) {
      case 'running':
      case 'connected':
      case 'authenticated':
      case 'enabled':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'stopped':
      case 'disconnected':
      case 'unauthenticated':
      case 'disabled':
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusText = (key: string, value: string) => {
    const statusMap: Record<string, Record<string, string>> = {
      agent: {
        running: '稼働中',
        stopped: '停止',
        error: 'エラー',
      },
      stt: {
        connected: '接続中',
        disconnected: '切断',
        connecting: '接続中...',
      },
      youtube: {
        authenticated: '認証済み',
        unauthenticated: '未認証',
        error: 'エラー',
      },
      safety: {
        enabled: '有効',
        disabled: '無効',
      },
    };
    return statusMap[key]?.[value] || value;
  };

  const items = [
    { key: 'agent', label: 'エージェント', value: status.agent },
    { key: 'stt', label: '音声認識', value: status.stt },
    { key: 'youtube', label: 'YouTube', value: status.youtube },
    { key: 'safety', label: '安全フィルター', value: status.safety },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map(({ key, label, value }) => (
        <div
          key={key}
          data-testid={`status-${key}`}
          className={cn(
            'flex flex-col items-center p-4 rounded-lg border',
            getStatusColor(value)
          )}
        >
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs mt-1">{getStatusText(key, value)}</div>
        </div>
      ))}
    </div>
  );
}
