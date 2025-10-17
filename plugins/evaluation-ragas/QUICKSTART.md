# Ragas 快速开始指南

这是一个纯后端的 Ragas 评估服务，不包含前端界面。所有功能通过 REST API 提供。

## 快速部署

### 方式一：Docker Compose（推荐）

1. **配置环境变量**

在项目根目录的 `.env` 文件中添加：

```bash
# OpenAI API Key（必需）
OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# Ragas 服务配置
RAGAS_SERVICE_URL=http://ragas-service:8001
```

2. **修改 docker-compose.yml**

在项目根目录的 `docker-compose.yml` 中添加 Ragas 服务：

```yaml
services:
  # ... 其他服务

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

3. **启动服务**

```bash
docker-compose up -d ragas-service
```

4. **验证服务**

```bash
curl http://localhost:8001/health
```

### 方式二：直接运行 Python 服务

1. **安装依赖**

```bash
cd plugins/evaluation-ragas
pip install -r requirements.txt
```

2. **配置环境**

```bash
cp .env.example .env
# 编辑 .env 文件，设置 OPENAI_API_KEY
```

3. **启动服务**

```bash
python server.py
```

## 使用方式

### 1. 通过 FastGPT API 调用

#### 获取可用的评估指标

```bash
curl -X GET "http://localhost:3000/api/core/app/evaluation/ragas/metrics" \
  -H "Authorization: Bearer YOUR_FASTGPT_TOKEN"
```

响应示例：

```json
{
  "code": 200,
  "data": {
    "metrics": [
      {
        "name": "context_precision",
        "label": "上下文精确度",
        "description": "评估检索到的上下文的精确性",
        "requires_ground_truth": true
      },
      {
        "name": "faithfulness",
        "label": "忠实度",
        "description": "评估生成的答案是否忠实于给定的上下文",
        "requires_ground_truth": false
      }
    ],
    "total": 7
  }
}
```

#### 执行批量评估

```bash
curl -X POST "http://localhost:3000/api/core/app/evaluation/ragas/evaluate" \
  -H "Authorization: Bearer YOUR_FASTGPT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "question": "什么是 FastGPT？",
        "answer": "FastGPT 是一个基于大语言模型的知识库问答平台。",
        "contexts": [
          "FastGPT 是一个基于 LLM 的知识库问答平台。",
          "它支持多种数据源和向量数据库。"
        ],
        "ground_truth": "FastGPT 是一个知识库问答平台。"
      }
    ],
    "config": {
      "evaluation_model": "gpt-4",
      "enabled_metrics": ["faithfulness", "answer_relevancy", "context_relevancy"]
    }
  }'
```

响应示例：

```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "faithfulness": 0.85,
        "answer_relevancy": 0.92,
        "context_relevancy": 0.78
      }
    ],
    "average_scores": {
      "faithfulness": 0.85,
      "answer_relevancy": 0.92,
      "context_relevancy": 0.78
    },
    "total_count": 1
  }
}
```

### 2. 直接调用 Ragas 服务

如果需要直接调用 Python 服务（不通过 FastGPT）：

```bash
curl -X POST "http://localhost:8001/evaluate/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "question": "什么是 FastGPT？",
        "answer": "FastGPT 是一个基于大语言模型的知识库问答平台。",
        "contexts": ["上下文1", "上下文2"],
        "ground_truth": "标准答案"
      }
    ],
    "evaluation_model": "gpt-4",
    "enabled_metrics": ["faithfulness", "answer_relevancy"]
  }'
```

### 3. 在代码中集成

#### TypeScript/JavaScript 示例

```typescript
import { getRagasService } from '@fastgpt/service/core/app/evaluation/ragasService';

async function evaluateRAG() {
  const ragasService = getRagasService();
  
  const items = [
    {
      question: "什么是 FastGPT？",
      answer: "FastGPT 是一个基于大语言模型的知识库问答平台。",
      contexts: ["上下文1", "上下文2"],
      ground_truth: "标准答案"
    }
  ];
  
  const result = await ragasService.evaluateBatch(items, {
    evaluation_model: 'gpt-4',
    enabled_metrics: ['faithfulness', 'answer_relevancy', 'context_relevancy']
  });
  
  console.log('评估结果:', result);
}
```

#### Python 示例

```python
import requests

