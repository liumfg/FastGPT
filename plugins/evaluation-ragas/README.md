# Ragas 评估服务

FastGPT 的 Ragas（RAG Assessment）评估服务，用于全面评估 RAG 应用的性能。

## 功能特性

- ✅ 支持多种 RAG 评估指标
- ✅ 批量评估支持
- ✅ REST API 接口
- ✅ Docker 容器化部署
- ✅ 支持自定义评估模型

## 支持的评估指标

### 检索质量指标

- **Context Precision（上下文精确度）**：评估检索到的上下文的精确性
- **Context Recall（上下文召回率）**：评估检索到的上下文是否包含了回答问题所需的信息
- **Context Relevancy（上下文相关性）**：评估检索到的上下文与问题的相关程度

### 生成质量指标

- **Faithfulness（忠实度）**：评估生成的答案是否忠实于给定的上下文
- **Answer Relevancy（答案相关性）**：评估答案与问题的相关程度
- **Answer Correctness（答案正确性）**：综合评估答案的准确性
- **Answer Similarity（答案相似度）**：评估生成答案与标准答案的相似度

## 快速开始

### 1. 安装依赖

```bash
cd plugins/evaluation-ragas
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少需要设置 `OPENAI_API_KEY`。

### 3. 启动服务

```bash
python server.py
```

服务将在 `http://localhost:8001` 启动。

### 4. 验证服务

```bash
curl http://localhost:8001/health
```

## Docker 部署

### 构建镜像

```bash
docker build -t fastgpt-ragas:latest .
```

### 运行容器

```bash
docker run -d \
  --name fastgpt-ragas \
  -p 8001:8001 \
  -e OPENAI_API_KEY=your-api-key \
  fastgpt-ragas:latest
```

### 使用 Docker Compose

在项目根目录的 `docker-compose.yml` 中添加：

```yaml
services:
  ragas-service:
    build: ./plugins/evaluation-ragas
    container_name: fastgpt-ragas
    ports:
      - "8001:8001"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - PORT=8001
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

然后启动：

```bash
docker-compose up -d ragas-service
```

## API 使用

### 获取可用指标

```bash
GET /metrics/available
```

响应示例：

```json
{
  "success": true,
  "data": {
    "metrics": [
      {
        "name": "context_precision",
        "label": "上下文精确度",
        "description": "评估检索到的上下文的精确性",
        "requires_ground_truth": true
      }
      // ...
    ],
    "total": 7
  }
}
```

### 单项评估

```bash
POST /evaluate/single
Content-Type: application/json

{
  "question": "什么是 FastGPT？",
  "answer": "FastGPT 是一个基于大语言模型的知识库问答平台。",
  "contexts": [
    "FastGPT 是一个基于 LLM 的知识库问答平台。",
    "它支持多种数据源和向量数据库。"
  ],
  "ground_truth": "FastGPT 是一个知识库问答平台。",
  "evaluation_model": "gpt-4",
  "enabled_metrics": ["faithfulness", "answer_relevancy"]
}
```

### 批量评估

```bash
POST /evaluate/batch
Content-Type: application/json

{
  "items": [
    {
      "question": "问题1",
      "answer": "答案1",
      "contexts": ["上下文1", "上下文2"],
      "ground_truth": "标准答案1"
    },
    {
      "question": "问题2",
      "answer": "答案2",
      "contexts": ["上下文3", "上下文4"]
    }
  ],
  "evaluation_model": "gpt-4",
  "enabled_metrics": ["faithfulness", "answer_relevancy", "context_relevancy"]
}
```

响应示例：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "question": "问题1",
        "answer": "答案1",
        "faithfulness": 0.85,
        "answer_relevancy": 0.92,
        "context_relevancy": 0.78
      }
      // ...
    ],
    "average_scores": {
      "faithfulness": 0.85,
      "answer_relevancy": 0.90,
      "context_relevancy": 0.80
    },
    "total_count": 2
  }
}
```

## 性能优化

### 1. 使用本地模型

对于大批量评估，建议使用本地部署的模型以降低成本和提高速度。

### 2. 批量处理

尽可能使用批量评估接口，可以提高效率。

### 3. 指标选择

根据实际需求选择必要的指标，避免计算不需要的指标。

## 故障排查

### 服务无法启动

1. 检查 Python 版本（需要 3.11+）
2. 确认所有依赖已正确安装
3. 检查端口 8001 是否被占用

### 评估失败

1. 确认 `OPENAI_API_KEY` 正确配置
2. 检查网络连接
3. 查看日志文件获取详细错误信息

### 超时错误

1. 增加 `REQUEST_TIMEOUT` 配置
2. 减少单次评估的数据量
3. 检查模型响应速度

## 许可证

与 FastGPT 主项目保持一致。

## 参考

- [Ragas 官方文档](https://docs.ragas.io/)
- [FastGPT 文档](https://doc.fastgpt.in/)

