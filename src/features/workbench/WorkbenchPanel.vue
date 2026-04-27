<script setup lang="ts">
import { useDocumentStore } from '@/stores/document';
import { useWorkbenchStore } from '@/stores/workbench';
import { Inbox, Zap, Trash2, Sparkles, StopCircle, RefreshCcw } from 'lucide-vue-next';
import { generateSummaryStream, reviseSummaryStream } from '@/services/ai.service';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ref, computed, nextTick } from 'vue';

const documentStore = useDocumentStore();
const workbenchStore = useWorkbenchStore();

const isReviseButtonDisabled = computed(() => {
  return workbenchStore.summaryMessages.length === 0 ||
    workbenchStore.summarySources.length === 0 ||
    !workbenchStore.revisionInstruction.trim() ||
    workbenchStore.aiStatus === 'generating' ||
    workbenchStore.aiStatus === 'revising';
});

// 添加对滚动容器的引用
const summaryListContainer = ref<HTMLDivElement | null>(null);
const copiedMessageId = ref<string | null>(null);
const copyToastText = ref('');
const isCopyToastVisible = ref(false);

// 提取一个通用的滚动到底部函数
const scrollToBottom = async () => {
  await nextTick();
  if (summaryListContainer.value) {
    summaryListContainer.value.scrollTop = summaryListContainer.value.scrollHeight;
  }
};

/**
 * 复制 assistant 消息的原始 Markdown。
 * 优先使用 Clipboard API；如果浏览器环境不支持，则降级为 textarea 方案。
 */
const copyMessageMarkdown = async (messageId: string, content: string) => {
  if (!content.trim()) return;

  try {
    await navigator.clipboard.writeText(content);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  copiedMessageId.value = messageId;
  copyToastText.value = 'Markdown 已复制';
  isCopyToastVisible.value = true;
  window.setTimeout(() => {
    if (copiedMessageId.value === messageId) {
      copiedMessageId.value = null;
    }
  }, 1500);

  window.setTimeout(() => {
    isCopyToastVisible.value = false;
  }, 1500);
};

/**
 * 阶段 4：将 Markdown 转为可点击引用的 HTML
 */
const renderMessageContent = (content: string) => {
  if (!content) return '';
  let rawHtml = marked(content, { async: false }) as string;
  // 把 [1] 替换为可以点击的按钮
  rawHtml = rawHtml.replace(
    /\[(\d+)\]/g,
    '<button class="source-ref-btn inline-flex items-center justify-center min-w-[1.2em] h-[1.2em] px-1 ml-1 text-[10px] font-bold text-blue-700 bg-blue-100 rounded-[3px] border border-blue-200 cursor-pointer hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors align-text-top shadow-sm leading-none" data-ref-label="$1">[$1]</button>'
  );
  return DOMPurify.sanitize(rawHtml);
};

/**
 * 触发流式综述生成（前端不再需要管 API Key）
 */
const handleGenerateSummary = async () => {
  if (workbenchStore.excerpts.length === 0) {
    alert('请先摘录 PDF 文本！');
    return;
  }

  // 1. 初始化状态
  workbenchStore.resetSummary();
  workbenchStore.revisionInstruction = ''; // 清空修改指令
  workbenchStore.setAIStatus('loading');
  documentStore.setWorkbenchMode('summary'); // 切换到 AI 综述模式

  // 【极其关键】在生成的那一瞬间，对当前的 excerpts 进行深拷贝备份
  workbenchStore.createSummarySourcesSnapshot();

  const abortController = new AbortController();
  workbenchStore.abortController = abortController;

  try {
    workbenchStore.setAIStatus('generating');
    workbenchStore.addMessage('assistant', 'summary_initial', ''); // 先塞一个空气泡

    await generateSummaryStream(
      workbenchStore.summarySources,
      (chunk: string) => {
        workbenchStore.appendSummaryChunk(chunk);
        scrollToBottom(); // 流式过程中自动滚到底部
      },
      abortController.signal
    );

    workbenchStore.setAIStatus('success');
    scrollToBottom();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('用户手动中断了生成');
      workbenchStore.setAIStatus('error', '生成已中断');
    } else {
      console.error('API Error:', error);
      workbenchStore.setAIStatus('error', error.message || '生成失败');
    }
  } finally {
    workbenchStore.abortController = null;
  }
};

/**
 * 发起二次修改
 */
