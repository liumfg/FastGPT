"""
Python 版本的评测运行示例
使用方法: python test_run_example.py
"""

import requests
import json
import sys

# 配置
API_BASE = "http://localhost:3000"
TOKEN = "YOUR_FASTGPT_TOKEN"  # 替换为你的 token
APP_ID = "YOUR_APP_ID"        # 替换为你的应用 ID
CSV_FILE = "example_test_data_template.csv"

def run_ragas_evaluation():
    """运行 Ragas 评测"""
    
    print("=" * 50)
    print("Ragas 评测示例")
    print("=" * 50)
    print()
    print("配置信息:")
    print(f"  API: {API_BASE}")
    print(f"  应用 ID: {APP_ID}")
    print(f"  CSV 文件: {CSV_FILE}")
    print()
    
    # 准备请求
    url = f"{API_BASE}/api/core/app/evaluation/ragas/run"
    headers = {
        "Authorization": f"Bearer {TOKEN}"
    }
    
    # 准备数据（使用火山方舟模型）
    config_data = {
        "appId": APP_ID,
        "evaluation_model": "doubao-pro-32k",
        "enabled_metrics": [
            "faithfulness",
            "answer_relevancy",
            "context_relevancy"
        ]
    }
    
    files = {
        "file": open(CSV_FILE, "rb"),
        "data": (None, json.dumps(config_data))
    }
    
    print("开始执行评测...")
    print()
    
    try:
        # 发送请求
        response = requests.post(url, headers=headers, files=files, timeout=600)
        
        # 解析响应
        if response.status_code == 200:
            result = response.json()
            
            if result.get("code") == 200:
                data = result.get("data", {})
                
                print("✓ 评测成功!")
                print()
                
                # 显示摘要
                if "summary" in data:
                    summary = data["summary"]
                    print("评测摘要:")
                    print(f"  总数: {summary.get('total', 0)}")
                    print(f"  成功: {summary.get('success', 0)}")
                    print(f"  失败: {summary.get('failed', 0)}")
                    print()
                    
                    if "averageScores" in summary:
                        print("平均分数:")
                        for metric, score in summary["averageScores"].items():
                            print(f"  {metric}: {score:.2%}")
                        print()
                
                # 显示详细结果
                if "results" in data:
                    print("详细结果:")
                    for i, item in enumerate(data["results"], 1):
                        print(f"\n  问题 {i}: {item.get('question', '')[:50]}...")
                        print(f"    答案: {item.get('answer', '')[:100]}...")
                        print(f"    上下文数: {len(item.get('contexts', []))}")
                        
                        if "metrics" in item and item["metrics"]:
                            print("    评估指标:")
                            for metric, score in item["metrics"].items():
                                if score is not None:
                                    print(f"      {metric}: {score:.2%}")
                        
                        if "error" in item:
                            print(f"    ✗ 错误: {item['error']}")
                
                print()
                print("=" * 50)
                print("评测完成")
                print("=" * 50)
                
            else:
                print(f"✗ 评测失败: {result.get('error')}")
        else:
            print(f"✗ HTTP 错误: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.Timeout:
        print("✗ 请求超时（评测可能需要较长时间）")
    except Exception as e:
        print(f"✗ 异常: {str(e)}")
    finally:
        files["file"][1].close()


if __name__ == "__main__":
    # 检查配置
    if TOKEN == "YOUR_FASTGPT_TOKEN":
        print("错误: 请先配置 TOKEN")
        sys.exit(1)
    
    if APP_ID == "YOUR_APP_ID":
        print("错误: 请先配置 APP_ID")
        sys.exit(1)
    
    run_ragas_evaluation()

