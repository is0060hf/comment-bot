# Suggested Commands (Darwin)

## Git
- git status
- git add -A && git commit -m "..."
- git log --oneline --graph --decorate

## Spec Workflow MCP
- npx -y @pimzino/spec-workflow-mcp@latest /Users/outsource/Documents/GitHub/comment-bot --AutoStartDashboard --port 3456
- lsof -ti :3456 | xargs -r kill -9  # 停止（必須）

## Tsumiki for Cursor
- ./tsumiki-cursor/scripts/init.sh
- ./tsumiki-cursor/scripts/kairo.sh
- ./tsumiki-cursor/scripts/tdd.sh
- ./tsumiki-cursor/scripts/reverse.sh

## Node/Next (将来)
- npm -w packages/agent run build|dev|test (予定)
- npm -w packages/web run dev|build (予定)

## Utilities
- grep -R "pattern" .
- rg "pattern"  # ripgrepがある場合
- lsof -ti :PORT | xargs -r kill -9  # プロセスkill
