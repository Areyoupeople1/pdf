/**
 * PDF 文档信息类型
 */
export interface DocumentInfo {
  id: string;
  name: string;
  size: number;
  file: File | null;
  uploadTime: number;
  restoreStatus?: DocumentRestoreStatus;
}

/**
 * PDF 视图状态类型
 */
export interface ViewerState {
  pageNumber: number;
  numPages: number | null;
  scale: number;
}

/**
 * 右侧工作区模式类型
 */
export type WorkbenchMode = 'excerpt' | 'summary' | 'none';

/**
 * 文本摘录数据结构
 */
export interface Excerpt {
  id: string;           // 摘录的唯一 ID
  text: string;         // 摘录的具体文本内容
  documentId: string;   // 来源于哪个文档的 ID
  documentName: string; // 来源于哪个文档的名称
  pageNumber: number;   // 来源于哪一页
  createdAt: number;    // 创建时间戳
}

/**
 * AI 综述生成状态
 */
export type AIStatus = 'idle' | 'loading' | 'generating' | 'revising' | 'error' | 'success';

/**
 * 阶段 5B：多轮改写历史的消息类型
 */
export type MessageType = 'summary_initial' | 'revision_instruction' | 'revision_result';

export interface ChatMessage {
  id: string;          // 唯一标识，如 Date.now().toString()
  role: 'user' | 'assistant';
  messageType: MessageType; // 用于 UI 区分渲染样式
  content: string;     // 原始文本内容（Markdown）
  createdAt: number;   // 时间戳
}

/**
 * 引用来源快照
 */
export interface SummarySourceRef {
  label: number;        // 引用标号，如 1 (对应 [1])
  excerptId: string;    // 关联的原始摘录 ID
  documentId: string;   // 来源于哪个文档的 ID
  documentName: string; // 来源于哪个文档的名称
  pageNumber: number;   // 来源于哪一页
  text: string;         // 摘录内容快照
}

/**
 * 跨文档异步跳转状态
 */
export interface PendingJump {
  documentId: string;
  pageNumber: number;
}

/**
 * 阶段 7：本地持久化后，文档资源的恢复状态
 */
export type DocumentRestoreStatus = 'ready' | 'needs_reupload';

/**
 * 阶段 7：持久化层中的文档元数据
 */
export interface PersistedDocumentRef {
  id: string;
  name: string;
  size: number;
  uploadTime: number;
  hasBlob: boolean;
  restoreStatus: DocumentRestoreStatus;
}

/**
 * 阶段 7：当前单会话的持久化快照
 */
export interface PersistedWorkspaceSession {
  id: string;
  version: number;
  updatedAt: number;
  activeDocumentId: string | null;
  workbenchMode: WorkbenchMode;
  viewerState: {
    pageNumber: number;
    scale: number;
  };
  documents: PersistedDocumentRef[];
  excerpts: Excerpt[];
  summaryMessages: ChatMessage[];
  summarySources: SummarySourceRef[];
}

/**
 * 阶段 7：文档资产表记录
 */
export interface PersistedDocumentAsset {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  blob: Blob | null;
  cachedAt: number;
  updatedAt: number;
}

/**
 * 阶段 8：页级虚拟列表的基础尺寸信息
 * 将物理基础尺寸(scale=1)与当前缩放尺寸隔离，避免误差累积
 */
export interface PageMetrics {
  pageNumber: number;
  baseWidth: number;   // 缩放比例为 1 时的原始宽度
  baseHeight: number;  // 缩放比例为 1 时的原始高度
  width: number;       // 当前缩放下的计算宽度
  height: number;      // 当前缩放下的计算高度
  top: number;         // 距离虚拟列表顶部的绝对偏移量
  bottom: number;      // top + height
}

/**
 * 阶段 8：虚拟列表可视范围
 */
export interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

/**
 * 阶段 8：单页渲染状态
 */
export type PageRenderState = 'uninitialized' | 'loading' | 'rendered' | 'error';

