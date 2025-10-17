/**
 * Ragas 评估相关类型定义
 */

export type RagasMetricName =
  | 'context_precision'
  | 'context_recall'
  | 'context_relevancy'
  | 'faithfulness'
  | 'answer_relevancy'
  | 'answer_correctness'
  | 'answer_similarity';

export type RagasMetricsType = {
  // 检索质量指标
  context_precision?: number;
  context_recall?: number;
  context_relevancy?: number;

  // 生成质量指标
  faithfulness?: number;
  answer_relevancy?: number;
  answer_correctness?: number;
  answer_similarity?: number;
};

export type RagasMetricInfo = {
  name: RagasMetricName;
  label: string;
  description: string;
  requires_ground_truth: boolean;
  category?: 'retrieval' | 'generation';
};

export type RagasEvaluationConfig = {
  enabled_metrics: RagasMetricName[];
  evaluation_model?: string;
  embedding_model?: string;
};

export type RagasEvaluationItem = {
  question: string;
  answer: string;
  contexts: string[];
  ground_truth?: string;
};

export type RagasEvaluationResult = {
  success: boolean;
  data?: {
    items: Array<RagasMetricsType & { question: string; answer: string }>;
    average_scores: RagasMetricsType;
    total_count: number;
  };
  error?: string;
};

export type RagasServiceConfig = {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
};

// 扩展原有的 EvalItemSchemaType
export type EvalItemWithRagas = {
  // Ragas 相关字段
  contexts?: string[];
  ragasMetrics?: RagasMetricsType;
  ragasConfig?: RagasEvaluationConfig;
};

