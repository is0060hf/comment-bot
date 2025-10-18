import { SafetyLevel } from '../../config/types';

import { Command } from './base';

/**
 * safetyコマンド - 安全フィルタのレベルを設定
 */
export class SafetyCommand extends Command {
  name = 'safety';
  description = '安全フィルタのレベルを設定します (strict/standard/relaxed)';

  async execute(args: string[]): Promise<void> {
    const { positional } = this.parseArgs(args);

    if (positional.length === 0) {
      // 現在の設定を表示
      const level = await this.getCurrentSafetyLevel();
      console.log(`現在の安全レベル: ${level}`);
      return;
    }

    const level = positional[0];
    if (!level || !this.isValidSafetyLevel(level)) {
      throw new Error(`無効な安全レベル: ${level}。有効な値: strict, standard, relaxed`);
    }

    await this.setSafetyLevel(level as SafetyLevel);
    console.log(`✅ 安全レベルを ${level} に設定しました`);
  }

  private isValidSafetyLevel(level: string): boolean {
    return ['strict', 'standard', 'relaxed'].includes(level);
  }

  private async getCurrentSafetyLevel(): Promise<string> {
    // 実際の実装では、実行中のプロセスから現在の設定を取得
    return 'standard';
  }

  private async setSafetyLevel(level: SafetyLevel): Promise<void> {
    // 実際の実装では、実行中のプロセスに設定変更を通知
    console.log(`安全レベルを ${level} に変更中...`);
  }
}
