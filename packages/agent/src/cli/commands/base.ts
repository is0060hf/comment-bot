/**
 * コマンド基底クラス
 */
export abstract class Command {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract execute(args: string[]): Promise<void>;

  /**
   * ヘルプメッセージを表示
   */
  showHelp(): void {
    console.log(`${this.name}: ${this.description}`);
  }

  /**
   * 引数をパース
   */
  protected parseArgs(args: string[]): { options: Record<string, string | boolean>; positional: string[] } {
    const options: Record<string, string | boolean> = {};
    const positional: string[] = [];

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg?.startsWith('--')) {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('--')) {
          options[key] = nextArg;
          i++; // 次の引数をスキップ
        } else {
          options[key] = true;
        }
      } else if (arg) {
        positional.push(arg);
      }
    }

    return { options, positional };
  }
}
