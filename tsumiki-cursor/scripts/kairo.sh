#!/bin/bash

# Tsumiki for Cursor - Kairoフロー実行スクリプト

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
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ヘッダー表示
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Tsumiki for Cursor - Kairoフロー${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ドキュメントディレクトリの作成（spec-workflow モード時は未作成）
if [ "$SW_MODE" -eq 0 ]; then
  mkdir -p "$DOCS_DIR"/{requirements,design,tasks,tests}
fi

# フェーズ選択
echo -e "${GREEN}実行するフェーズを選択してください:${NC}"
echo "1) 要件定義 (Requirements)"
echo "2) 設計 (Design)"
echo "3) タスク分割 (Tasks)"
echo "4) TDD実装 (Implementation)"
echo "5) 全フェーズ実行 (All)"
echo -n "選択 [1-5]: "
read -r phase

case $phase in
    1)
        echo -e "\n${YELLOW}=== 要件定義フェーズ ===${NC}"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "spec-workflow モード: 承認済み要件は .spec-workflow/specs/<spec-name>/requirements.md を参照/更新してください。"
          echo "例: $DOCS_DIR/voice-quality-diagnosis/requirements.md"
        else
          cp "$TSUMIKI_DIR/templates/requirements/template.md" "$DOCS_DIR/requirements/requirements.md"
          echo "要件定義書テンプレートを作成しました: $DOCS_DIR/requirements/requirements.md"
          echo "Cursorで開いて、AIに要件定義の作成を依頼してください。"
        fi
        ;;
    2)
        echo -e "\n${YELLOW}=== 設計フェーズ ===${NC}"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "spec-workflow モード: .spec-workflow/specs/<spec-name>/design.md を参照/更新してください。"
          echo "例: $DOCS_DIR/voice-quality-diagnosis/design.md"
        else
          if [ ! -f "$DOCS_DIR/requirements/requirements.md" ]; then
              echo "警告: 要件定義書が見つかりません。先に要件定義を完了してください。"
          fi
          cp "$TSUMIKI_DIR/templates/design/template.md" "$DOCS_DIR/design/design.md"
          echo "設計文書テンプレートを作成しました: $DOCS_DIR/design/design.md"
          echo "Cursorで開いて、要件定義書を基にAIに設計文書の作成を依頼してください。"
        fi
        ;;
    3)
        echo -e "\n${YELLOW}=== タスク分割フェーズ ===${NC}"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "spec-workflow モード: .spec-workflow/specs/<spec-name>/tasks.md（チェックボックス形式）を参照/更新してください。"
          echo "例: $DOCS_DIR/voice-quality-diagnosis/tasks.md"
        else
          if [ ! -f "$DOCS_DIR/design/design.md" ]; then
              echo "警告: 設計文書が見つかりません。先に設計を完了してください。"
          fi
          cp "$TSUMIKI_DIR/templates/tasks/template.md" "$DOCS_DIR/tasks/tasks.md"
          echo "タスク管理テンプレートを作成しました: $DOCS_DIR/tasks/tasks.md"
          echo "Cursorで開いて、設計文書を基にAIにタスク分割を依頼してください。"
        fi
        ;;
    4)
        echo -e "\n${YELLOW}=== TDD実装フェーズ ===${NC}"
        if [ ! -f "$DOCS_DIR/tasks/tasks.md" ]; then
            echo "警告: タスク一覧が見つかりません。先にタスク分割を完了してください。"
        fi
        echo "TDDフローを開始します..."
        "$SCRIPT_DIR/tdd.sh"
        ;;
    5)
        echo -e "\n${YELLOW}=== 全フェーズ実行 ===${NC}"
        echo "注意: 各フェーズは手動でCursorで編集する必要があります。"
        echo "続行しますか？ [y/N]: "
        read -r confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            "$0" 1
            echo -e "\n${GREEN}要件定義を完了したら、次のフェーズに進んでください。${NC}"
        fi
        ;;
    *)
        echo "無効な選択です。"
        exit 1
        ;;
esac

echo -e "\n${GREEN}完了しました。${NC}"
