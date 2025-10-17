"""
Ragas 评估服务
FastAPI REST API 服务
"""

import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import logging

from evaluate import create_evaluator, RagasEvaluator

# 加载环境变量
load_dotenv()

# 火山方舟配置（硬编码）
os.environ["OPENAI_API_KEY"] = "d08f94e2-75e2-4f21-ad96-7b9296fa198d"
os.environ["OPENAI_API_BASE"] = "https://ark.cn-beijing.volces.com/api/v3"

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="Ragas Evaluation Service",
    description="RAG 应用评估服务",
    version="1.0.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 请求模型
class EvaluationItem(BaseModel):
    """单个评估项"""
    question: str = Field(..., description="问题")
    answer: str = Field(..., description="生成的答案")
    contexts: List[str] = Field(..., description="检索的上下文列表")
    ground_truth: Optional[str] = Field(None, description="标准答案")


class BatchEvaluationRequest(BaseModel):
    """批量评估请求"""
    items: List[EvaluationItem] = Field(..., description="评估项列表")
    evaluation_model: str = Field(default="deepseek-v3-1-terminus", description="评估模型（火山方舟）")
    embedding_model: str = Field(default="doubao-embedding-text-240715", description="嵌入模型（火山方舟）")
    enabled_metrics: Optional[List[str]] = Field(
        default=None, 
        description="启用的指标列表，不指定则使用全部"
    )


class SingleEvaluationRequest(BaseModel):
    """单项评估请求"""
    question: str = Field(..., description="问题")
    answer: str = Field(..., description="生成的答案")
    contexts: List[str] = Field(..., description="检索的上下文列表")
    ground_truth: Optional[str] = Field(None, description="标准答案")
    evaluation_model: str = Field(default="deepseek-v3-1-terminus", description="评估模型（火山方舟）")
    embedding_model: str = Field(default="doubao-embedding-text-240715", description="嵌入模型（火山方舟）")
    enabled_metrics: Optional[List[str]] = Field(None, description="启用的指标列表")


# 响应模型
class EvaluationResponse(BaseModel):
    """评估响应"""
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None


# 根路由
@app.get("/")
async def root():
    """服务健康检查"""
    return {
        "service": "Ragas Evaluation Service",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    try:
        # 火山方舟 API Key 已硬编码
        return {
            "status": "healthy",
            "message": "Service is running",
            "provider": "Volcengine (火山方舟)",
            "api_key": "d08f***198d"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@app.get("/metrics/available")
async def get_available_metrics():
    """
    获取所有可用的评估指标
    
    Returns:
        List[Dict]: 指标列表
    """
    try:
        metrics = RagasEvaluator.get_available_metrics()
        return {
            "success": True,
            "data": {
                "metrics": metrics,
                "total": len(metrics)
            }
        }
    except Exception as e:
        logger.error(f"获取指标列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/evaluate/single")
async def evaluate_single(request: SingleEvaluationRequest):
    """
    单项评估
    
    Args:
        request: 评估请求
        
    Returns:
        Dict: 评估结果
    """
    try:
        logger.info(f"开始单项评估: {request.question[:50]}...")
        
        # 创建评估器
        evaluator = create_evaluator(
            evaluation_model=request.evaluation_model,
            embedding_model=request.embedding_model,
            enabled_metrics=request.enabled_metrics
        )
        
        # 执行评估
        result = await evaluator.evaluate_single(
            question=request.question,
            answer=request.answer,
            contexts=request.contexts,
            ground_truth=request.ground_truth
        )
        
        if result["success"]:
            logger.info("单项评估完成")
            return {
                "success": True,
                "data": result["metrics"]
            }
        else:
            logger.error(f"评估失败: {result.get('error')}")
            raise HTTPException(status_code=500, detail=result.get("error"))
            
    except Exception as e:
        logger.error(f"单项评估异常: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/evaluate/batch")
async def evaluate_batch(request: BatchEvaluationRequest):
    """
    批量评估
    
    Args:
        request: 批量评估请求
        
    Returns:
        Dict: 评估结果
    """
    try:
        logger.info(f"开始批量评估: {len(request.items)} 项")
        
        # 验证数据
        if not request.items:
            raise HTTPException(status_code=400, detail="评估项列表不能为空")
        
        if len(request.items) > 1000:
            raise HTTPException(status_code=400, detail="单次最多评估 1000 项")
        
        # 创建评估器
        evaluator = create_evaluator(
            evaluation_model=request.evaluation_model,
            embedding_model=request.embedding_model,
            enabled_metrics=request.enabled_metrics
        )
        
        # 转换数据格式
        eval_items = [
            {
                "question": item.question,
                "answer": item.answer,
                "contexts": item.contexts,
                "ground_truth": item.ground_truth or ""
            }
            for item in request.items
        ]
        
        # 执行评估
        result = await evaluator.evaluate_batch(eval_items)
        
        if result["success"]:
            logger.info(f"批量评估完成: {result['total_count']} 项")
            return {
                "success": True,
                "data": {
                    "items": result["items"],
                    "average_scores": result["average_scores"],
                    "total_count": result["total_count"]
                }
            }
        else:
            logger.error(f"评估失败: {result.get('error')}")
            raise HTTPException(status_code=500, detail=result.get("error"))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量评估异常: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/evaluate/async")
async def evaluate_async(
    request: BatchEvaluationRequest,
    background_tasks: BackgroundTasks
):
    """
    异步批量评估（适用于大批量数据）
    
    Args:
        request: 批量评估请求
        background_tasks: 后台任务
        
    Returns:
        Dict: 任务ID
    """
    # TODO: 实现异步任务队列
    # 可以使用 Celery 或 Redis Queue
    raise HTTPException(status_code=501, detail="异步评估功能待实现")


# 运行服务
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8001"))
    
    logger.info(f"启动 Ragas 评估服务，端口: {port}")
    
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=True,  # 开发模式
        log_level="info"
    )