const handleReviseSummary = async () => {
  if (isReviseButtonDisabled.value) return;

  const instruction = workbenchStore.revisionInstruction.trim();
  // 必须先取出当前最新一版 assistant 内容，再追加占位消息。
  // 否则 currentSummary 会被后面新插入的空 assistant 气泡“顶掉”，导致传给后端的是空字符串。
  const baseSummary = workbenchStore.currentSummary;

  if (!baseSummary) {
    workbenchStore.setAIStatus('error', '当前没有可修改的综述内容');
    return;
  }

  // 1. 把用户的修改指令作为气泡添加到列表中
  workbenchStore.addMessage('user', 'revision_instruction', instruction);
  workbenchStore.revisionInstruction = ''; // 发送后清空输入框

  // 2. 添加一个 AI 占位气泡
  workbenchStore.addMessage('assistant', 'revision_result', '');

  const abortController = new AbortController();
  workbenchStore.abortController = abortController;

  try {
    workbenchStore.setAIStatus('revising');

    let isFirstChunk = true;
    await reviseSummaryStream(
      baseSummary, // 传给后端：基于当前最新版本的综述
      workbenchStore.summarySources,
      instruction,
      (chunk: string) => {
        if (isFirstChunk) {
          isFirstChunk = false;
        }
        workbenchStore.appendSummaryChunk(chunk);
        scrollToBottom();
      },
      abortController.signal
    );

    // 如果整个流结束都没有收到任何有效 chunk，说明返回为空或协议异常。
    if (isFirstChunk) {
      workbenchStore.setAIStatus('error', '修改结果为空，请重试');
      return;
    }

    workbenchStore.setAIStatus('success');
    scrollToBottom();
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message.includes('中断')) {
      // 用户手动中断
    } else {
      workbenchStore.setAIStatus('error', error.message || '修改失败');
    }
  }
};

/**
 * 中断生成
 */
const handleAbort = () => {
  if (workbenchStore.abortController) {
    workbenchStore.abortController.abort();
  }
};

/**
 * 格式化时间戳
 */
const formatTime = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

// 【新增】处理引用回跳
const handleRefClick = (labelStr: string) => {
  // labelStr 已经是纯数字了
  const labelNum = parseInt(labelStr, 10);

  // 1. 从快照里找出对应的来源数据
  const source = workbenchStore.summarySources.find(s => s.label === labelNum);
  if (!source) {
    console.warn(`未找到标号为 [${labelNum}] 的原始摘录。可能大模型出现了幻觉。`);
    alert(`引用 [${labelNum}] 无法溯源，可能是 AI 生成的幻觉。`);
    return;
  }

  // 2. 高亮右侧卡片
  workbenchStore.setActiveExcerptId(source.excerptId);

  // 3. 通知左侧 PDF 跨文档异步跳转，并传递需要高亮的文本
  documentStore.jumpToDocumentPage(source.documentId, source.pageNumber, source.text);
};

// 【阶段 4】事件委托：监听整个 Markdown 容器里的点击事件
const handleMarkdownClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  // 如果点中的是带有 source-ref-btn 类的按钮
  if (target && target.classList.contains('source-ref-btn')) {
    const label = target.getAttribute('data-ref-label');
    if (label) {
      handleRefClick(label);
    }
  }
};

/**
 * 计算 assistant 消息的版本号。
 * 只对 assistant 消息编号，这样最终视觉上就是：
 * 综述版本 1 -> 修改要求 -> 综述版本 2 -> 修改要求 -> 综述版本 3
 */
const getAssistantVersion = (targetIndex: number) => {
  let version = 0;
  for (let i = 0; i <= targetIndex; i += 1) {
    if (workbenchStore.summaryMessages[i]?.role === 'assistant') {
      version += 1;
    }
  }
  return version;
};
</script>

