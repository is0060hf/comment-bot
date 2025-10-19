/**
 * 設定フォームコンポーネントの単体テスト
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
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

// Server Actionsモック
jest.mock('../../src/app/actions/settings', () => ({
  updateSettings: jest.fn().mockResolvedValue({ success: true }),
}));

describe('Settings Forms', () => {
  describe('CommentSettingsForm', () => {
    it('should render comment settings form', () => {
      render(<CommentSettingsForm initialData={mockCommentConfig} />);

      // フォーム要素の確認
      expect(screen.getByLabelText('トーン')).toBeInTheDocument();
      expect(screen.getByLabelText('キャラクター設定')).toBeInTheDocument();
      expect(screen.getByLabelText('最小文字数')).toBeInTheDocument();
      expect(screen.getByLabelText('最大文字数')).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeInTheDocument();
    });
  });

  describe('TimingSettingsForm', () => {
    it('should render timing settings form', () => {
      render(<TimingSettingsForm initialData={mockTimingConfig} />);

      // フォーム要素の確認
      expect(screen.getByLabelText('最小投稿間隔（秒）')).toBeInTheDocument();
      expect(screen.getByLabelText('10分あたりの最大コメント数')).toBeInTheDocument();
      expect(screen.getByLabelText('連続投稿後のクールダウン（秒）')).toBeInTheDocument();
      expect(screen.getByLabelText('重複防止期間（秒）')).toBeInTheDocument();
      expect(screen.getByText('保存')).toBeInTheDocument();
    });
  });
});
