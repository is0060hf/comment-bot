import * as fs from 'fs';
import * as yaml from 'yaml';

import { AppConfigSchema } from '../../config/types';

import { Command } from './base';

/**
 * configコマンド - 設定の表示・更新
 */
export class ConfigCommand extends Command {
  name = 'config';
  description = '設定の表示・更新を行います';

  async execute(args: string[]): Promise<void> {
    const { positional } = this.parseArgs(args);

    if (positional.length === 0 || positional[0] === 'show') {
      // 設定を表示
      const config = await this.getConfig();
      console.log(yaml.stringify(config));
      return;
    }

    const subCommand = positional[0];

    switch (subCommand) {
      case 'set':
        if (positional.length < 3) {
          throw new Error('使用法: config set <key> <value>');
        }
        await this.updateConfig(positional[1]!, positional[2]!);
        break;

      case 'validate':
        const result = await this.validateConfig();
        if (result.valid) {
          console.log('✅ 設定は有効です');
        } else {
          console.error('❌ 設定に問題があります:', result.errors);
        }
        break;

      default:
        throw new Error(`不明なサブコマンド: ${subCommand}`);
    }
  }

  private async getConfig(): Promise<Record<string, unknown>> {
    const configPath = './config.yaml';
    
    if (!fs.existsSync(configPath)) {
      console.log('設定ファイルが見つかりません。デフォルト設定を使用します。');
      return {};
    }

    const content = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(content) as Record<string, unknown>;
  }

  private async updateConfig(key: string, value: string): Promise<void> {
    const configPath = './config.yaml';
    let config: Record<string, unknown> = {};

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      config = yaml.parse(content) as Record<string, unknown>;
    }

    // ネストされたキーをサポート（例: comment.tone）
    const keys = key.split('.');
    let current: Record<string, unknown> = config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }

    // 値を適切な型に変換
    const lastKey = keys[keys.length - 1]!;
    let parsedValue: unknown = value;

    // 数値への変換を試みる
    if (/^\d+$/.test(value)) {
      parsedValue = parseInt(value, 10);
    } else if (/^\d+\.\d+$/.test(value)) {
      parsedValue = parseFloat(value);
    } else if (value === 'true' || value === 'false') {
      parsedValue = value === 'true';
    }

    current[lastKey] = parsedValue;

    // ファイルに保存
    fs.writeFileSync(configPath, yaml.stringify(config));
    console.log(`✅ ${key} を ${value} に設定しました`);
  }

  private async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const config = await this.getConfig();
      AppConfigSchema.parse(config);
      return { valid: true };
    } catch (error) {
      if (error instanceof Error) {
        return { valid: false, errors: [error.message] };
      }
      return { valid: false, errors: ['不明なエラー'] };
    }
  }
}

