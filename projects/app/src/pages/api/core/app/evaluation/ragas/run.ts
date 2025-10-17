/**
 * Ragas 评测执行 API
 * 接收 CSV 数据和 appId，执行完整的评测流程
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { executeRagasEvaluation } from '@fastgpt/service/core/app/evaluation/ragasEvaluation';
import type { RagasMetricName } from '@fastgpt/global/core/app/evaluation/ragas';
import { parseCSV } from '@fastgpt/service/common/file/utils';
import { jsonRes } from '@fastgpt/service/common/response';

export type RunEvaluationBody = {
  appId: string;
  csvContent: string;  // CSV 文件内容（文本）
  evaluation_model?: string;
  embedding_model?: string;
  enabled_metrics?: RagasMetricName[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId, csvContent, evaluation_model, embedding_model, enabled_metrics } = req.body as RunEvaluationBody;

    if (!appId) {
      return jsonRes(res, {
        code: 400,
        error: '缺少 appId'
      });
    }

    if (!csvContent) {
      return jsonRes(res, {
        code: 400,
        error: '缺少 CSV 内容'
      });
    }

    // 验证用户对应用的权限（支持应用 API Key）
    const { appId: authAppId, teamId, tmbId } = await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

    // 使用认证返回的 appId 或请求中的 appId
    const finalAppId = authAppId || appId;

    // 解析 CSV 内容
    const rows = parseCSV(csvContent);

    if (rows.length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'CSV 内容为空'
      });
    }

    // 验证 CSV 格式（必须包含 question 列）
    const header = rows[0];
    if (!header.includes('question')) {
      return jsonRes(res, {
        code: 400,
        error: 'CSV 必须包含 question 列'
      });
    }

    const questionIndex = header.indexOf('question');
    const groundTruthIndex = header.indexOf('ground_truth');

    // 解析数据行
    const items = rows.slice(1).map((row, index) => {
      const item: any = {
        question: row[questionIndex]
      };

      // 调试日志：显示解析的问题
      console.log(`解析问题 ${index + 1}:`, {
        question: item.question,
        questionLength: item.question?.length || 0,
        hasNewlines: item.question?.includes('\n') || false
      });

      if (groundTruthIndex !== -1 && row[groundTruthIndex]) {
        item.ground_truth = row[groundTruthIndex];
      }

      // 解析其他列作为全局变量
      const globalVariables: Record<string, any> = {};
      header.forEach((col, index) => {
        if (col !== 'question' && col !== 'ground_truth' && row[index]) {
          globalVariables[col] = row[index];
        }
      });

      if (Object.keys(globalVariables).length > 0) {
        item.global_variables = globalVariables;
      }

      return item;
    });

    if (items.length === 0) {
      return jsonRes(res, {
        code: 400,
        error: 'CSV 没有有效数据'
      });
    }

    if (items.length > 100) {
      return jsonRes(res, {
        code: 400,
        error: '单次评测最多支持 100 个问题'
      });
    }

    console.log(`开始 Ragas 评测: ${finalAppId}, ${items.length} 个问题`);

    // 执行评测（使用火山方舟模型）
    const result = await executeRagasEvaluation({
      appId: finalAppId,
      items,
      config: {
        evaluation_model: evaluation_model || 'deepseek-v3-1-terminus',
        embedding_model: embedding_model || 'doubao-embedding-text-240715',
        enabled_metrics
      },
      teamId,
      tmbId,
      timezone: 'Asia/Shanghai'
    });

    return jsonRes(res, {
      data: result
    });
  } catch (error: any) {
    console.error('Ragas 评测失败:', error);
    return jsonRes(res, {
      code: 500,
      error: error?.message || 'Ragas 评测失败'
    });
  }
}