url = "http://localhost:8001/evaluate/batch"
data = {
    "items": [
        {
            "question": "什么是 FastGPT？",
            "answer": "FastGPT 是一个基于大语言模型的知识库问答平台。",
            "contexts": ["上下文1", "上下文2"],
            "ground_truth": "标准答案"
        }
    ],
    "evaluation_model": "gpt-4",
    "enabled_metrics": ["faithfulness", "answer_relevancy"]
}

response = requests.post(url, json=data)
result = response.json()
print(result)
```

## 评估指标说明

### 检索质量指标

| 指标 | 说明 | 是否需要标准答案 |
|-----|------|----------------|
| context_precision | 检索到的上下文的精确性 | ✅ 需要 |
| context_recall | 检索到的上下文是否包含回答所需信息 | ✅ 需要 |
| context_relevancy | 检索到的上下文与问题的相关程度 | ❌ 不需要 |

### 生成质量指标

| 指标 | 说明 | 是否需要标准答案 |
|-----|------|----------------|
| faithfulness | 答案是否忠实于给定的上下文 | ❌ 不需要 |
| answer_relevancy | 答案与问题的相关程度 | ❌ 不需要 |
| answer_correctness | 答案的准确性（综合评估） | ✅ 需要 |
| answer_similarity | 与标准答案的相似度 | ✅ 需要 |

## 数据格式要求

### 输入数据格式

每个评估项必须包含：

```json
{
  "question": "问题文本",          // 必需
  "answer": "生成的答案文本",       // 必需
  "contexts": ["上下文1", "上下文2"], // 必需，至少一个上下文
  "ground_truth": "标准答案"       // 可选，部分指标需要
}
```

### 指标配置

```json
{
  "evaluation_model": "gpt-4",     // 可选，默认 gpt-4
  "embedding_model": "text-embedding-3-small", // 可选
  "enabled_metrics": [              // 可选，不指定则使用全部
    "faithfulness",
    "answer_relevancy",
    "context_relevancy"
  ]
}
```

## 性能优化建议

### 1. 批量处理

尽可能使用批量评估接口，避免频繁的单次请求：

```typescript
// ✅ 推荐：批量处理
await ragasService.evaluateBatch([item1, item2, item3]);

// ❌ 不推荐：循环单次请求
for (const item of items) {
  await ragasService.evaluateSingle(...);
}
```

### 2. 选择必要的指标

只启用需要的指标，可以显著提高速度：

```typescript
// 只评估核心指标
enabled_metrics: ['faithfulness', 'answer_relevancy']
```

### 3. 调整超时时间

对于大批量数据，增加超时时间：

```bash
# .env 文件
RAGAS_TIMEOUT=600000  # 10 分钟
```

### 4. 使用更快的模型

对于非关键评估，可以使用更快的模型：

```typescript
evaluation_model: 'gpt-3.5-turbo'  // 而不是 gpt-4
```

## 故障排查

### 服务无法启动

```bash
# 检查服务状态
docker-compose ps ragas-service

# 查看日志
docker-compose logs ragas-service

# 重启服务
docker-compose restart ragas-service
```

### 评估失败

1. **检查 API Key**
   ```bash
   docker-compose exec ragas-service env | grep OPENAI_API_KEY
   ```

2. **查看详细日志**
   ```bash
   docker-compose logs -f ragas-service
   ```

3. **测试网络连接**
   ```bash
   docker-compose exec ragas-service curl https://api.openai.com/v1/models
   ```

### 超时错误

- 减少单次评估的数据量（建议 < 100 项）
- 增加 `RAGAS_TIMEOUT` 配置
- 检查 OpenAI API 响应速度

## 成本估算

Ragas 评估需要调用 OpenAI API，以下是大致成本估算：

- **评估模型**：gpt-4
- **单项评估 token 消耗**：约 1000-3000 tokens
- **成本**：约 $0.03-0.10 per item

**建议**：
- 开发测试使用 gpt-3.5-turbo（成本更低）
- 生产环境使用 gpt-4（质量更高）
- 批量评估可以降低平均成本

## 下一步

1. ✅ 部署并测试 Ragas 服务
2. ✅ 通过 API 进行评估测试
3. 📝 集成到现有的评测流程中
4. 📊 收集评估数据并优化
5. 🎯 根据评估结果改进 RAG 应用

## 参考资料

- [Ragas 官方文档](https://docs.ragas.io/)
- [FastGPT 文档](https://doc.fastgpt.in/)
- [项目 README](./README.md)

