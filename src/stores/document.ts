import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DocumentInfo, ViewerState, WorkbenchMode, PendingJump } from '@/types';

/**
 * 核心文档状态 Store
 * 使用 Pinia Composition API 模式
 */
export const useDocumentStore = defineStore('document', () => {
  // 状态定义
  const documents = ref<DocumentInfo[]>([]);//存储所有上传的文档信息
  /**
   * 当前活动中的文档 ID
   * 用于标识当前正在查看的文档
   */
  const activeDocumentId = ref<string | null>(null);//当前活动中的文档 ID
  const uploadError = ref<string | null>(null);//上传错误提示
  /**
   * 当前右侧工作区模式
   * 用于切换左侧导航栏和右侧工作区的显示
   */
  const workbenchMode = ref<WorkbenchMode>('none');//当前右侧工作区模式
  
  /**
   * 当前 PDF 视图状态
   * 包括当前页面、总页数、缩放比例等
   * 记录当前 PDF 阅读器的 UI 状态
   */
  const viewerState = ref<ViewerState>({
    // 初始状态：第一页，缩放比例为 1.0
    pageNumber: 1,
    numPages: null,
    scale: 1.0,
  });

  // Getters
  const activeDocument = computed(() => {
    return documents.value.find(doc => doc.id === activeDocumentId.value) || null;
  });

  const getDefaultViewerState = (): ViewerState => ({
    pageNumber: 1,
    numPages: null,
    scale: 1.0,
  });

  // Actions
  /**
   * 添加文档：如果当前没有选中的文档，则自动选中新上传的文档
   * @param doc 新上传的文档信息
   */
  function addDocument(doc: DocumentInfo) {
    documents.value.push(doc);
    if (!activeDocumentId.value) {
      setActiveDocument(doc.id);
    }
    uploadError.value = null; // 成功上传时清除可能存在的错误
  }

  /**
   * 切换活动文档，同时重置阅读器状态到第一页
   * @param id 文档 ID
   */
  function setActiveDocument(id: string) {
    activeDocumentId.value = id;
    // 切换文档时，必须重置阅读器状态
    viewerState.value = getDefaultViewerState();
  }

  /**
   * 设置上传错误提示
   */
  function setUploadError(error: string | null) {
    uploadError.value = error;
  }

  /**
   * 设置当前页码（带边界保护）
   */
  function setPage(page: number) {
    const total = viewerState.value.numPages || 1;
    if (page >= 1 && page <= total) {
      viewerState.value.pageNumber = page;
    }
  }

  /**
   * 下一页
   */
  function nextPage() {
    setPage(viewerState.value.pageNumber + 1);
  }

  /**
   * 上一页
   */
  function prevPage() {
    setPage(viewerState.value.pageNumber - 1);
  }

  /**
   * 设置缩放比例（带边界保护，0.5 ~ 3.0）
   */
  function setScale(scale: number) {
    const newScale = Math.min(Math.max(scale, 0.5), 3.0);
    // 解决 JS 浮点数精度问题，保留一位小数
    viewerState.value.scale = Math.round(newScale * 10) / 10;
  }

  /**
   * 放大
   */
  function zoomIn() {
    setScale(viewerState.value.scale + 0.2);
  }

  /**
   * 缩小
   */
  function zoomOut() {
    setScale(viewerState.value.scale - 0.2);
  }

  /**
   * 重置缩放
   */
  function resetZoom() {
    setScale(1.0);
  }

  /**
   * 局部更新 PDF 视图状态 (如设置总页数)
   */
  function updateViewerState(state: Partial<ViewerState>) {
    viewerState.value = { ...viewerState.value, ...state };
  }

  /**
   * 切换右侧工作区模式
   */
  function setWorkbenchMode(mode: WorkbenchMode) {
    workbenchMode.value = mode;
  }

  /**
   * 阶段 7：用持久化快照恢复文档列表与阅读状态。
   */
  function hydrateDocuments(nextDocuments: DocumentInfo[], nextActiveDocumentId: string | null = null) {
    documents.value = nextDocuments;
    activeDocumentId.value = nextActiveDocumentId && nextDocuments.some(doc => doc.id === nextActiveDocumentId)
      ? nextActiveDocumentId
      : null;
    uploadError.value = null;
    viewerState.value = getDefaultViewerState();
    pendingJump.value = null;
    highlightText.value = null;
  }

  /**
   * 阶段 7：恢复阅读器页码与缩放，不恢复 numPages。
   */
  function hydrateViewerState(state: { pageNumber?: number; scale?: number }) {
    viewerState.value = {
      ...viewerState.value,
      pageNumber: typeof state.pageNumber === 'number' && state.pageNumber >= 1 ? state.pageNumber : 1,
      scale: typeof state.scale === 'number' ? Math.round(Math.min(Math.max(state.scale, 0.5), 3.0) * 10) / 10 : 1.0,
    };
  }

  /**
   * 阶段 7：当用户重新提供文件资源时，为已有文档补齐 File。
   */
  function replaceDocumentFile(documentId: string, file: File) {
    const target = documents.value.find(doc => doc.id === documentId);
    if (!target) return;
    target.file = file;
    target.restoreStatus = 'ready';
  }

  /**
   * 阶段 7：清空本地会话相关的文档状态。
   */
  function clearPersistedSessionState() {
    documents.value = [];
    activeDocumentId.value = null;
    uploadError.value = null;
    workbenchMode.value = 'none';
    viewerState.value = getDefaultViewerState();
    pendingJump.value = null;
    highlightText.value = null;
  }

  // === 阶段 4：跨文档异步跳转状态 ===
  const pendingJump = ref<PendingJump | null>(null);
  const highlightText = ref<string | null>(null); // 需要在当前页面高亮的摘录文本

  /**
   * 触发跨文档跳页
   * 如果是当前文档，直接跳；否则挂起请求并切换文档。
   */
  const jumpToDocumentPage = (docId: string, pageNum: number, textToHighlight?: string) => {
    if (textToHighlight) {
      highlightText.value = textToHighlight;
    } else {
      highlightText.value = null; // 如果没有传，清除之前的高亮
    }

    if (activeDocumentId.value === docId) {
      setPage(pageNum);
    } else {
      pendingJump.value = { documentId: docId, pageNumber: pageNum };
      setActiveDocument(docId);
    }
  };

  /**
   * 清除当前高亮文本
   */
  const clearHighlight = () => {
    highlightText.value = null;
  };

  /**
   * 在 PDF 成功加载后消费挂起的跳转请求
   */
  const consumePendingJump = () => {
    if (pendingJump.value && activeDocumentId.value === pendingJump.value.documentId) {
      const targetPage = pendingJump.value.pageNumber;
      pendingJump.value = null; // 必须先清空
      setPage(targetPage);
    }
  };

  return {
    documents,
    activeDocumentId,
    uploadError,
    viewerState,
    workbenchMode,
    activeDocument,
    addDocument,
    setActiveDocument,
    setUploadError,
    setPage,
    nextPage,
    prevPage,
    setScale,
    zoomIn,
    zoomOut,
    resetZoom,
    updateViewerState,
    setWorkbenchMode,
    hydrateDocuments,
    hydrateViewerState,
    replaceDocumentFile,
    clearPersistedSessionState,
    pendingJump,
    highlightText,
    jumpToDocumentPage,
    consumePendingJump,
    clearHighlight
  };
});
