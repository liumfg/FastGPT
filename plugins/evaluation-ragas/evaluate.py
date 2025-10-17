"""
Ragas 评估核心模块
用于评估 RAG 应用的各项指标
"""

import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import pandas as pd
from ragas import evaluate
from ragas.metrics import (
    context_precision,
    context_recall,
    faithfulness,
    answer_relevancy,
    answer_correctness,
    answer_similarity,
)
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from datasets import Dataset
from langchain_core.embeddings import Embeddings
import requests
import json
from openai import OpenAI


class VolcengineEmbeddings(Embeddings):
    """火山方舟自定义 Embedding 类（基于官方模板）"""
    
    def __init__(self, model: str, api_key: str, base_url: str):
        self.model = model
        self.api_key = api_key
        self.base_url = base_url
        # 使用官方 OpenAI 客户端
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )
    
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """嵌入文档列表"""
        embeddings = []
        for text in texts:
            # 确保输入是字符串
            if isinstance(text, (list, tuple)):
                text = str(text)
            elif not isinstance(text, str):
                text = str(text)
            
            embedding = self._get_embedding(text)
            embeddings.append(embedding)
        return embeddings
    
    def embed_query(self, text: str) -> List[float]:
        """嵌入查询文本"""
        if isinstance(text, (list, tuple)):
            text = str(text)
        elif not isinstance(text, str):
            text = str(text)
        
        return self._get_embedding(text)
    
    def _get_embedding(self, text: str) -> List[float]:
        """获取单个文本的嵌入向量（使用官方 API）"""
        try:
            # 使用官方 OpenAI 客户端调用火山方舟 API
            resp = self.client.embeddings.create(
                model=self.model,
                input=[text],  # 注意：官方 API 需要列表格式
                encoding_format="float"
            )
            return resp.data[0].embedding
            
        except Exception as e:
            print(f"Embedding 错误: {e}")
            # 返回零向量作为后备（火山方舟实际维度是 2560）
            return [0.0] * 2560


@dataclass
class EvaluationConfig:
    """评估配置"""
    evaluation_model: str = "deepseek-v3-1-terminus"  # 使用火山方舟 DeepSeek 模型
    embedding_model: str = "doubao-embedding-text-240715"  # 火山方舟嵌入模型
    enabled_metrics: List[str] = None
    temperature: float = 0.3
    max_retries: int = 3
    timeout: int = 120
    # 语言模型配置（临时使用火山方舟）
    llm_api_key: str = "d08f94e2-75e2-4f21-ad96-7b9296fa198d"
    llm_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    # 嵌入模型配置（火山方舟）
    embedding_api_key: str = "d08f94e2-75e2-4f21-ad96-7b9296fa198d"
    embedding_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    
    def __post_init__(self):
        if self.enabled_metrics is None:
            self.enabled_metrics = [
                "context_precision",
                "context_recall", 
                "faithfulness",
                "answer_relevancy",
                "answer_correctness"
            ]


