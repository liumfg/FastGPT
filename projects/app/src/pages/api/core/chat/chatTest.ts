import type { NextApiRequest, NextApiResponse } from 'next';
import { sseErrRes } from '@fastgpt/service/common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import type { AIChatItemType, UserChatItemType } from '@fastgpt/global/core/chat/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  concatHistories,
  getChatTitleFromChatMessage,
  removeEmptyUserInput
} from '@fastgpt/global/core/chat/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getPluginRunUserQuery,
  updatePluginInputByVariables
} from '@fastgpt/global/core/workflow/utils';
import { NextAPI } from '@/service/middleware/entry';
import { chatValue2RuntimePrompt, GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  getLastInteractiveValue,
  getMaxHistoryLimitFromNodes,
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  rewriteNodeOutputByHistories,
  storeNodes2RuntimeNodes,
  textAdaptGptResponse
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { getWorkflowResponseWrite } from '@fastgpt/service/core/workflow/dispatch/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { getPluginInputsFromStoreNodes } from '@fastgpt/global/core/app/plugin/utils';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import { saveChat, updateInteractiveChat } from '@fastgpt/service/core/chat/saveChat';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { filterDatasetsByTmbId } from '@fastgpt/service/core/dataset/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { addLog } from '@fastgpt/service/common/system/log';

export type Props = {
  messages: ChatCompletionMessageParam[];
  responseChatItemId: string;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  variables: Record<string, any>;
  appId: string;
  appName: string;
  chatId: string;
  chatConfig: AppChatConfigType;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  let {
    nodes = [],
    edges = [],
    messages = [],
    responseChatItemId,
    variables = {},
    appName,
    appId,
    chatConfig,
    chatId
  } = req.body as Props;
  try {
    if (!Array.isArray(nodes)) {
      throw new Error('Nodes is not array');
    }
    if (!Array.isArray(edges)) {
      throw new Error('Edges is not array');
    }
    const chatMessages = GPTMessages2Chats({ messages });
    // console.log(JSON.stringify(chatMessages, null, 2), '====', chatMessages.length);

    /* user auth */
    const { app, teamId, tmbId } = await authApp({
      req,
      authToken: true,
      appId,
      per: ReadPermissionVal
    });

    const isPlugin = app.type === AppTypeEnum.plugin;
    const isTool = app.type === AppTypeEnum.tool;

    const userQuestion: UserChatItemType = await (async () => {
      if (isPlugin) {
        return getPluginRunUserQuery({
          pluginInputs: getPluginInputsFromStoreNodes(app.modules),
          variables,
          files: variables.files
        });
      }
      if (isTool) {
        return {
          obj: ChatRoleEnum.Human,
          value: [
            {
              type: ChatItemValueTypeEnum.text,
              text: { content: 'tool test' }
            }
          ]
        };
      }

      const latestHumanChat = chatMessages.pop() as UserChatItemType;
      if (!latestHumanChat) {
        return Promise.reject('User question is empty');
      }
      return latestHumanChat;
    })();

    const limit = getMaxHistoryLimitFromNodes(nodes);
    const [{ histories }, chatDetail] = await Promise.all([
      getChatItems({
        appId,
        chatId,
        offset: 0,
        limit,
        field: `obj value memories`
      }),
      MongoChat.findOne({ appId: app._id, chatId }, 'source variableList variables')
      // auth balance
    ]);

    if (chatDetail?.variables) {
      variables = {
        ...chatDetail.variables,
        ...variables
      };
    }

    const newHistories = concatHistories(histories, chatMessages);
    const interactive = getLastInteractiveValue(newHistories) || undefined;
    // Get runtimeNodes
    let runtimeNodes = storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes, interactive));
    if (isPlugin) {
      runtimeNodes = updatePluginInputByVariables(runtimeNodes, variables);
      variables = {};
    }
    runtimeNodes = rewriteNodeOutputByHistories(runtimeNodes, interactive);

    /* Natural language dataset selection for test api */
    try {
      addLog.info('[kb-nl][test] start parse');
      const lastUserText = chatValue2RuntimePrompt(userQuestion.value).text || '';
      addLog.info('[kb-nl][test] lastUserText', { text: lastUserText?.slice(0, 200) });
      const datasetNames = (() => {
        const text = lastUserText;
        const names = new Set<string>();
        const pushNames = (s: string) => {
          s
            .split(/[,，;；/\\\s]+/)
            .map((v) => v.trim())
            .filter((v) => v.length > 0)
            .forEach((v) => names.add(v));
        };
        const patterns: RegExp[] = [
          /使用(?:的)?(?:知识库|数据集|库)[:：]?\s*([^。.!！?？\n]+)/i,
          /用(?:到)?(?:知识库|数据集|库)[:：]?\s*([^。.!！?？\n]+)/i,
          /从\s*([^。.!！?？\n]+?)\s*(?:知识库|数据集|库)\s*(?:检索|搜索|查询)/i,
          /\b(?:kb|dataset)\s*[:：=]\s*([^。.!！?？\n]+)/i
        ];
        for (const reg of patterns) {
          const m = text.match(reg);
          if (m && m[1]) pushNames(m[1]);
        }
        return Array.from(names);
      })();
      addLog.info('[kb-nl][test] parsed names', { datasetNames });

      if (datasetNames.length > 0) {
        const all = await MongoDataset.find({ teamId: app.teamId }, '_id name').lean();
        addLog.info('[kb-nl][test] all datasets', {
          count: all.length,
          names: all.slice(0, 20).map((d: any) => d.name)
        });
        const candIds = all
          .filter((ds) =>
            datasetNames.some((n) => String(ds.name).toLowerCase().includes(n.toLowerCase()))
          )
          .map((ds) => String(ds._id));
        addLog.info('[kb-nl][test] candidate ids', { candCount: candIds.length });

        let authedIds: string[] = [];
        try {
          if (tmbId) {
            authedIds = await filterDatasetsByTmbId({ datasetIds: candIds, tmbId: String(tmbId) });
          } else {
            addLog.info('[kb-nl][test] no tmbId, skip auth filter');
            authedIds = candIds;
          }
        } catch (err) {
          addLog.warn?.('[kb-nl][test] auth filter error, fallback to candIds', { error: String(err) });
          authedIds = candIds;
        }
        const selected = authedIds.map((id) => ({ datasetId: id }));
        addLog.info('[kb-nl][test] authed ids', { authedCount: authedIds.length });

        if (selected.length > 0) {
          let updatedNodeCount = 0;
          runtimeNodes = runtimeNodes.map((node) => {
            if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return node;
            let applied = false;
            const inputs = node.inputs?.map((input) => {
              if (input.key === (NodeInputKeyEnum.datasetSelectList as any)) {
                applied = true;
                return { ...input, value: selected };
              }
              return input;
            });
            if (applied) updatedNodeCount++;
            return { ...node, inputs };
          });
          addLog.info('[kb-nl][test] applied datasets to nodes', {
            updatedNodeCount,
            selectedCount: selected.length
          });
        } else {
          addLog.info('[kb-nl][test] no authed dataset matched');
        }
      } else {
        addLog.info('[kb-nl][test] no dataset names parsed from text');
      }
    } catch (e) {
      addLog.warn?.('[kb-nl][test] dataset selection error', { error: String(e) });
    }

    const workflowResponseWrite = getWorkflowResponseWrite({
      res,
      detail: true,
      streamResponse: true,
      id: chatId,
      showNodeStatus: true
    });

    /* start process */
    const { flowResponses, assistantResponses, system_memories, newVariables, durationSeconds } =
      await dispatchWorkFlow({
        res,
        lang: getLocale(req),
        requestOrigin: req.headers.origin,
        mode: 'test',
        usageSource: UsageSourceEnum.fastgpt,

        uid: tmbId,

        runningAppInfo: {
          id: appId,
          name: appName,
          teamId: app.teamId,
          tmbId: app.tmbId
        },
        runningUserInfo: await getRunningUserInfoByTmbId(tmbId),

        chatId,
        responseChatItemId,
        runtimeNodes,
        runtimeEdges: storeEdges2RuntimeEdges(edges, interactive),
        variables,
        query: removeEmptyUserInput(userQuestion.value),
        lastInteractive: interactive,
        chatConfig,
        histories: newHistories,
        stream: true,
        maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
        workflowStreamResponse: workflowResponseWrite,
        version: 'v2',
        responseDetail: true
      });

    workflowResponseWrite({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: null,
        finish_reason: 'stop'
      })
    });
    responseWrite({
      res,
      event: SseResponseEventEnum.answer,
      data: '[DONE]'
    });

    // save chat
    const isInteractiveRequest = !!getLastInteractiveValue(histories);
    const { text: userInteractiveVal } = chatValue2RuntimePrompt(userQuestion.value);

    const newTitle = isPlugin
      ? variables.cTime ?? formatTime2YMDHM()
      : getChatTitleFromChatMessage(userQuestion);

    const aiResponse: AIChatItemType & { dataId?: string } = {
      dataId: responseChatItemId,
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
    };
    const params = {
      chatId,
      appId: app._id,
      teamId,
      tmbId: tmbId,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      isUpdateUseTime: false, // owner update use time
      newTitle,
      source: ChatSourceEnum.test,
      userContent: userQuestion,
      aiContent: aiResponse,
      durationSeconds
    };

    if (isInteractiveRequest) {
      await updateInteractiveChat(params);
    } else {
      await saveChat(params);
    }
  } catch (err: any) {
    res.status(500);
    sseErrRes(res, err);
  }
  res.end();
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '20mb'
  }
};
