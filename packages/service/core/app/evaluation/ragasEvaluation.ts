/**
 * Ragas 评测执行服务（支持 Flow 与 RAG 应用）
 * 负责读取 CSV、调用应用、捕获数据、执行评估
 */

import { getRagasService } from './ragasService';
import type { RagasMetricName } from '@fastgpt/global/core/app/evaluation/ragas';
import { dispatchWorkFlow } from '../../../core/workflow/dispatch';
import type { ChatDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { getAppLatestVersion } from '../version/controller';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';
import { 
  storeNodes2RuntimeNodes, 
  storeEdges2RuntimeEdges, 
  getWorkflowEntryNodeIds 
} from '@fastgpt/global/core/workflow/runtime/utils';
import { removeEmptyUserInput } from '@fastgpt/global/core/chat/utils';

export type RagasEvaluationItem = {
  question: string;
  ground_truth?: string;
  global_variables?: Record<string, any>;
};

export type RagasEvaluationTask = {
  appId: string;
  items: RagasEvaluationItem[];
  config?: {
    evaluation_model?: string;
    embedding_model?: string;
    enabled_metrics?: RagasMetricName[];
  };
  teamId: string;
  tmbId: string;
  timezone?: string;
};

export type RagasEvaluationItemResult = {
  question: string;
  answer: string;
  contexts: string[];
  ground_truth?: string;
  metrics?: {
    context_precision?: number;
    context_recall?: number;
    context_relevancy?: number;
    faithfulness?: number;
    answer_relevancy?: number;
    answer_correctness?: number;
    answer_similarity?: number;
  };
  error?: string;
};

/**
 * 执行单个问题的测试并捕获数据
 */
async function executeQuestion(params: {
  appId: string;
  question: string;
  globalVariables?: Record<string, any>;
  teamId: string;
  tmbId: string;
  timezone: string;
}): Promise<{ answer: string; contexts: string[] }> {
  const { appId, question, globalVariables, teamId, tmbId, timezone } = params;

  // 先获取完整的应用信息（包含 modules 作为 fallback）
  const appData = await MongoApp.findById(appId).lean();
  if (!appData) {
    throw new Error(`应用 ${appId} 不存在`);
  }

  // 获取应用最新版本（返回已发布版本的 nodes/edges/chatConfig）
  // 如果没有发布版本，会 fallback 到 appData.modules
  const app = await getAppLatestVersion(appId, appData);
  if (!app) {
    throw new Error(`应用版本信息获取失败`);
  }

  console.log('🟢 执行问题:', question.slice(0, 50));
  console.log('🟢 应用信息获取成功:', { 
    appName: app.versionName,
    modulesCount: app.nodes?.length || 0, 
    edgesCount: app.edges?.length || 0 
  });

  // 将存储的节点/连线转换为运行时结构
  const storeNodes = app.nodes || [];
  const storeEdges = app.edges || [];
  const entryIds = getWorkflowEntryNodeIds(storeNodes);
  const runtimeNodes = storeNodes2RuntimeNodes(storeNodes, entryIds);
  const runtimeEdges = storeEdges2RuntimeEdges(storeEdges);

  console.log('🟢 dispatchWorkFlow 参数:', JSON.stringify({
    mode: 'chat',
    timezone: timezone || 'Asia/Shanghai',
    runningAppInfo: {
      id: appId,
      teamId: teamId,
      tmbId: tmbId
    },
    runtimeNodes,
    runtimeEdges,
    runningUserInfo: {
      username: 'evaluation',
      teamName: 'evaluation',
      memberName: 'evaluation',
      contact: '',
      teamId: teamId,
      tmbId: tmbId
    },
    uid: tmbId,
    histories: [],
    variables: globalVariables || {},
    query: [
      {
        type: 'text',
        text: {
          content: question
        }
      }
    ],
    chatConfig: app.chatConfig || {},
    stream: false,
    retainDatasetCite: true,
    maxRunTimes: 100,
    workflowDispatchDeep: 0,
    responseAllData: true,
    responseDetail: true,
    externalProvider: {}
  }, null, 2));

  // 构建聊天请求
  const dispatchProps: ChatDispatchProps = {
    mode: 'chat',
    timezone: timezone || 'Asia/Shanghai',
    runningAppInfo: {
      id: appId,
      teamId: teamId,
      tmbId: tmbId,
      name: app.versionName || 'evaluation-app'
    },
    runningUserInfo: {
      username: 'evaluation',
      teamName: 'evaluation',
      memberName: 'evaluation',
      contact: '',
      teamId: teamId,
      tmbId: tmbId
    },
    uid: tmbId,
    histories: [],
    variables: globalVariables || {},
    query: removeEmptyUserInput([
      {
        type: 'text' as const,
        text: { content: question }
      }
    ] as any),
    chatConfig: app.chatConfig || {},
    stream: false,
    retainDatasetCite: true,
    maxRunTimes: 100,
    workflowDispatchDeep: 0,
    responseAllData: true,
    responseDetail: true,
    externalProvider: {}
  };

  try {
    // 执行工作流
    console.log('🟢 开始调用 dispatchWorkFlow...');
    const result = await dispatchWorkFlow({
      res: undefined,
      mode: dispatchProps.mode,
      runningAppInfo: dispatchProps.runningAppInfo,
      runningUserInfo: dispatchProps.runningUserInfo,
      uid: dispatchProps.uid,
      histories: dispatchProps.histories,
      variables: dispatchProps.variables,
      query: dispatchProps.query,
      chatConfig: dispatchProps.chatConfig,
      stream: dispatchProps.stream,
      retainDatasetCite: dispatchProps.retainDatasetCite,
      maxRunTimes: dispatchProps.maxRunTimes,
      responseAllData: dispatchProps.responseAllData,
      responseDetail: dispatchProps.responseDetail,
      runtimeNodes,
      runtimeEdges,
      usageSource: 'shareLink' as any,
      concatUsage: () => {} // 评测时不需要累计积分
    });

    console.log('🟢 dispatchWorkFlow 返回结果:', {
      flowResponsesCount: result.flowResponses?.length || 0,
      assistantResponsesCount: result.assistantResponses?.length || 0
    });

    // 提取答案（从 assistantResponses）
    let answer = '';
    if (result.assistantResponses && result.assistantResponses.length > 0) {
      for (const item of result.assistantResponses) {
        if (item.text?.content) {
          answer += item.text.content;
        }
      }
    }

    // 提取 contexts（从知识库搜索结果）
    const contexts: string[] = [];
    if (result.flowResponses) {
      for (const response of result.flowResponses) {
        // 查找知识库搜索节点的结果
        if (response.moduleType === 'datasetSearchNode' && response.quoteList) {
          for (const quote of response.quoteList) {
            if (quote.q || quote.a) {
              const context = [quote.q, quote.a].filter(Boolean).join('\n');
              if (context) {
                contexts.push(context);
              }
            }
          }
        }
      }
    }

    console.log('🟢 提取完成:', {
      answerLength: answer.length,
      contextsCount: contexts.length
    });

    return {
      answer: answer.trim() || '无响应',
      contexts: contexts.length > 0 ? contexts : ['无上下文']
    };
  } catch (error) {
    console.error('❌ 执行问题失败:', error);
    throw error;
  }
}

/**
 * 执行 Ragas 评测任务
 */
export async function executeRagasEvaluation(task: RagasEvaluationTask) {
  const ragasService = getRagasService();
  const results: RagasEvaluationItemResult[] = [];

  console.log(`开始评测任务: ${task.items.length} 个问题`);

  for (let i = 0; i < task.items.length; i++) {
    const item = task.items[i];
    console.log(`\n[${i + 1}/${task.items.length}] 处理问题: ${item.question.slice(0, 50)}...`);

    try {
      const { answer, contexts } = await executeQuestion({
        appId: task.appId,
        question: item.question,
        globalVariables: item.global_variables,
        teamId: task.teamId,
        tmbId: task.tmbId,
        timezone: task.timezone || 'Asia/Shanghai'
      });

      results.push({ question: item.question, answer, contexts, ground_truth: item.ground_truth });

      console.log(`  ✓ 获取答案长度: ${answer.length}, 上下文数: ${contexts.length}`);
    } catch (error: any) {
      console.error(`  ✗ 执行失败:`, error.message || error);
      results.push({ question: item.question, answer: '', contexts: [], ground_truth: item.ground_truth, error: error.message || '执行失败' });
    }
  }

  // ------------------- 过滤成功项 -------------------
  const successItems = results.filter(r => !r.error && r.answer && r.contexts.length > 0);
  if (!successItems.length) {
    console.error('❌ 所有问题执行失败，无法进行评估');
    return { success: false, results, error: '所有问题执行失败' };
  }

  console.log(`\n准备调用 Ragas 评估 ${successItems.length} 个成功项...`);

  try {
    const healthCheck = await ragasService.healthCheck();
    console.log(`✓ Ragas 服务健康检查通过:`, healthCheck);

    const ragasResult = await ragasService.evaluateBatch(
      successItems.map(item => ({
        question: item.question,
        answer: item.answer,
        contexts: item.contexts,
        ground_truth: item.ground_truth
      })),
      {
        evaluation_model: task.config?.evaluation_model || 'deepseek-v3-1-terminus',
        embedding_model: task.config?.embedding_model || 'doubao-embedding-text-240715',
        enabled_metrics: task.config?.enabled_metrics
      }
    );

    if (!ragasResult.success || !ragasResult.data) throw new Error(ragasResult.error || 'Ragas 评估失败');

    // 合并 Ragas 评估结果
    for (let i = 0; i < successItems.length; i++) {
      const index = results.findIndex(r => r.question === successItems[i].question);
      if (index !== -1) results[index].metrics = ragasResult.data.items[i];
    }

    console.log(`✓ Ragas 评估完成`);
    console.log('最终评测结果:', JSON.stringify(results, null, 2));


    return {
      success: true,
      results,
      summary: {
        total: task.items.length,
        success: successItems.length,
        failed: task.items.length - successItems.length,
        averageScores: ragasResult.data.average_scores
      }
    };
  } catch (error: any) {
    console.error('Ragas 评估失败:', error.message || error);
    return { success: false, results, error: error.message || 'Ragas 评估失败' };
  }
}
