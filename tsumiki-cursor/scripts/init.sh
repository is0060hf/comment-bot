#!/bin/bash

# Tsumiki for Cursor - 初期化スクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." &> /dev/null && pwd)"
TSUMIKI_DIR="$PROJECT_ROOT/tsumiki-cursor"

# カラー定義
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ヘッダー表示
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Tsumiki for Cursor - 初期化${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ディレクトリ構造の作成
echo -e "${YELLOW}ディレクトリ構造を作成しています...${NC}"
mkdir -p "$TSUMIKI_DIR"/{templates/{requirements,design,tasks,tests},scripts,prompts,docs}

# スクリプトに実行権限を付与
echo -e "${YELLOW}スクリプトに実行権限を付与しています...${NC}"
chmod +x "$SCRIPT_DIR"/*.sh

# プロジェクト設定ファイルの作成
echo -e "${YELLOW}プロジェクト設定を作成しています...${NC}"
cat > "$TSUMIKI_DIR/.tsumiki-config.json" <<EOF
{
  "project": {
    "name": "$(basename "$PROJECT_ROOT")",
    "version": "1.0.0",
    "framework": "tsumiki-cursor"
  },
  "settings": {
    "language": "ja",
    "testFramework": "jest",
    "linter": "eslint",
    "formatter": "prettier"
  }
}
EOF

# .gitignore の更新
if [ -f "$PROJECT_ROOT/.gitignore" ]; then
    echo -e "${YELLOW}.gitignoreを更新しています...${NC}"
    if ! grep -q "tsumiki-cursor/docs/" "$PROJECT_ROOT/.gitignore"; then
        echo "" >> "$PROJECT_ROOT/.gitignore"
        echo "# Tsumiki for Cursor" >> "$PROJECT_ROOT/.gitignore"
        echo "tsumiki-cursor/docs/" >> "$PROJECT_ROOT/.gitignore"
    fi
fi

# 完了メッセージ
echo -e "\n${GREEN}✅ Tsumiki for Cursorの初期化が完了しました！${NC}"
echo ""
echo "使用方法:"
echo "  1. Kairoフロー（包括的開発）: ./tsumiki-cursor/scripts/kairo.sh"
echo "  2. TDDフロー（テスト駆動開発）: ./tsumiki-cursor/scripts/tdd.sh"
echo "  3. リバースエンジニアリング: ./tsumiki-cursor/scripts/reverse.sh"
echo ""
echo "詳細は tsumiki-cursor/README.md を参照してください。"
