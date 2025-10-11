#!/bin/bash

# Tsumiki for Cursor - TDDフロー実行スクリプト

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." &> /dev/null && pwd)"
TSUMIKI_DIR="$PROJECT_ROOT/tsumiki-cursor"

# spec-workflow 参照モード検出
if [ -d "$PROJECT_ROOT/.spec-workflow/specs" ]; then
  DOCS_DIR="$PROJECT_ROOT/.spec-workflow/specs"
  SW_MODE=1
else
  DOCS_DIR="$TSUMIKI_DIR/docs"
  SW_MODE=0
fi

# カラー定義
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ヘッダー表示
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Tsumiki for Cursor - TDDフロー${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ディレクトリの作成（spec-workflow モード時は各 spec 配下に tests を作成して運用）
if [ "$SW_MODE" -eq 0 ]; then
  mkdir -p "$DOCS_DIR/tests"
fi

# TDDフェーズ選択（CLI フェーズは廃止）
echo -e "${GREEN}実行するTDDメニューを選択してください:${NC}"
echo "1) テスト仕様作成（推奨：.spec-workflow 参照）"
echo "2) Red - 廃止（プロンプトで実施してください）"
echo "3) Green - 廃止（プロンプトで実施してください）"
echo "4) Refactor - 廃止（プロンプトで実施してください）"
echo "5) Verify - 廃止（プロンプトで実施してください）"
echo "6) ガイド表示（.spec-workflow 参照方法の案内のみ）"
echo -n "選択 [1-6]: "
read -r phase

case $phase in
    1)
        echo -e "\n${YELLOW}=== テスト仕様作成フェーズ ===${NC}"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "spec-workflow モード: .spec-workflow/specs/<spec-name>/tests/test_spec.md を作成/更新してください。"
        else
          cp "$TSUMIKI_DIR/templates/tests/template.md" "$DOCS_DIR/tests/test_spec.md"
          echo "テスト仕様書テンプレートを作成しました: $DOCS_DIR/tests/test_spec.md"
          echo "Cursorで開いて、AIにテスト仕様の作成を依頼してください。"
        fi
        ;;
    2|3|4|5)
        echo -e "\n${YELLOW}このCLIフェーズコマンドは廃止しました。${NC}"
        echo "以降はプロンプト駆動で Red/Green/Refactor/Verify を実施してください。"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "参考: .spec-workflow/specs/<spec-name>/tests/test_spec.md / tasks.md を基準に進めてください。"
        fi
        ;;
    6)
        echo -e "\n${YELLOW}=== ガイド ===${NC}"
        echo "TDDはCLIフェーズを廃止し、プロンプト駆動で実施します。"
        echo "手順: 1) テスト仕様をtests/test_spec.mdに整理 → 2) Red(失敗テスト) → 3) Green(最小実装) → 4) Refactor → 5) Verify"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "対象Spec: .spec-workflow/specs/<spec-name>/ 配下（requirements/design/tasks/tests）"
        fi
        ;;
    *)
        echo "無効な選択です。"
        exit 1
        ;;
esac

echo -e "\n${GREEN}完了しました。${NC}"
