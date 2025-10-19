# Vercel認証情報セットアップガイド

## 取得できた情報

プロジェクトのリンクが完了し、以下の情報が取得できました：

- **VERCEL_ORG_ID**: `team_Xgu96VbhyQsfY6Nk6DqYbI94`
- **VERCEL_PROJECT_ID**: `prj_ypec3b4qH0IIF6fPyS9J1p7GNVcq`

## VERCEL_TOKENの作成手順

1. **Vercelダッシュボードにアクセス**
   - https://vercel.com/account/tokens にアクセス

2. **新しいトークンを作成**
   - 「Create」ボタンをクリック
   - トークン名を入力（例：`comment-bot-ci`）
   - スコープを選択：
     - ✅ Full Account（推奨）
     - または必要最小限のスコープを選択
   - 「Create Token」をクリック

3. **トークンを保存**
   - 表示されたトークンをコピー（一度しか表示されません！）
   - 安全な場所に保存

## GitHub Secretsへの設定方法

1. **GitHubリポジトリにアクセス**
   - リポジトリの「Settings」タブをクリック

2. **Secretsの追加**
   - 左メニューから「Secrets and variables」→「Actions」を選択
   - 「New repository secret」をクリック

3. **各Secretを追加**
   
   **VERCEL_TOKEN**:
   - Name: `VERCEL_TOKEN`
   - Secret: （作成したAPIトークン）
   
   **VERCEL_ORG_ID**:
   - Name: `VERCEL_ORG_ID`
   - Secret: `team_Xgu96VbhyQsfY6Nk6DqYbI94`
   
   **VERCEL_PROJECT_ID**:
   - Name: `VERCEL_PROJECT_ID`
   - Secret: `prj_ypec3b4qH0IIF6fPyS9J1p7GNVcq`

## 環境変数の使用場所

これらの環境変数は`.github/workflows/cd.yml`で使用されます：

```yaml
- name: Pull Vercel Environment Information
  run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
  env:
    VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

## ローカル開発での使用

ローカルでVercel CLIを使用する場合、以下の環境変数を設定できます：

```bash
export VERCEL_ORG_ID="team_Xgu96VbhyQsfY6Nk6DqYbI94"
export VERCEL_PROJECT_ID="prj_ypec3b4qH0IIF6fPyS9J1p7GNVcq"
export VERCEL_TOKEN="your-api-token-here"
```

または、`.env.local`ファイルに追加：

```env
VERCEL_ORG_ID=team_Xgu96VbhyQsfY6Nk6DqYbI94
VERCEL_PROJECT_ID=prj_ypec3b4qH0IIF6fPyS9J1p7GNVcq
VERCEL_TOKEN=your-api-token-here
```

## セキュリティに関する注意事項

- **VERCEL_TOKEN**は機密情報です。絶対にコミットしないでください
- `.gitignore`に`.env.local`が含まれていることを確認してください
- トークンは定期的にローテーションすることを推奨します

## 動作確認

設定が完了したら、以下のコマンドで動作を確認できます：

```bash
# プロジェクト情報の確認
vercel project ls

# デプロイのテスト（プレビュー環境）
vercel

# プロダクションデプロイのテスト
vercel --prod
```
