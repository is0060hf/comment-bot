import { CommentPipeline } from '../../core/comment-pipeline';
import { ConfigManager } from '../../config/config-manager';
import { MockSTTAdapter } from '../../adapters/mocks/stt';
import { MockLLMAdapter } from '../../adapters/mocks/llm';
import { MockYouTubeAdapter } from '../../adapters/mocks/youtube';
import { MockModerationAdapter } from '../../adapters/mocks/moderation';
import { ModerationManager } from '../../core/moderation-manager';
import { CommentLengthPolicy } from '../../policies/comment-length';
import { NGWordsPolicy } from '../../policies/ng-words';
import { EmojiPolicy } from '../../policies/emoji';
import { CommentGenerationPrompt } from '../../prompts/comment-generation';
import { CommentClassificationPrompt } from '../../prompts/comment-classification';

import { Command } from './base';

/**
 * startコマンド - 配信の監視を開始
 */
export class StartCommand extends Command {
  name = 'start';
  description = '配信の監視を開始します';
  private pipeline?: CommentPipeline;

  async execute(args: string[]): Promise<void> {
    const { options, positional } = this.parseArgs(args);

    if (positional.length === 0) {
      throw new Error('YouTube動画IDを指定してください');
    }

    const videoId = positional[0]!; // 上のチェックで既に確認済み
    const configPath = (options.config as string) || './config.yaml';

    console.log(`配信の監視を開始します: ${videoId}`);
    if (options.config) {
      console.log(`設定ファイル: ${configPath}`);
    }

    await this.startBot(videoId, configPath);
  }

  private async startBot(videoId: string, configPath: string): Promise<void> {
    try {
      // 設定を読み込み
      const configManager = new ConfigManager(configPath);
      const config = await configManager.loadConfig();

      // アダプタを初期化（モック版）
      const sttAdapter = new MockSTTAdapter({ healthy: true });
      const llmAdapter = new MockLLMAdapter({ healthy: true });
      const youtubeAdapter = new MockYouTubeAdapter({ healthy: true, isLive: true });
      const moderationPrimary = new MockModerationAdapter({ healthy: true });
      const moderationFallback = new MockModerationAdapter({ healthy: true });

      // ポリシーとプロンプトを初期化
      const lengthPolicy = new CommentLengthPolicy(config.comment);
      const ngWordsPolicy = new NGWordsPolicy(config.comment);
      const emojiPolicy = new EmojiPolicy(config.comment);
      const generationPrompt = new CommentGenerationPrompt(config.comment);
      const classificationPrompt = new CommentClassificationPrompt(config.comment);

      // モデレーションマネージャーを初期化
      const moderationManager = new ModerationManager({
        config: config.safety,
        primary: moderationPrimary,
        fallback: moderationFallback,
      });

      // パイプラインを初期化
      this.pipeline = new CommentPipeline({
        config,
        sttAdapter,
        llmAdapter,
        youtubeAdapter,
        moderationManager,
        lengthPolicy,
        ngWordsPolicy,
        emojiPolicy,
        generationPrompt,
        classificationPrompt,
      });

      // Live Chat IDを取得
      const liveChatId = await youtubeAdapter.getLiveChatId(videoId);

      // パイプラインを開始
      await this.pipeline.start(liveChatId);

      console.log('✅ 配信の監視を開始しました');
      console.log('停止するには "comment-bot stop" を実行してください');

      // プロセスシグナルをハンドル
      process.on('SIGINT', () => this.handleShutdown());
      process.on('SIGTERM', () => this.handleShutdown());
    } catch (error) {
      console.error('❌ 開始中にエラーが発生しました:', error);
      throw error;
    }
  }

  private handleShutdown(): void {
    console.log('\n終了処理を実行中...');
    if (this.pipeline) {
      this.pipeline.stop();
    }
    process.exit(0);
  }
}
