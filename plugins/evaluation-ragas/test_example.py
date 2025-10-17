"""
Ragas 服务测试示例
演示如何使用评估服务
"""

import asyncio
import requests
import json


def test_health_check():
    """测试健康检查"""
    print("=== 测试健康检查 ===")
    response = requests.get("http://localhost:8001/health")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
    print()


def test_get_metrics():
    """获取可用指标"""
    print("=== 获取可用指标 ===")
    response = requests.get("http://localhost:8001/metrics/available")
    data = response.json()
    print(f"可用指标数量: {data['data']['total']}")
    for metric in data['data']['metrics']:
        print(f"  - {metric['name']}: {metric['label']}")
        print(f"    {metric['description']}")
        print(f"    需要标准答案: {'是' if metric['requires_ground_truth'] else '否'}")
    print()


def test_single_evaluation():
    """测试单项评估"""
    print("=== 测试单项评估 ===")
    
    data = {
        "question": "什么是 FastGPT？",
        "answer": "FastGPT 是一个基于大语言模型的知识库问答平台，它可以帮助用户快速构建自己的知识库问答系统。",
        "contexts": [
            "FastGPT 是一个基于 LLM 的知识库问答平台。",
            "它支持多种数据源和向量数据库，可以快速构建智能问答系统。"
        ],
        "ground_truth": "FastGPT 是一个知识库问答平台。",
        "evaluation_model": "gpt-4",
        "enabled_metrics": ["faithfulness", "answer_relevancy", "context_relevancy"]
    }
    
    print(f"评估问题: {data['question']}")
    print(f"生成答案: {data['answer']}")
    print(f"上下文数量: {len(data['contexts'])}")
    print(f"启用指标: {', '.join(data['enabled_metrics'])}")
    print()
    
    response = requests.post(
        "http://localhost:8001/evaluate/single",
        json=data,
        timeout=120
    )
    
    if response.status_code == 200:
        result = response.json()
        if result['success']:
            print("✅ 评估成功！")
            print("评估结果:")
            for metric, score in result['data'].items():
                if isinstance(score, float):
                    print(f"  {metric}: {score:.2%}")
        else:
            print(f"❌ 评估失败: {result.get('error')}")
    else:
        print(f"❌ 请求失败: {response.status_code}")
        print(response.text)
    print()


def test_batch_evaluation():
    """测试批量评估"""
    print("=== 测试批量评估 ===")
    
    data = {
        "items": [
            {
                "question": "什么是 FastGPT？",
                "answer": "FastGPT 是一个知识库问答平台。",
                "contexts": ["FastGPT 是一个基于 LLM 的知识库问答平台。"],
                "ground_truth": "FastGPT 是一个知识库问答平台。"
            },
            {
                "question": "FastGPT 支持哪些功能？",
                "answer": "FastGPT 支持知识库管理、智能问答、工作流编排等功能。",
                "contexts": [
                    "FastGPT 提供知识库管理功能。",
                    "FastGPT 支持工作流编排和智能问答。"
                ],
                "ground_truth": "支持知识库管理和智能问答。"
            },
            {
                "question": "如何使用 FastGPT？",
                "answer": "可以通过 Docker 部署 FastGPT，然后创建知识库并导入数据。",
                "contexts": [
                    "FastGPT 支持 Docker 部署。",
                    "用户可以创建知识库并导入各种格式的数据。"
                ],
                "ground_truth": "通过 Docker 部署并创建知识库。"
            }
        ],
        "evaluation_model": "gpt-4",
        "enabled_metrics": ["faithfulness", "answer_relevancy"]
    }
    
    print(f"评估项数量: {len(data['items'])}")
    print(f"启用指标: {', '.join(data['enabled_metrics'])}")
    print()
    
    print("开始评估（可能需要几分钟）...")
    response = requests.post(
        "http://localhost:8001/evaluate/batch",
        json=data,
        timeout=300
    )
    
    if response.status_code == 200:
        result = response.json()
        if result['success']:
            print("✅ 批量评估成功！")
            print()
            print("平均分数:")
            for metric, score in result['data']['average_scores'].items():
                print(f"  {metric}: {score:.2%}")
            print()
            print("各项详细结果:")
            for i, item_result in enumerate(result['data']['items'], 1):
                print(f"  问题 {i}:")
                for metric, score in item_result.items():
                    if isinstance(score, float):
                        print(f"    {metric}: {score:.2%}")
        else:
            print(f"❌ 评估失败: {result.get('error')}")
    else:
        print(f"❌ 请求失败: {response.status_code}")
        print(response.text)
    print()


def main():
    """运行所有测试"""
    print("=" * 60)
    print("Ragas 评估服务测试")
    print("=" * 60)
    print()
    
    try:
        # 1. 健康检查
        test_health_check()
        
        # 2. 获取指标
        test_get_metrics()
        
        # 3. 单项评估（需要 OpenAI API Key）
        # 如果没有配置 API Key，这个测试会失败
        # test_single_evaluation()
        
        # 4. 批量评估（需要 OpenAI API Key）
        # test_batch_evaluation()
        
        print("=" * 60)
        print("提示: 要运行评估测试，请确保:")
        print("1. 服务正在运行 (python server.py)")
        print("2. 已配置 OPENAI_API_KEY")
        print("3. 取消注释评估测试函数")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到服务，请确保服务正在运行:")
        print("   python server.py")
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")


if __name__ == "__main__":
    main()

