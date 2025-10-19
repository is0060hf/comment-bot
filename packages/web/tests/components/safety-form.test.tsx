/**
 * 安全設定フォームコンポーネントの単体テスト
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SafetySettingsForm } from '../../src/components/safety/SafetySettingsForm';
import { ModerationTest } from '../../src/components/safety/ModerationTest';

// モックデータ
const mockSafetyConfig = {
  level: 'standard',
  enabled: true,
  blockOnUncertainty: false,
  moderationThresholds: {
    hate: 0.7,
    harassment: 0.7,
    'self-harm': 0.8,
    sexual: 0.8,
    violence: 0.7,
    illegal: 0.9,
    graphic: 0.8,
  },
};

// Server Actionsモック
jest.mock('../../src/app/actions/safety', () => ({
  updateSafetySettings: jest.fn().mockResolvedValue({ success: true }),
  testModeration: jest.fn().mockResolvedValue({
    success: true,
    result: {
      flagged: false,
      categories: [],
      scores: {
        hate: 0.1,
        harassment: 0.1,
        'self-harm': 0.0,
        sexual: 0.0,
        violence: 0.1,
        illegal: 0.0,
        graphic: 0.0,
      },
      suggestedAction: 'approve',
    },
  }),
}));

describe('Safety Components', () => {
  describe('SafetySettingsForm', () => {
    it('should render safety settings form', () => {
      render(<SafetySettingsForm initialData={mockSafetyConfig} />);

      // フォーム要素の確認
      expect(screen.getByLabelText('安全レベル')).toBeInTheDocument();
      expect(screen.getByLabelText('安全フィルタリングを有効にする')).toBeInTheDocument();
      expect(screen.getByLabelText('不確実な場合もブロック')).toBeInTheDocument();
      expect(screen.getByText('設定を保存')).toBeInTheDocument();
    });

    it('should display category thresholds when enabled', () => {
      render(<SafetySettingsForm initialData={mockSafetyConfig} />);

      // カテゴリ別閾値の確認
      expect(screen.getByText('カテゴリ別閾値')).toBeInTheDocument();
      expect(screen.getByText('ヘイトスピーチ')).toBeInTheDocument();
      expect(screen.getByText('ハラスメント')).toBeInTheDocument();
      expect(screen.getByText('自傷行為')).toBeInTheDocument();
    });
  });

  describe('ModerationTest', () => {
    it('should render moderation test component', () => {
      render(<ModerationTest />);

      // コンポーネント要素の確認
      expect(screen.getByPlaceholderText('テストするテキストを入力')).toBeInTheDocument();
      expect(screen.getByText('テスト実行')).toBeInTheDocument();
    });
  });
});