class RagasEvaluator:
    """Ragas 评估器"""
    
    # 可用的评估指标映射
    METRICS_MAP = {
        "context_precision": context_precision,
        "context_recall": context_recall,
        "faithfulness": faithfulness,
        "answer_relevancy": answer_relevancy,
        "answer_correctness": answer_correctness,
        "answer_similarity": answer_similarity,
    }
    
    def __init__(self, config: EvaluationConfig):
        self.config = config
        
        # 配置本地 DeepSeek 模型
        self.llm = ChatOpenAI(
            model=config.evaluation_model,
            temperature=config.temperature,
            max_retries=config.max_retries,
            timeout=config.timeout,
            api_key=config.llm_api_key,
            base_url=config.llm_base_url
        )
        
        # 使用火山方舟 embedding 类
        self.embeddings = VolcengineEmbeddings(
            model=config.embedding_model,
            api_key=config.embedding_api_key,
            base_url=config.embedding_base_url
        )
        
    def _prepare_dataset(self, eval_items: List[Dict[str, Any]]) -> Dataset:
        """
        准备评估数据集
        
        Args:
            eval_items: 评估项列表，每项包含：
                - question: 问题
                - answer: 生成的答案
                - contexts: 检索的上下文列表
                - ground_truth: 标准答案（可选）
        
        Returns:
            Dataset: Ragas 数据集
        """
        data = {
            "question": [],
            "answer": [],
            "contexts": [],
            "ground_truth": []
        }
        
        for item in eval_items:
            data["question"].append(item.get("question", ""))
            data["answer"].append(item.get("answer", ""))
            data["contexts"].append(item.get("contexts", []))
            data["ground_truth"].append(item.get("ground_truth", ""))
        
        return Dataset.from_dict(data)
    
    def _get_enabled_metrics(self):
        """获取启用的评估指标"""
        metrics = []
        for metric_name in self.config.enabled_metrics:
            if metric_name in self.METRICS_MAP:
                metrics.append(self.METRICS_MAP[metric_name])
        return metrics
    
    async def evaluate_batch(
        self, 
        eval_items: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        批量评估
        
        Args:
            eval_items: 评估项列表
            
        Returns:
            Dict: 评估结果，包含每个项目的各项指标得分
        """
        try:
            # 准备数据集
            dataset = self._prepare_dataset(eval_items)
            
            # 获取启用的指标
            metrics = self._get_enabled_metrics()
            
            if not metrics:
                raise ValueError("没有启用任何评估指标")
            
            # 执行评估
            result = evaluate(
                dataset,
                metrics=metrics,
                llm=self.llm,
                embeddings=self.embeddings,
            )
            
            # 转换结果为字典格式
            result_dict = result.to_pandas().to_dict('records')
            
            # 计算平均分数
            avg_scores = {}
            for metric_name in self.config.enabled_metrics:
                if metric_name in result_dict[0] if result_dict else False:
                    scores = [r.get(metric_name, 0) for r in result_dict]
                    avg_scores[metric_name] = sum(scores) / len(scores) if scores else 0
            
            return {
                "success": True,
                "items": result_dict,
                "average_scores": avg_scores,
                "total_count": len(eval_items)
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    async def evaluate_single(
        self,
        question: str,
        answer: str,
        contexts: List[str],
        ground_truth: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        单项评估
        
        Args:
            question: 问题
            answer: 生成的答案
            contexts: 检索的上下文列表
            ground_truth: 标准答案（可选）
            
        Returns:
            Dict: 评估结果
        """
        eval_item = {
            "question": question,
            "answer": answer,
            "contexts": contexts,
            "ground_truth": ground_truth or ""
        }
        
        result = await self.evaluate_batch([eval_item])
        
        if result["success"] and result["items"]:
            return {
                "success": True,
                "metrics": result["items"][0]
            }
        else:
            return result
    
    @classmethod
    def get_available_metrics(cls) -> List[Dict[str, str]]:
        """
        获取所有可用的评估指标
        
        Returns:
            List[Dict]: 指标列表，包含名称和描述
        """
        return [
            {
                "name": "context_precision",
                "label": "上下文精确度",
                "description": "评估检索到的上下文的精确性",
                "requires_ground_truth": True
            },
            {
                "name": "context_recall",
                "label": "上下文召回率",
                "description": "评估检索到的上下文是否包含了回答问题所需的信息",
                "requires_ground_truth": True
            },
            {
                "name": "context_relevancy",
                "label": "上下文相关性",
                "description": "评估检索到的上下文与问题的相关程度",
                "requires_ground_truth": False
            },
            {
                "name": "faithfulness",
                "label": "忠实度",
                "description": "评估生成的答案是否忠实于给定的上下文",
                "requires_ground_truth": False
            },
            {
                "name": "answer_relevancy",
                "label": "答案相关性",
                "description": "评估答案与问题的相关程度",
                "requires_ground_truth": False
            },
            {
                "name": "answer_correctness",
                "label": "答案正确性",
                "description": "综合评估答案的准确性",
                "requires_ground_truth": True
            },
            {
                "name": "answer_similarity",
                "label": "答案相似度",
                "description": "评估生成答案与标准答案的相似度",
                "requires_ground_truth": True
            }
        ]


def create_evaluator(
    evaluation_model: str = "deepseek-v3-1-terminus",
    embedding_model: str = "doubao-embedding-text-240715",
    enabled_metrics: Optional[List[str]] = None
) -> RagasEvaluator:
    """
    创建评估器实例
    
    Args:
        evaluation_model: 评估使用的模型（本地 DeepSeek）
        embedding_model: 嵌入模型（火山方舟）
        enabled_metrics: 启用的指标列表
        
    Returns:
        RagasEvaluator: 评估器实例
    """
    config = EvaluationConfig(
        evaluation_model=evaluation_model,
        embedding_model=embedding_model,
        enabled_metrics=enabled_metrics
    )
    return RagasEvaluator(config)


# 示例用法
if __name__ == "__main__":
    import asyncio
    
    # 创建评估器
    evaluator = create_evaluator()
    
    # 示例数据
    test_data = [
        {
            "question": "什么是 FastGPT？",
            "answer": "FastGPT 是一个基于大语言模型的知识库问答平台。",
            "contexts": [
                "FastGPT 是一个基于 LLM 的知识库问答平台。",
                "它支持多种数据源和向量数据库。"
            ],
            "ground_truth": "FastGPT 是一个知识库问答平台。"
        }
    ]
    
    # 执行评估
    async def test():
        result = await evaluator.evaluate_batch(test_data)
        print(result)
    
    asyncio.run(test())

