/**
 * Ragas 评估服务
 * 负责与 Python Ragas 服务通信
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  RagasMetricInfo,
  RagasEvaluationItem,
  RagasEvaluationResult,
  RagasServiceConfig,
  RagasMetricName
} from '@fastgpt/global/core/app/evaluation/ragas';

export class RagasService {
  private client: AxiosInstance;
  private config: RagasServiceConfig;

  constructor(config: RagasServiceConfig) {
    this.config = {
      timeout: 300000, // 默认 5 分钟超时
      ...config
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` })
      }
    });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ status: string; message?: string }> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 获取可用的评估指标
   */
  async getAvailableMetrics(): Promise<RagasMetricInfo[]> {
    try {
      const response = await this.client.get('/metrics/available');
      return response.data.data.metrics;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 单项评估
   */
  async evaluateSingle(
    question: string,
    answer: string,
    contexts: string[],
    options?: {
      ground_truth?: string;
      evaluation_model?: string;
      embedding_model?: string;
      enabled_metrics?: RagasMetricName[];
    }
  ): Promise<any> {
    try {
      const response = await this.client.post('/evaluate/single', {
        question,
        answer,
        contexts,
        ground_truth: options?.ground_truth,
        evaluation_model: options?.evaluation_model || 'deepseek-v3-1-terminus',
        embedding_model: options?.embedding_model || 'doubao-embedding-text-240715',
        enabled_metrics: options?.enabled_metrics
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 批量评估
   */
  async evaluateBatch(
    items: RagasEvaluationItem[],
    options?: {
      evaluation_model?: string;
      embedding_model?: string;
      enabled_metrics?: RagasMetricName[];
    }
  ): Promise<RagasEvaluationResult> {
    try {
      const response = await this.client.post('/evaluate/batch', {
        items,
        evaluation_model: options?.evaluation_model || 'deepseek-v3-1-terminus',
        embedding_model: options?.embedding_model || 'doubao-embedding-text-240715',
        enabled_metrics: options?.enabled_metrics
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        // 服务器返回错误
        const data = axiosError.response.data as any;
        return new Error(data?.detail || data?.error || 'Ragas 服务错误');
      } else if (axiosError.request) {
        // 请求发出但没有收到响应
        return new Error('无法连接到 Ragas 服务，请检查服务是否运行');
      }
    }
    return error as Error;
  }
}

/**
 * 创建 Ragas 服务实例
 */
export function createRagasService(): RagasService {
  const baseUrl = process.env.RAGAS_SERVICE_URL || 'http://localhost:8001';
  const apiKey = process.env.RAGAS_API_KEY;

  return new RagasService({
    baseUrl,
    apiKey,
    timeout: parseInt(process.env.RAGAS_TIMEOUT || '300000')
  });
}

// 导出单例
let ragasServiceInstance: RagasService | null = null;

export function getRagasService(): RagasService {
  if (!ragasServiceInstance) {
    ragasServiceInstance = createRagasService();
  }
  return ragasServiceInstance;
}