<template>
  <aside class="w-80 bg-gray-50 border-l border-gray-200 flex flex-col h-full shrink-0">
    <!-- 轻量复制成功提醒 -->
    <div v-if="isCopyToastVisible"
      class="absolute top-4 right-4 z-30 rounded-lg bg-gray-900/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-sm">
      {{ copyToastText }}
    </div>

    <!-- 顶部标题栏 -->
    <div class="h-14 flex items-center justify-between px-4 border-b border-gray-200 bg-white shrink-0">
      <h2 class="text-sm font-bold text-gray-700 flex items-center gap-2">
        <Sparkles class="w-4 h-4 text-blue-500" />
        工作台
      </h2>
      <div class="flex gap-2">
        <button @click="documentStore.setWorkbenchMode('excerpt')"
          :class="documentStore.workbenchMode === 'excerpt' ? 'text-blue-600 font-medium' : 'text-gray-400 hover:text-gray-600'"
          class="text-xs transition-colors">
          摘录池
        </button>
        <button @click="documentStore.setWorkbenchMode('summary')"
          :class="documentStore.workbenchMode === 'summary' ? 'text-blue-600 font-medium' : 'text-gray-400 hover:text-gray-600'"
          class="text-xs transition-colors">
          AI 综述
        </button>
      </div>
    </div>

    <!-- 模式 1：摘录池 (Excerpt Mode) -->
    <div v-if="documentStore.workbenchMode === 'excerpt'" class="flex flex-col flex-1 overflow-hidden">
      <!-- 操作栏 -->
      <div class="p-3 border-b border-gray-200 bg-white flex justify-between items-center shrink-0">
        <span class="text-xs font-medium text-gray-500">共 {{ workbenchStore.excerpts.length }} 条摘录</span>

        <div class="flex gap-2">
          <button v-if="workbenchStore.excerpts.length > 0" @click="workbenchStore.clearExcerpts"
            class="text-xs text-red-500 hover:text-red-600 transition-colors">
            清空
          </button>
        </div>
      </div>

      <!-- 摘录列表区域 -->
      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <div v-if="workbenchStore.excerpts.length === 0"
          class="flex flex-col items-center justify-center h-full text-gray-400">
          <Inbox class="w-10 h-10 mb-3 opacity-50" />
          <p class="text-sm">暂无摘录</p>
          <p class="text-xs mt-1">在左侧 PDF 中划选文字以添加</p>
        </div>

        <!-- 摘录卡片 -->
        <div v-for="item in workbenchStore.excerpts" :key="item.id"
          class="border rounded-md p-3 shadow-sm group transition-all duration-300 relative" :class="[
            workbenchStore.activeExcerptId === item.id
              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-200'
              : 'bg-white border-gray-200 hover:border-blue-300'
          ]">
          <!-- 头部信息 -->
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
              <span class="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium shrink-0">
                P{{ item.pageNumber }}
              </span>
              <!-- 【必改项】展示文档名 -->
              <span class="text-xs text-gray-500 truncate" :title="item.documentName">
                {{ item.documentName }}
              </span>
            </div>
            <div class="flex items-center gap-2 shrink-0 ml-2">
              <!-- 【必改项】使用 createdAt -->
              <span class="text-[10px] text-gray-400">{{ formatTime(item.createdAt) }}</span>
              <button @click="workbenchStore.removeExcerpt(item.id)"
                class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除此摘录">
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <!-- TODO: DOMPurify 可以防 XSS，阶段3这里暂时简单渲染 -->
          <p class="text-sm text-gray-700 leading-relaxed break-words select-text">
            {{ item.text }}
          </p>
        </div>
      </div>

      <!-- 底部生成按钮区 -->
      <div class="p-4 border-t border-gray-200 bg-white shrink-0">
        <button @click="handleGenerateSummary" :disabled="workbenchStore.excerpts.length === 0"
          class="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
          <Zap class="w-4 h-4" />
          基于摘录生成综述
        </button>
      </div>
    </div>

    <!-- 模式 1：AI 综述模式 (多轮对话列表) -->
    <div v-else-if="documentStore.workbenchMode === 'summary'"
      class="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">

      <!-- 顶部固定提示与清空按钮 -->
      <div class="px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
        <p class="text-xs text-gray-500">
          基于左侧摘录池内容，生成多轮综述与修改记录。
        </p>
        <button v-if="workbenchStore.summaryMessages.length > 0" @click="workbenchStore.resetSummary"
          class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
          清空历史
        </button>
      </div>

      <!-- 消息列表滚动区 -->
      <div ref="summaryListContainer" class="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        <!-- 空状态占位 -->
        <div v-if="workbenchStore.summaryMessages.length === 0 && workbenchStore.aiStatus !== 'generating'"
          class="h-full flex flex-col items-center justify-center text-gray-400">
          <Sparkles class="w-10 h-10 mb-4 opacity-50" />
          <p class="text-sm">点击下方按钮生成第一版综述</p>
        </div>

        <!-- 消息气泡循环渲染区 -->
        <!-- 注意：外层事件委托 @click="handleMarkdownClick" 继续保留，以保证 [n] 均可点击 -->
        <div @click="handleMarkdownClick" class="space-y-6 pb-4">
          <div v-for="(msg, index) in workbenchStore.summaryMessages" :key="msg.id" class="flex flex-col w-full"
            :class="msg.role === 'user' ? 'items-end' : 'items-start'">
            <!-- 气泡标识/标题 -->
            <div class="text-[11px] font-medium mb-1 px-1 flex items-center justify-between gap-3 w-full"
              :class="msg.role === 'user' ? 'text-gray-500' : 'text-blue-600'">
              <div class="flex items-center">
                <template v-if="msg.messageType === 'summary_initial'">
                  <Sparkles class="w-3 h-3 mr-1" /> 综述版本 {{ getAssistantVersion(index) }}
                </template>
                <template v-else-if="msg.messageType === 'revision_result'">
                  <RefreshCcw class="w-3 h-3 mr-1" /> 综述版本 {{ getAssistantVersion(index) }}
                </template>
                <template v-else>
                  我的修改要求
                </template>
              </div>

              <button v-if="msg.role === 'assistant' && msg.content" type="button"
                class="text-[11px] px-2 py-1 rounded border transition-colors shrink-0" :class="copiedMessageId === msg.id
                  ? 'border-green-200 bg-green-50 text-green-600'
                  : 'border-gray-200 bg-white text-gray-500 hover:text-blue-600 hover:border-blue-200'"
                @click.stop="copyMessageMarkdown(msg.id, msg.content)">
                {{ copiedMessageId === msg.id ? '已复制' : '复制 Markdown' }}
              </button>
            </div>

            <!-- 气泡主体内容 -->
            <div class="max-w-[90%] rounded-xl px-4 py-3 shadow-sm border"
              :class="msg.role === 'user' ? 'bg-blue-50 border-blue-100 text-gray-800' : 'bg-white border-gray-200'">
              <!-- Assistant 内容渲染 (带 Markdown 和防 XSS) -->
              <div v-if="msg.role === 'assistant'" class="prose prose-sm prose-blue max-w-none text-gray-800"
                v-html="renderMessageContent(msg.content)"></div>

              <!-- User 内容渲染 (纯文本，保留换行) -->
              <div v-else class="whitespace-pre-wrap text-sm leading-relaxed">
                {{ msg.content }}
              </div>

              <!-- 流式加载动画 (只有最后一条是 assistant 且正在生成时才显示) -->
              <div
                v-if="msg.role === 'assistant' && !msg.content && (workbenchStore.aiStatus === 'generating' || workbenchStore.aiStatus === 'revising') && index === workbenchStore.summaryMessages.length - 1"
                class="flex items-center space-x-1 h-6 px-1">
                <div class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                <div class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                <div class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 错误提示信息 -->
        <div v-if="workbenchStore.aiStatus === 'error'"
          class="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 mt-4 flex items-center">
          <span class="mr-2">⚠️</span>
          {{ workbenchStore.aiError }}
        </div>
      </div>

      <!-- 底部操作区 (固定在底部) -->
      <div class="p-4 bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 flex-shrink-0">

        <!-- 首次生成区 -->
        <div v-if="workbenchStore.summaryMessages.length === 0" class="flex flex-col">
          <button @click="handleGenerateSummary"
            :disabled="workbenchStore.excerpts.length === 0 || workbenchStore.aiStatus === 'generating'"
            class="w-full flex items-center justify-center py-2.5 px-4 rounded-lg text-white font-medium transition-all"
            :class="workbenchStore.excerpts.length === 0 || workbenchStore.aiStatus === 'generating' ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md'">
            <template v-if="workbenchStore.aiStatus === 'generating'">
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              正在生成综述...
            </template>
            <template v-else>
              <Sparkles class="w-4 h-4 mr-2" /> 基于摘录生成综述
            </template>
          </button>
        </div>

        <!-- 多轮二次修改区 (生成过至少一版后显示) -->
        <div v-else class="flex flex-col space-y-3">
          <!-- 生成中断按钮 -->
          <button v-if="workbenchStore.aiStatus === 'generating' || workbenchStore.aiStatus === 'revising'"
            @click="workbenchStore.stopGeneration"
            class="self-center flex items-center justify-center py-1.5 px-4 rounded-full text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 text-xs font-medium transition-colors mb-2">
            <StopCircle class="w-3.5 h-3.5 mr-1" /> 中断生成
          </button>

          <div class="relative flex items-end">
            <textarea v-model="workbenchStore.revisionInstruction" placeholder="对当前综述提出修改要求（如：翻译成英文、精简字数...）"
              class="w-full pl-3 pr-24 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none min-h-[44px] max-h-[120px]"
              rows="1" @keydown.enter.prevent="handleReviseSummary"
              :disabled="workbenchStore.aiStatus === 'generating' || workbenchStore.aiStatus === 'revising'"></textarea>

            <button @click="handleReviseSummary" :disabled="isReviseButtonDisabled"
              class="absolute right-1.5 bottom-1.5 flex items-center justify-center py-1.5 px-3 rounded-lg text-white text-xs font-medium transition-all"
              :class="isReviseButtonDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'">
              发送修改
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 模式 0：占位模式 (未开启摘录) -->
    <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 text-center">
      <Inbox class="w-12 h-12 mb-4 opacity-50" />
      <h3 class="text-sm font-medium text-gray-600 mb-2">摘录池未激活</h3>
      <p class="text-xs leading-relaxed">
        请在左侧打开一份文档，并开启工作台模式。<br />
        (测试阶段：你可以通过 Vue DevTools 强制把 documentStore.workbenchMode 改为 'excerpt')
      </p>
    </div>
  </aside>
</template>
