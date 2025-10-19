/**
 * Tsumiki AITDD - Red Phase
 * 設定画面のテスト
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SettingsPage from '../../src/app/settings/page';
import { CommentSettingsForm } from '../../src/components/settings/CommentSettingsForm';
import { TimingSettingsForm } from '../../src/components/settings/TimingSettingsForm';

// モックデータ
const mockCommentConfig = {
  tone: 'friendly',
  characterPersona: 'フレンドリーな視聴者',
  targetLength: { min: 20, max: 100 },
  encouragedExpressions: ['なるほど！', 'すごい！'],
  ngWords: ['NG1', 'NG2'],
  emojiPolicy: {
    enabled: true,
    maxCount: 3,
    allowedEmojis: ['👍', '😊', '🎉'],
  },
};

const mockTimingConfig = {
  minimumInterval: 30,
  maxCommentsPerTenMinutes: 5,
  cooldownAfterBurst: 120,
  deduplicationWindow: 300,
};

// APIモック
jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// Server Actionsモック
jest.mock('../../src/app/actions/settings', () => ({
  updateSettings: jest.fn(),
}));

describe('Settings Page', () => {
  const mockApiClient = require('../../src/lib/api').apiClient;
  const { updateSettings } = require('../../src/app/actions/settings');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Settings Page', () => {
    it('should render settings page with all forms', async () => {
      mockApiClient.get.mockResolvedValue({
        comment: mockCommentConfig,
        timing: mockTimingConfig,
      });

      render(<SettingsPage />);

      // タイトルの確認
      expect(screen.getByText('設定')).toBeInTheDocument();

      // 各セクションが表示されるまで待つ
      await waitFor(() => {
        expect(screen.getByText('コメント設定')).toBeInTheDocument();
        expect(screen.getByText('タイミング設定')).toBeInTheDocument();
      });
    });

    it('should handle loading state', () => {
      mockApiClient.get.mockImplementation(() => new Promise(() => {}));

      render(<SettingsPage />);

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      mockApiClient.get.mockRejectedValue(new Error('API Error'));

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/)).toBeInTheDocument();
      });
    });
  });

  describe('CommentSettingsForm', () => {
    it('should display comment settings form', () => {
      render(<CommentSettingsForm initialData={mockCommentConfig} />);

      // トーン選択
      expect(screen.getByLabelText('トーン')).toBeInTheDocument();
      expect(screen.getByLabelText('トーン')).toHaveValue('friendly');

      // キャラクター設定
      expect(screen.getByLabelText('キャラクター設定')).toBeInTheDocument();
      expect(screen.getByLabelText('キャラクター設定')).toHaveValue('フレンドリーな視聴者');

      // コメント長さ
      expect(screen.getByLabelText('最小文字数')).toHaveValue(20);
      expect(screen.getByLabelText('最大文字数')).toHaveValue(100);

      // NGワード
      expect(screen.getByText('NG1')).toBeInTheDocument();
      expect(screen.getByText('NG2')).toBeInTheDocument();

      // 絵文字設定
      expect(screen.getByLabelText('絵文字を有効にする')).toBeChecked();
      expect(screen.getByLabelText('最大絵文字数')).toHaveValue(3);
    });

    it('should handle form submission', async () => {
      const user = userEvent.setup();
      updateSettings.mockResolvedValue({ success: true });

      render(<CommentSettingsForm initialData={mockCommentConfig} />);

      // トーンを変更
      const toneSelect = screen.getByLabelText('トーン');
      await user.selectOptions(toneSelect, 'casual');

      // キャラクター設定を変更
      const personaInput = screen.getByLabelText('キャラクター設定');
      await user.clear(personaInput);
      await user.type(personaInput, 'カジュアルな視聴者');

      // 保存ボタンをクリック
      const saveButton = screen.getByText('保存');
      await user.click(saveButton);

      await waitFor(() => {
        expect(updateSettings).toHaveBeenCalledWith({
          comment: expect.objectContaining({
            tone: 'casual',
            characterPersona: 'カジュアルな視聴者',
          }),
        });
      });

      // 成功メッセージ
      expect(screen.getByText('設定を保存しました')).toBeInTheDocument();
    });

    it('should validate form inputs', async () => {
      const user = userEvent.setup();

      render(<CommentSettingsForm initialData={mockCommentConfig} />);

      // 最小文字数を最大より大きく設定
      const minInput = screen.getByLabelText('最小文字数');
      await user.clear(minInput);
      await user.type(minInput, '200');

      // 保存ボタンをクリック
      const saveButton = screen.getByText('保存');
      await user.click(saveButton);

      // エラーメッセージ
      await waitFor(() => {
        expect(screen.getByText(/最小文字数は最大文字数以下にしてください/)).toBeInTheDocument();
      });
    });

    it('should handle NG words management', async () => {
      const user = userEvent.setup();

      render(<CommentSettingsForm initialData={mockCommentConfig} />);

      // NGワードを追加
      const ngWordInput = screen.getByPlaceholderText('NGワードを入力');
      await user.type(ngWordInput, 'NG3');
      
      const addButton = screen.getByText('追加');
      await user.click(addButton);

      expect(screen.getByText('NG3')).toBeInTheDocument();

      // NGワードを削除
      const deleteButtons = screen.getAllByText('×');
      await user.click(deleteButtons[0]);

      expect(screen.queryByText('NG1')).not.toBeInTheDocument();
    });
  });

  describe('TimingSettingsForm', () => {
    it('should display timing settings form', () => {
      render(<TimingSettingsForm initialData={mockTimingConfig} />);

      expect(screen.getByLabelText('最小投稿間隔（秒）')).toHaveValue(30);
      expect(screen.getByLabelText('10分あたりの最大コメント数')).toHaveValue(5);
      expect(screen.getByLabelText('連続投稿後のクールダウン（秒）')).toHaveValue(120);
      expect(screen.getByLabelText('重複防止期間（秒）')).toHaveValue(300);
    });

    it('should handle timing form submission', async () => {
      const user = userEvent.setup();
      updateSettings.mockResolvedValue({ success: true });

      render(<TimingSettingsForm initialData={mockTimingConfig} />);

      // 最小投稿間隔を変更
      const intervalInput = screen.getByLabelText('最小投稿間隔（秒）');
      await user.clear(intervalInput);
      await user.type(intervalInput, '45');

      // 保存ボタンをクリック
      const saveButton = screen.getByText('保存');
      await user.click(saveButton);

      await waitFor(() => {
        expect(updateSettings).toHaveBeenCalledWith({
          timing: expect.objectContaining({
            minimumInterval: 45,
          }),
        });
      });
    });

    it('should validate timing inputs', async () => {
      const user = userEvent.setup();

      render(<TimingSettingsForm initialData={mockTimingConfig} />);

      // 負の値を入力
      const intervalInput = screen.getByLabelText('最小投稿間隔（秒）');
      await user.clear(intervalInput);
      await user.type(intervalInput, '-10');

      const saveButton = screen.getByText('保存');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText(/0以上の値を入力してください/)).toBeInTheDocument();
      });
    });
  });
});
