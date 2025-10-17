#!/bin/bash

# Ragas 评测运行示例脚本
# 使用方法: ./test_run_example.sh

# 配置
API_BASE="http://localhost:3000"
TOKEN="YOUR_FASTGPT_TOKEN"
APP_ID="YOUR_APP_ID"
CSV_FILE="example_test_data_template.csv"

echo "=========================================="
echo "Ragas 评测示例"
echo "=========================================="
echo ""
echo "配置信息:"
echo "  API: $API_BASE"
echo "  应用 ID: $APP_ID"
echo "  CSV 文件: $CSV_FILE"
echo ""

# 检查 CSV 文件是否存在
if [ ! -f "$CSV_FILE" ]; then
    echo "错误: CSV 文件不存在: $CSV_FILE"
    exit 1
fi

echo "开始执行评测..."
echo ""

# 调用 API
curl -X POST "$API_BASE/api/core/app/evaluation/ragas/run" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$CSV_FILE" \
  -F "data={\"appId\":\"$APP_ID\",\"evaluation_model\":\"doubao-pro-32k\",\"enabled_metrics\":[\"faithfulness\",\"answer_relevancy\",\"context_relevancy\"]}" \
  | python -m json.tool

echo ""
echo "=========================================="
echo "评测完成"
echo "=========================================="

