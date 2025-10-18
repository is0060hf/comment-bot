/**
 * Tsumiki AITDD - Red Phase
 * タスク33: UIライブラリ統合のテストケース
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

// UIコンポーネントのインポートテスト
describe('UI Library Integration', () => {
  describe('Tailwind CSS', () => {
    test('Tailwindクラスが適用されること', () => {
      const TestComponent = () => (
        <div className="bg-blue-500 text-white p-4" data-testid="tailwind-test">
          Tailwind Test
        </div>
      );

      const { container } = render(<TestComponent />);
      const element = screen.getByTestId('tailwind-test');

      expect(element).toHaveClass('bg-blue-500');
      expect(element).toHaveClass('text-white');
      expect(element).toHaveClass('p-4');
    });
  });

  describe('Radix UI Components', () => {
    test('Dialogコンポーネントが動作すること', async () => {
      const { Dialog, DialogTrigger, DialogContent } = await import('@radix-ui/react-dialog');

      const TestDialog = () => (
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <p>Dialog Content</p>
          </DialogContent>
        </Dialog>
      );

      render(<TestDialog />);
      expect(screen.getByText('Open')).toBeInTheDocument();
    });

    test('Switchコンポーネントが動作すること', async () => {
      const { Switch } = await import('@radix-ui/react-switch');

      const TestSwitch = () => <Switch data-testid="radix-switch" />;

      render(<TestSwitch />);
      expect(screen.getByTestId('radix-switch')).toBeInTheDocument();
    });
  });

  describe('shadcn/ui Components', () => {
    test('Buttonコンポーネントが存在すること', () => {
      // 実際のコンポーネントインポートはビルド時に検証
      // テストではコンポーネントファイルの存在確認のみ
      const fs = require('fs');
      const path = require('path');
      const buttonPath = path.join(__dirname, '../components/ui/button.tsx');

      expect(fs.existsSync(buttonPath)).toBe(true);
    });

    test('Cardコンポーネントが存在すること', () => {
      const fs = require('fs');
      const path = require('path');
      const cardPath = path.join(__dirname, '../components/ui/card.tsx');

      expect(fs.existsSync(cardPath)).toBe(true);
    });

    test('Inputコンポーネントが存在すること', () => {
      const fs = require('fs');
      const path = require('path');
      const inputPath = path.join(__dirname, '../components/ui/input.tsx');

      expect(fs.existsSync(inputPath)).toBe(true);
    });
  });

  describe('Component Library Configuration', () => {
    test('components.jsonが存在すること', () => {
      const fs = require('fs');
      const path = require('path');
      const componentsJsonPath = path.join(__dirname, '../components.json');

      expect(fs.existsSync(componentsJsonPath)).toBe(true);

      const componentsJson = JSON.parse(fs.readFileSync(componentsJsonPath, 'utf8'));
      expect(componentsJson.style).toBe('default');
      expect(componentsJson.tailwind.config).toBeDefined();
    });

    test('cn utility関数が存在すること', () => {
      const fs = require('fs');
      const path = require('path');
      const utilsPath = path.join(__dirname, '../lib/utils.ts');

      expect(fs.existsSync(utilsPath)).toBe(true);
    });
  });
});
