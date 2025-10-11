#!/bin/bash

# Tsumiki for Cursor - リバースエンジニアリングフロー実行スクリプト

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
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# ヘッダー表示
echo -e "${PURPLE}================================================${NC}"
echo -e "${PURPLE}  Tsumiki for Cursor - リバースエンジニアリング${NC}"
echo -e "${PURPLE}================================================${NC}"
echo ""

# ディレクトリの作成（spec-workflow モード時は reverse の一時出力のみ）
if [ "$SW_MODE" -eq 1 ]; then
  mkdir -p "$DOCS_DIR"/reverse
else
  mkdir -p "$DOCS_DIR"/{reverse,requirements,design,tasks,tests}
fi

# リバースエンジニアリングフェーズ選択
echo -e "${GREEN}実行するリバースエンジニアリングを選択してください:${NC}"
echo "1) コード分析 - 既存コードの構造分析"
echo "2) タスク逆生成 - コードからタスク一覧を生成"
echo "3) 設計逆生成 - コードから設計文書を生成"
echo "4) 仕様逆生成 - コードからテスト仕様を生成"
echo "5) 要件逆生成 - 全分析結果から要件定義を生成"
echo "6) 全フェーズ実行"
echo -n "選択 [1-6]: "
read -r phase

case $phase in
    1)
        echo -e "\n${YELLOW}=== コード分析フェーズ ===${NC}"
        cat > "$DOCS_DIR/reverse/analysis_prompt.md" <<EOF
# コード分析プロンプト

既存のコードベースを分析し、以下の情報を抽出してください：

1. **プロジェクト構造**
   - ディレクトリ構成
   - 主要なモジュール/パッケージ
   - 依存関係

2. **技術スタック**
   - 使用言語
   - フレームワーク
   - ライブラリ
   - データベース

3. **アーキテクチャパターン**
   - 設計パターン
   - レイヤー構造
   - データフロー

4. **主要機能**
   - ビジネスロジック
   - API/エンドポイント
   - データモデル

5. **品質指標**
   - テストの有無
   - コード規約
   - ドキュメント状況
EOF
        echo "コード分析プロンプトを作成しました: $DOCS_DIR/reverse/analysis_prompt.md"
        echo "このプロンプトを使用してAIにコード分析を依頼してください。"
        if [ "$SW_MODE" -eq 1 ]; then
          echo "spec-workflow モード: 生成/更新は .spec-workflow/specs/<spec-name> 配下の requirements/design/tasks に反映してください。"
        fi
        ;;
    2)
        echo -e "\n${YELLOW}=== タスク逆生成フェーズ ===${NC}"
        echo "既存コードからタスク一覧を逆生成します。"
        if [ "$SW_MODE" -eq 1 ]; then
          cp "$TSUMIKI_DIR/templates/tasks/template.md" "$DOCS_DIR/reverse/tasks_reverse.md"
          echo "完了後、.spec-workflow/specs/<spec-name>/tasks.md に転記・統合してください。"
        else
          cp "$TSUMIKI_DIR/templates/tasks/template.md" "$DOCS_DIR/reverse/tasks_reverse.md"
        fi
        echo "プロンプト例:"
        echo "「既存のコードベースを分析し、実装されている機能をタスクとして整理してください。」"
        ;;
    3)
        echo -e "\n${YELLOW}=== 設計逆生成フェーズ ===${NC}"
        echo "既存コードから設計文書を逆生成します。"
        if [ "$SW_MODE" -eq 1 ]; then
          cp "$TSUMIKI_DIR/templates/design/template.md" "$DOCS_DIR/reverse/design_reverse.md"
          echo "完了後、.spec-workflow/specs/<spec-name>/design.md に転記・統合してください。"
        else
          cp "$TSUMIKI_DIR/templates/design/template.md" "$DOCS_DIR/reverse/design_reverse.md"
        fi
        echo "プロンプト例:"
        echo "「既存のコードベースから、アーキテクチャとデータベース設計を抽出して設計文書を作成してください。」"
        ;;
    4)
        echo -e "\n${YELLOW}=== 仕様逆生成フェーズ ===${NC}"
        echo "既存コードからテスト仕様を逆生成します。"
        if [ "$SW_MODE" -eq 1 ]; then
          cp "$TSUMIKI_DIR/templates/tests/template.md" "$DOCS_DIR/reverse/test_spec_reverse.md"
          echo ".spec-workflow/specs/<spec-name>/tests/test_spec.md に統合してください（必要に応じ作成）。"
        else
          cp "$TSUMIKI_DIR/templates/tests/template.md" "$DOCS_DIR/reverse/test_spec_reverse.md"
        fi
        echo "プロンプト例:"
        echo "「既存のコードとテストから、テスト仕様書を逆生成してください。」"
        ;;
    5)
        echo -e "\n${YELLOW}=== 要件逆生成フェーズ ===${NC}"
        echo "全分析結果から要件定義書を逆生成します。"
        if [ "$SW_MODE" -eq 1 ]; then
          cp "$TSUMIKI_DIR/templates/requirements/template.md" "$DOCS_DIR/reverse/requirements_reverse.md"
          echo "完了後、.spec-workflow/specs/<spec-name>/requirements.md に統合してください。"
        else
          cp "$TSUMIKI_DIR/templates/requirements/template.md" "$DOCS_DIR/reverse/requirements_reverse.md"
        fi
        echo "プロンプト例:"
        echo "「これまでの分析結果から、このシステムの要件定義書を逆生成してください。」"
        ;;
    6)
        echo -e "\n${YELLOW}=== 全フェーズ実行 ===${NC}"
        echo "リバースエンジニアリングを段階的に実行します。"
        echo "続行しますか？ [y/N]: "
        read -r confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            for i in {1..5}; do
                "$0" $i
                echo -e "\n${GREEN}フェーズ$iを完了したら、Enterキーを押して次に進んでください。${NC}"
                read -r
            done
        fi
        ;;
    *)
        echo "無効な選択です。"
        exit 1
        ;;
esac

echo -e "\n${GREEN}完了しました。${NC}"
