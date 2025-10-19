/**
 * Tsumiki AITDD - Red Phase
 * 安全設定画面のテスト
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SafetyPage from '../../src/app/safety/page';
import { SafetySettingsForm } from '../../src/components/safety/SafetySettingsForm';
import { ModerationTest } from '../../src/components/safety/ModerationTest';

// モックデータ
const mockSafetyConfig = {
  level: 'standard' as const,
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

// APIモック
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Server Actionsモック
jest.mock('../../src/app/actions/safety', () => ({
  updateSafetySettings: jest.fn(),
  testModeration: jest.fn(),
}));

describe('Safety Page', () => {
  const mockApiClient = require('../../src/lib/api').apiClient;
  const { updateSafetySettings, testModeration } = require('../../src/app/actions/safety');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Safety Page', () => {
    it('should render safety page with settings and test sections', async () => {
      mockApiClient.get.mockResolvedValue({
        safety: mockSafetyConfig,
      });

      render(<SafetyPage />);

      // タイトルの確認
      expect(screen.getByText('安全設定')).toBeInTheDocument();

      // 各セクションが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByText('安全レベル設定')).toBeInTheDocument();
        expect(screen.getByText('モデレーションテスト')).toBeInTheDocument();
      });
    });

    it('should handle loading state', () => {
      mockApiClient.get.mockImplementation(() => new Promise(() => {}));

      render(<SafetyPage />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      mockApiClient.get.mockRejectedValue(new Error('API Error'));

      render(<SafetyPage />);

      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
      });
    });
  });

  describe('SafetySettingsForm', () => {
    it('should display safety settings form', () => {
      render(<SafetySettingsForm initialData={mockSafetyConfig} />);

      // 安全レベル選択
      expect(screen.getByLabelText('安全レベル')).toBeInTheDocument();
      expect(screen.getByLabelText('安全レベル')).toHaveValue('standard');

      // 有効/無効スイッチ
      expect(screen.getByLabelText('安全フィルタリングを有効にする')).toBeChecked();

      // 不確実な場合のブロック
      expect(screen.getByLabelText('不確実な場合もブロック')).not.toBeChecked();

      // 各カテゴリの閾値
      expect(screen.getByLabelText('ヘイトスピーチ')).toHaveValue(0.7);
      expect(screen.getByLabelText('ハラスメント')).toHaveValue(0.7);
      expect(screen.getByLabelText('自傷行為')).toHaveValue(0.8);
    });

    it('should handle form submission', async () => {
      const user = userEvent.setup();
      updateSafetySettings.mockResolvedValue({ success: true });

      render(<SafetySettingsForm initialData={mockSafetyConfig} />);

      // 安全レベルを変更
      const levelSelect = screen.getByLabelText('安全レベル');
      await user.selectOptions(levelSelect, 'strict');

      // 不確実な場合のブロックを有効化
      const uncertaintySwitch = screen.getByLabelText('不確実な場合もブロック');
      await user.click(uncertaintySwitch);

      // 保存ボタンをクリック
      const saveButton = screen.getByText('設定を保存');
      await user.click(saveButton);

      await waitFor(() => {
        expect(updateSafetySettings).toHaveBeenCalledWith(
          expect.objectContaining({
            level: 'strict',
            blockOnUncertainty: true,
          })
        );
      });

      // 成功メッセージ
      expect(screen.getByText('安全設定を更新しました')).toBeInTheDocument();
    });

    it('should update thresholds based on safety level', async () => {
      const user = userEvent.setup();

      render(<SafetySettingsForm initialData={mockSafetyConfig} />);

      // strictレベルに変更
      const levelSelect = screen.getByLabelText('安全レベル');
      await user.selectOptions(levelSelect, 'strict');

      // 閾値が自動的に更新される
      await waitFor(() => {
        expect(screen.getByLabelText('ヘイトスピーチ')).toHaveValue(0.5);
        expect(screen.getByLabelText('ハラスメント')).toHaveValue(0.5);
      });
    });

    it('should validate threshold values', async () => {
      const user = userEvent.setup();

      render(<SafetySettingsForm initialData={mockSafetyConfig} />);

      // 無効な値を入力
      const hateSlider = screen.getByLabelText('ヘイトスピーチ');
      fireEvent.change(hateSlider, { target: { value: '1.5' } });

      // 保存ボタンをクリック
      const saveButton = screen.getByText('設定を保存');
      await user.click(saveButton);

      // エラーメッセージ
      await waitFor(() => {
        expect(screen.getByText(/0から1の間で設定してください/)).toBeInTheDocument();
      });
    });
  });

  describe('ModerationTest', () => {
    it('should display moderation test component', () => {
      render(<ModerationTest />);

      expect(screen.getByText('モデレーションテスト')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('テストするテキストを入力')).toBeInTheDocument();
      expect(screen.getByText('テスト実行')).toBeInTheDocument();
    });

    it('should handle moderation test', async () => {
      const user = userEvent.setup();
      testModeration.mockResolvedValue({
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
      });

      render(<ModerationTest />);

      // テキストを入力
      const textarea = screen.getByPlaceholderText('テストするテキストを入力');
      await user.type(textarea, 'これは安全なコメントです');

      // テスト実行
      const testButton = screen.getByText('テスト実行');
      await user.click(testButton);

      // 結果表示
      await waitFor(() => {
        expect(screen.getByText('判定: 承認')).toBeInTheDocument();
        expect(screen.getByText('ヘイトスピーチ: 10%')).toBeInTheDocument();
      });
    });

    it('should handle flagged content', async () => {
      const user = userEvent.setup();
      testModeration.mockResolvedValue({
        success: true,
        result: {
          flagged: true,
          categories: ['hate', 'harassment'],
          scores: {
            hate: 0.9,
            harassment: 0.85,
            'self-harm': 0.0,
            sexual: 0.0,
            violence: 0.1,
            illegal: 0.0,
            graphic: 0.0,
          },
          suggestedAction: 'block',
        },
      });

      render(<ModerationTest />);

      const textarea = screen.getByPlaceholderText('テストするテキストを入力');
      await user.type(textarea, '不適切なコンテンツ');

      const testButton = screen.getByText('テスト実行');
      await user.click(testButton);

      await waitFor(() => {
        expect(screen.getByText('判定: ブロック')).toBeInTheDocument();
        expect(screen.getByText('検出されたカテゴリ: hate, harassment')).toBeInTheDocument();
      });
    });

    it('should validate empty input', async () => {
      const user = userEvent.setup();

      render(<ModerationTest />);

      // 空のままテスト実行
      const testButton = screen.getByText('テスト実行');
      await user.click(testButton);

      // エラーメッセージ
      expect(screen.getByText('テキストを入力してください')).toBeInTheDocument();
    });
  });
});
