"""
执行 Ragas 评测
"""

import requests
import json

# ========== 配置区域 ==========
API_BASE = "http://localhost:3000"  # FastGPT 地址
TOKEN = "fastgpt-cjvywElxHOT3JsJPQrSL8RZO3dgfMxvxLEa54K9flB9fkaWShCDSpk3w"                 # 应用专用 API Key
APP_ID = "68d6382d8ecba71f8cc24324"               # 要测试的应用 ID
CSV_FILE = "test.csv"                # CSV 文件路径
# ==============================

def run_evaluation():
    """执行评测"""
    
    print("=" * 60)
    print("开始 Ragas 评测")
    print("=" * 60)
    print()
    print(f"API: {API_BASE}")
    print(f"应用 ID: {APP_ID}")
    print(f"CSV 文件: {CSV_FILE}")
    print()
    
    url = f"{API_BASE}/api/core/app/evaluation/ragas/run"
    headers = {
        "Authorization": f"Bearer {TOKEN}"
    }
    
    # 读取 CSV 文件
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        csv_content = f.read()
    
    # 配置评测参数
    request_data = {
        "appId": APP_ID,
        "csvContent": csv_content,
        "evaluation_model": "deepseek-v3-1-terminus",
        "embedding_model": "doubao-embedding-text-240715",
        "enabled_metrics": [
            "faithfulness",          # 忠实度
            "answer_relevancy",      # 答案相关性
            "context_precision"      # 上下文精确度
        ]
    }
    
    print("开始执行评测（这可能需要几分钟）...")
    print()
    
    try:
        response = requests.post(
            url, 
            headers=headers, 
            json=request_data, 
            timeout=600  # 10分钟超时
        )
        
        if response.status_code == 200:
            result = response.json()
            
            if result.get("code") == 200:
                data = result.get("data", {})
                
                print("✓ 评测完成!")
                print()
                
                # 显示摘要
                if data.get("summary"):
                    summary = data["summary"]
                    print("【评测摘要】")
                    print(f"  总问题数: {summary.get('total', 0)}")
                    print(f"  成功: {summary.get('success', 0)}")
                    print(f"  失败: {summary.get('failed', 0)}")
                    print()
                    
                    if summary.get("averageScores"):
                        print("【平均分数】")
                        for metric, score in summary["averageScores"].items():
                            print(f"  {metric}: {score:.2%}")
                        print()
                
                # 显示详细结果
                if data.get("results"):
                    print("【详细结果】")
                    for i, item in enumerate(data["results"], 1):
                        print(f"\n问题 {i}:")
                        print(f"  Q: {item.get('question', '')[:80]}...")
                        print(f"  A: {item.get('answer', '')[:80]}...")
                        print(f"  上下文数: {len(item.get('contexts', []))}")
                        
                        if item.get("metrics"):
                            print("  评估指标:")
                            for metric, score in item["metrics"].items():
                                if score is not None:
                                    try:
                                        # 尝试转换为浮点数
                                        score_num = float(score)
                                        print(f"    {metric}: {score_num:.2%}")
                                    except (ValueError, TypeError):
                                        # 如果转换失败，直接显示原值
                                        print(f"    {metric}: {score}")
                        
                        if item.get("error"):
                            print(f"  ✗ 错误: {item['error']}")
                
                # 保存完整结果到文件
                with open("evaluation_result.json", "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print()
                print("✓ 完整结果已保存到: evaluation_result.json")
                
            else:
                print(f"✗ 评测失败: {result.get('error')}")
                
        else:
            print(f"✗ HTTP 错误 {response.status_code}")
            print(response.text)
            
    except requests.exceptions.Timeout:
        print("✗ 请求超时（评测时间较长，请稍后查看结果）")
    except Exception as e:
        print(f"✗ 异常: {str(e)}")
    
    print()
    print("=" * 60)


if __name__ == "__main__":
    # 检查配置
    if TOKEN == "YOUR_TOKEN":
        print("❌ 错误: 请先配置 TOKEN")
        print()
        print("获取 Token 的方法:")
        print("1. 登录 FastGPT")
        print("2. 进入 账户设置 > API密钥")
        print("3. 创建或复制现有的 API Key")
        exit(1)
    
    if APP_ID == "YOUR_APP_ID":
        print("❌ 错误: 请先配置 APP_ID")
        print()
        print("获取 APP_ID 的方法:")
        print("1. 进入要测试的应用")
        print("2. 查看浏览器地址栏，格式: /app/detail?appId=xxx")
        print("3. 复制 xxx 部分")
        exit(1)
    
    run_evaluation()

