/**
 * Ragas 评估 API
 * 执行单项或批量评估
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getRagasService } from '@fastgpt/service/core/app/evaluation/ragasService';
import type { RagasEvaluationItem } from '@fastgpt/global/core/app/evaluation/ragas';
import { jsonRes } from '@fastgpt/service/common/response';

export type EvaluateBody = {
  items: Array<{
    question: string;
    answer: string;
    contexts: string[];
    ground_truth?: string;
  }>;
  config?: {
    evaluation_model?: string;
    embedding_model?: string;
    enabled_metrics?: string[];
  };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 验证权限（支持应用 API Key）
    await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

    const { items, config } = req.body as EvaluateBody;

    // 验证请求数据
    if (!items || !Array.isArray(items) || items.length === 0) {
      return jsonRes(res, {
        code: 400,
        error: '评估项列表不能为空'
      });
    }

    if (items.length > 1000) {
      return jsonRes(res, {
        code: 400,
        error: '单次最多评估 1000 项'
      });
    }

    // 验证每一项的数据
    for (const item of items) {
      if (!item.question || !item.answer) {
        return jsonRes(res, {
          code: 400,
          error: '每个评估项必须包含问题和答案'
        });
      }
      if (!item.contexts || !Array.isArray(item.contexts) || item.contexts.length === 0) {
        return jsonRes(res, {
          code: 400,
          error: '每个评估项必须包含至少一个上下文'
        });
      }
    }

    // 获取 Ragas 服务
    const ragasService = getRagasService();

    // 执行评估
    const result = await ragasService.evaluateBatch(
      items as RagasEvaluationItem[],
      {
        evaluation_model: config?.evaluation_model || 'deepseek-v3-1-terminus',
        embedding_model: config?.embedding_model || 'doubao-embedding-text-240715',
        enabled_metrics: config?.enabled_metrics as any
      }
    );

    if (!result.success) {
      return jsonRes(res, {
        code: 500,
        error: result.error || '评估失败'
      });
    }

    return jsonRes(res, {
      data: result.data
    });
  } catch (error: any) {
    return jsonRes(res, {
      code: 500,
      error: error?.message || '评估失败'
    });
  }
}
