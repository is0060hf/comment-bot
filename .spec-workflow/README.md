# Spec Workflow MCP 運用ガイド（ローカル）

- 対象: 本リポジトリで`spec-workflow`（MCPサーバー）をローカル起動し、ダッシュボードを使用するための手順
- 参考: [spec-workflow-mcp (GitHub)](https://github.com/Pimzino/spec-workflow-mcp)

---

## 前提

- Node.js（LTS）と`npx`がローカルにインストール済み
- 本プロジェクトの絶対パス: `/Users/outsource/Documents/GitHub/comment-bot`

---

## クイックスタート（CLI）

以下のコマンドでMCPサーバーを起動し、ダッシュボードを自動起動します。

```bash
npx -y @pimzino/spec-workflow-mcp@latest /Users/outsource/Documents/GitHub/comment-bot --AutoStartDashboard --port 3456
```

- `--AutoStartDashboard`: ブラウザでダッシュボードを自動表示
- `--port 3456`: ダッシュボードのポート指定（任意）
- ダッシュボードURL例: `http://localhost:3456`

停止方法（至上命令）:

- フォアグラウンド実行: `Ctrl + C` で必ず停止
- バックグラウンド実行時: `ps`でPID確認→`kill <PID>`（必ずkill）

---

## Cursor 連携（MCPサーバー登録）

Cursorの`settings.json`に以下を追加します。

```json
{
  "mcpServers": {
    "spec-workflow": {
      "command": "npx",
      "args": [
        "-y",
        "@pimzino/spec-workflow-mcp@latest",
        "/Users/outsource/Documents/GitHub/comment-bot",
        "--AutoStartDashboard",
        "--port",
        "3456"
      ]
    }
  }
}
```

- 初回起動後、ブラウザでダッシュボードが開きます
- 作業終了時は、起動したプロセスを必ず停止してください

---

## 設定ファイルの扱い

- 本ディレクトリに`config.example.toml`/`config.toml`があります
- ただし、CLIフラグが最優先（推奨）: `--AutoStartDashboard`/`--port` などで明示指定
- `dashboardOnly` は「ダッシュボードのみ」モードのため、通常は無効（false）にしてください

---

## フォルダ構成（抜粋）

```
.spec-workflow/
  README.md                 # 本ファイル
  config.example.toml       # 参考設定
  config.toml               # 任意設定（CLIフラグ優先）
  session.json              # 起動情報（自動生成）
  templates/                # 既定テンプレート
  user-templates/           # プロジェクト固有テンプレート（任意）
  steering/                 # プロダクト/技術指針（任意）
```

---

## 注意事項

- 起動したWebサーバー（ダッシュボード/MCP）は作業完了時に必ず停止してください
- ネットワーク/ポート使用不可の環境では起動に失敗します。その場合はポート番号の変更をご検討ください
- ダッシュボードのみ起動したい場合は `--dashboard` または設定ファイルの `dashboardOnly=true`
  を使用（通常運用は非推奨）
