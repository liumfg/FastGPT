/**
 * Ragas 指标 API
 * 获取可用的 Ragas 评估指标
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getRagasService } from '@fastgpt/service/core/app/evaluation/ragasService';
import { jsonRes } from '@fastgpt/service/common/response';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 验证权限（支持应用 API Key）
    await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

    const ragasService = getRagasService();
    
    // 检查 Ragas 服务是否可用
    try {
      await ragasService.healthCheck();
    } catch (error) {
      return jsonRes(res, {
        code: 500,
        error: 'Ragas 服务不可用，请联系管理员'
      });
    }
    
    const metrics = await ragasService.getAvailableMetrics();
    
    return jsonRes(res, {
      data: {
        metrics,
        total: metrics.length
      }
    });
  } catch (error: any) {
    return jsonRes(res, {
      code: 500,
      error: error?.message || '获取指标列表失败'
    });
  }
}
