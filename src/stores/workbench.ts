import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Excerpt, AIStatus, SummarySourceRef, ChatMessage, MessageType } from '@/types';

/**
 * 摘录池与 AI 综述状态 Store
 * 负责右侧工作台的核心业务数据
 */
export const useWorkbenchStore = defineStore('workbench', () => {
  // === 摘录池状态 ===
  const excerpts = ref<Excerpt[]>([]);

  // === AI 综述状态 (阶段 5B 升级为消息列表) ===
  const aiStatus = ref<AIStatus>('idle');
  const aiError = ref<string | null>(null);
  const revisionInstruction = ref<string>(''); // 用户的二次修改指令

  // 聊天消息列表
  const summaryMessages = ref<ChatMessage[]>([]);

  // 保留一个计算属性获取最新一版综述（给外部/后端传参使用）
  const currentSummary = computed(() => {
    const assistantMessages = summaryMessages.value.filter(m => m.role === 'assistant');
    return assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
  });

  // 保存用于中断流式请求的 AbortController
  const abortController = ref<AbortController | null>(null);

  // 【新增】生成综述时的来源快照与高亮状态
  const summarySources = ref<SummarySourceRef[]>([]);
  const activeExcerptId = ref<string | null>(null);

  // === 摘录 Actions ===
  /**
   * 添加一段新摘录
   */
  const addExcerpt = (excerpt: Excerpt) => {
    // 将最新摘录放在最前面
    excerpts.value.unshift(excerpt);
  };

  /**
   * 删除指定的摘录
   */
  const removeExcerpt = (id: string) => {
    excerpts.value = excerpts.value.filter(e => e.id !== id);
  };

  /**
   * 清空所有摘录
   */
  const clearExcerpts = () => {
    excerpts.value = [];
  };

  // === AI Actions ===
  /**
   * 更新 AI 状态
   */
  const setAIStatus = (status: AIStatus, error: string | null = null) => {
    aiStatus.value = status;
    aiError.value = error;
  };

  /**
   * 拼接流式文本（打字机效果）
   */
  const appendSummaryChunk = (chunk: string) => {
    if (summaryMessages.value.length === 0) return;
    const lastMessage = summaryMessages.value[summaryMessages.value.length - 1];
    // 只有 assistant 消息才允许流式追加
    if (lastMessage.role === 'assistant') {
      lastMessage.content += chunk;
    }
  };

  /**
   * 添加一条新消息
   */
  const addMessage = (role: 'user' | 'assistant', messageType: MessageType, content: string = '') => {
    summaryMessages.value.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      role,
      messageType,
      content,
      createdAt: Date.now()
    });
  };

  /**
   * 清理或重置 AI 综述状态
   */
  const resetSummary = () => {
    summaryMessages.value = [];
    aiStatus.value = 'idle';
    aiError.value = null;
    summarySources.value = [];
    activeExcerptId.value = null;
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
  };

  // 停止生成或修改综述
  const stopGeneration = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    if (aiStatus.value === 'generating' || aiStatus.value === 'revising') {
      aiStatus.value = 'error';
      aiError.value = '生成已被用户手动中断';
    }
  };

  // 【新增】建立快照，锁定当前摘录
  const createSummarySourcesSnapshot = () => {
    // 必须和后端的 Prompt 顺序保持一致！
    // 后端是按正序 (最早的在前面) 给大模型的，所以我们生成快照时，要从后往前标号，
    // 或者直接按倒序给它标记。
    // excerpts 数组是最新的在 index 0，最老的在末尾。
    const total = excerpts.value.length;
    summarySources.value = excerpts.value.map((excerpt, index) => ({
      label: total - index, // 确保最老的摘录是 [1]，最新的摘录是 [最大值]，与大模型阅读顺序一致
      excerptId: excerpt.id,
      documentId: excerpt.documentId,
      documentName: excerpt.documentName,
      pageNumber: excerpt.pageNumber,
      text: excerpt.text
    }));
  };

  // 【新增】设置当前高亮的来源卡片
  const setActiveExcerptId = (id: string | null) => {
    activeExcerptId.value = id;
  };

  /**
   * 阶段 7：用持久化快照恢复工作台数据。
   * 不恢复运行时状态，只恢复用户产出。
   */
  const hydratePersistedSession = (payload: {
    excerpts: Excerpt[];
    summaryMessages: ChatMessage[];
    summarySources: SummarySourceRef[];
    workbenchMode?: 'excerpt' | 'summary' | 'none';
  }) => {
    excerpts.value = payload.excerpts;
    summaryMessages.value = payload.summaryMessages;
    summarySources.value = payload.summarySources;
    aiStatus.value = 'idle';
    aiError.value = null;
    activeExcerptId.value = null;
    revisionInstruction.value = '';
    abortController.value = null;
  };

  /**
   * 阶段 7：清空本地会话相关的工作台状态。
   */
  const clearPersistedSessionState = () => {
    excerpts.value = [];
    summaryMessages.value = [];
    summarySources.value = [];
    aiStatus.value = 'idle';
    aiError.value = null;
    activeExcerptId.value = null;
    revisionInstruction.value = '';
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
  };

  return {
    // 状态
    excerpts,
    summaryMessages,
    currentSummary,
    aiStatus,
    aiError,
    abortController,
    summarySources,
    activeExcerptId,
    revisionInstruction,
    // 方法
    addMessage,
    addExcerpt,
    removeExcerpt,
    clearExcerpts,
    setAIStatus,
    appendSummaryChunk,
    resetSummary,
    createSummarySourcesSnapshot,
    setActiveExcerptId,
    stopGeneration,
    hydratePersistedSession,
    clearPersistedSessionState,
  };
});
