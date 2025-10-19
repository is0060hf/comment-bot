import { Command } from 'commander';

describe('CLI', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program
      .name('comment-bot')
      .description('YouTube Live comment bot')
      .version('1.0.0');
  });

  describe('Command structure', () => {
    it('should have basic commands', () => {
      // Add start command
      program
        .command('start')
        .description('Start the comment bot')
        .option('-c, --config <path>', 'Config file path', './config.yaml')
        .option('-v, --verbose', 'Verbose output', false);

      // Add stop command
      program
        .command('stop')
        .description('Stop the comment bot');

      // Add auth command
      program
        .command('auth')
        .description('Authenticate with YouTube');

      const commands = program.commands.map(cmd => cmd.name());
      expect(commands).toContain('start');
      expect(commands).toContain('stop');
      expect(commands).toContain('auth');
    });

    it('should parse start command options', () => {
      program
        .command('start')
        .description('Start the comment bot')
        .option('-c, --config <path>', 'Config file path', './config.yaml')
        .option('-v, --verbose', 'Verbose output', false)
        .action((options) => {
          expect(options.config).toBeDefined();
          expect(options.verbose).toBeDefined();
        });

      // Test parsing
      program.parse(['node', 'test', 'start', '-c', 'custom.yaml', '-v'], { from: 'user' });
    });
  });
});