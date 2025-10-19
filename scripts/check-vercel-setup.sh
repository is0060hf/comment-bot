#!/bin/bash

# Vercel設定チェックスクリプト
# タイムアウトとエラーハンドリングを含む

set -e  # エラーで即座に終了

echo "🔍 Vercel設定確認スクリプト"
echo "=========================="

# 色付き出力のための関数
success() { echo -e "\033[32m✅ $1\033[0m"; }
error() { echo -e "\033[31m❌ $1\033[0m"; }
info() { echo -e "\033[33mℹ️  $1\033[0m"; }

# タイムアウト付きコマンド実行関数
run_with_timeout() {
    local timeout=$1
    shift
    local cmd="$@"
    
    # macOS/Linux対応のタイムアウト実装
    ( 
        eval "$cmd" &
        local pid=$!
        local count=0
        while kill -0 $pid 2>/dev/null && [ $count -lt $timeout ]; do
            sleep 1
            ((count++))
        done
        if kill -0 $pid 2>/dev/null; then
            kill -9 $pid
            return 124  # タイムアウトエラーコード
        fi
        wait $pid
    )
}

# 1. Vercel CLIの確認
echo ""
echo "1. Vercel CLIの確認"
if command -v vercel &> /dev/null; then
    VERCEL_VERSION=$(vercel --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    success "Vercel CLI がインストールされています (v$VERCEL_VERSION)"
else
    error "Vercel CLI がインストールされていません"
    echo "   インストール: npm install -g vercel"
    exit 1
fi

# 2. プロジェクトファイルの確認
echo ""
echo "2. プロジェクト設定の確認"
if [ -f "packages/web/.vercel/project.json" ]; then
    success "プロジェクト設定ファイルが存在します"
    PROJECT_INFO=$(cat packages/web/.vercel/project.json)
    echo "   $PROJECT_INFO"
    
    # JSONから値を抽出
    PROJECT_ID=$(echo $PROJECT_INFO | grep -oE '"projectId":"[^"]+' | cut -d'"' -f4)
    ORG_ID=$(echo $PROJECT_INFO | grep -oE '"orgId":"[^"]+' | cut -d'"' -f4)
    
    if [ ! -z "$PROJECT_ID" ] && [ ! -z "$ORG_ID" ]; then
        success "Project ID: $PROJECT_ID"
        success "Organization ID: $ORG_ID"
    fi
else
    error "プロジェクト設定ファイルが見つかりません"
    echo "   'cd packages/web && vercel link' を実行してください"
fi

# 3. GitHub Secretsの確認（環境変数経由）
echo ""
echo "3. 環境変数の確認"
if [ ! -z "$VERCEL_TOKEN" ]; then
    success "VERCEL_TOKEN が設定されています"
else
    info "VERCEL_TOKEN が環境変数に設定されていません"
fi

if [ ! -z "$VERCEL_ORG_ID" ]; then
    success "VERCEL_ORG_ID が設定されています: $VERCEL_ORG_ID"
else
    info "VERCEL_ORG_ID が環境変数に設定されていません"
fi

if [ ! -z "$VERCEL_PROJECT_ID" ]; then
    success "VERCEL_PROJECT_ID が設定されています: $VERCEL_PROJECT_ID"
else
    info "VERCEL_PROJECT_ID が環境変数に設定されていません"
fi

# 4. Vercel接続テスト（トークンがある場合）
if [ ! -z "$VERCEL_TOKEN" ]; then
    echo ""
    echo "4. Vercel API接続テスト"
    echo "   プロジェクト一覧を取得中... (最大10秒)"
    
    if run_with_timeout 10 "cd packages/web && vercel project ls --token=$VERCEL_TOKEN 2>&1 | head -10"; then
        success "Vercel APIへの接続に成功しました"
    else
        error "Vercel APIへの接続に失敗またはタイムアウトしました"
    fi
fi

# 5. 推奨される次のステップ
echo ""
echo "📝 推奨される次のステップ:"
echo ""
echo "1. GitHub Secretsの設定:"
echo "   - VERCEL_TOKEN: Vercel APIトークン"
echo "   - VERCEL_ORG_ID: $ORG_ID"
echo "   - VERCEL_PROJECT_ID: $PROJECT_ID"
echo ""
echo "2. テストワークフローの実行:"
echo "   - GitHubで Actions → Test Vercel Setup → Run workflow"
echo ""
echo "3. ローカルテスト（環境変数設定後）:"
echo "   export VERCEL_TOKEN='your-token-here'"
echo "   export VERCEL_ORG_ID='$ORG_ID'"
echo "   export VERCEL_PROJECT_ID='$PROJECT_ID'"
echo "   cd packages/web && vercel --yes"

echo ""
echo "✨ チェック完了!"
