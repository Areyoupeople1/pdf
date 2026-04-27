<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted } from 'vue';
import { Loader2, Plus } from 'lucide-vue-next'; // 【新增】Plus 图标
import { useDocumentStore } from '@/stores/document';
import { useWorkbenchStore } from '@/stores/workbench'; // 【新增】引入工作台 store
import { usePdfRenderer } from '@/composables/usePdf';
import { useSelection } from '@/composables/useSelection'; // 【新增】选区 Composable
import PdfToolbar from './PdfToolbar.vue';

// 必须引入！否则 TextLayer 里的字会缩作一团，且不可被选中
import 'pdfjs-dist/web/pdf_viewer.css';

const documentStore = useDocumentStore();
const workbenchStore = useWorkbenchStore(); // 【新增】
const { loading, error, numPages, isRendering, loadPdf, renderPage, highlightTextInLayer, clearHighlightInLayer } = usePdfRenderer();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const textLayerRef = ref<HTMLDivElement | null>(null);
const canvasWrapperRef = ref<HTMLDivElement | null>(null);
const scrollContainerRef = ref<HTMLDivElement | null>(null);
const renderedScale = ref(1);
let zoomDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// 【新增】监听 TextLayer 上的文本选区
const { isSelecting, selectedText, selectionPosition, clearSelection } = useSelection(textLayerRef);

// 【新增】加入摘录池逻辑
const handleAddToExcerpt = () => {
  if (!selectedText.value || !documentStore.activeDocument) return;

  // 将提取出的纯文本存入 Pinia 的 workbenchStore 中
  workbenchStore.addExcerpt({
    id: crypto.randomUUID(),
    text: selectedText.value,
    documentId: documentStore.activeDocument.id,
    documentName: documentStore.activeDocument.name, // 【必改项】存入文档名
    pageNumber: documentStore.viewerState.pageNumber,
    createdAt: Date.now() // 【必改项】统一命名
  });


  // 如果右侧不是摘录模式，强制切换过去
  if (documentStore.workbenchMode !== 'excerpt') {
    documentStore.setWorkbenchMode('excerpt');
  }

  // 存完清空浏览器原生选中状态
  clearSelection();
};

// 拦截 Ctrl+Wheel，阻止浏览器整页缩放，改为控制 PDF 缩放
const onWheel = (e: WheelEvent) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  if (e.deltaY < 0) {
    documentStore.zoomIn();
  } else {
    documentStore.zoomOut();
  }
};

// v-else 条件下 scrollContainerRef 在 activeDocument 出现后才挂载，用 watch 监听
watch(scrollContainerRef, (el, prevEl) => {
  prevEl?.removeEventListener('wheel', onWheel);
  el?.addEventListener('wheel', onWheel, { passive: false });
});

onUnmounted(() => {
  scrollContainerRef.value?.removeEventListener('wheel', onWheel);
  if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer);
});

// 监听活动文档变化，加载 PDF 并渲染
watch(
  () => documentStore.activeDocument,
  async (newDoc) => {
    if (!newDoc) return;

    if (!newDoc.file) {
      return;
    }

    await loadPdf(newDoc.file);
    const safePage = Math.min(Math.max(documentStore.viewerState.pageNumber, 1), Math.max(numPages.value, 1));
    documentStore.updateViewerState({
      numPages: numPages.value,
      pageNumber: safePage,
    });

    // 【阶段 4：异步跨文档跳转】在文档成功加载并更新 numPages 后，消费挂起的跳页请求
    documentStore.consumePendingJump();

    if (numPages.value > 0) {
      await nextTick();
      if (canvasRef.value && textLayerRef.value) {
        const scale = documentStore.viewerState.scale;
        await renderPage(documentStore.viewerState.pageNumber, canvasRef.value, textLayerRef.value, scale, documentStore.highlightText);
        renderedScale.value = scale;
        if (canvasWrapperRef.value) canvasWrapperRef.value.style.transform = 'scale(1)';
      }
    }
  },
  { immediate: true }
);

// 监听页码变化，直接重新渲染并滚回顶部
watch(
  () => documentStore.viewerState.pageNumber,
  async (page) => {
    if (canvasRef.value && textLayerRef.value && documentStore.activeDocument && !loading.value) {
      const scale = documentStore.viewerState.scale;
      await renderPage(page, canvasRef.value, textLayerRef.value, scale, documentStore.highlightText);
      renderedScale.value = scale;
      if (canvasWrapperRef.value) canvasWrapperRef.value.style.transform = 'scale(1)';
      if (scrollContainerRef.value) scrollContainerRef.value.scrollTop = 0;
    }
  }
);

// 监听缩放变化：立即 CSS transform 给用户视觉反馈，防抖后重新渲染恢复清晰度
watch(
  () => documentStore.viewerState.scale,
  (newScale) => {
    // 流1：立即更新 CSS transform，不阻塞主线程
    if (canvasWrapperRef.value) {
      canvasWrapperRef.value.style.transform = `scale(${newScale / renderedScale.value})`;
    }

    // 流2：用户停手 300ms 后重新渲染，补回清晰度
    if (zoomDebounceTimer) clearTimeout(zoomDebounceTimer);
    zoomDebounceTimer = setTimeout(async () => {
      if (canvasRef.value && textLayerRef.value && documentStore.activeDocument && !loading.value) {
        await renderPage(documentStore.viewerState.pageNumber, canvasRef.value, textLayerRef.value, newScale, documentStore.highlightText);
        renderedScale.value = newScale;
        if (canvasWrapperRef.value) canvasWrapperRef.value.style.transform = 'scale(1)';
      }
    }, 300);
  }
);

// 监听 highlightText 的变化，如果当前页面已经渲染好，直接高亮，不需要重新渲染 Canvas
watch(
  () => documentStore.highlightText,
  (newText) => {
    if (textLayerRef.value && !isRendering.value) {
      if (newText) {
        highlightTextInLayer(textLayerRef.value, newText);
      } else {
        clearHighlightInLayer(textLayerRef.value);
      }
    }
  }
);
</script>

<template>
  <div v-if="!documentStore.activeDocument" class="flex-1 flex flex-col items-center justify-center bg-gray-50">
    <div class="text-center text-gray-400">
      <div class="text-4xl mb-4">📄</div>
      <h2 class="text-xl font-medium mb-2">欢迎使用 ScholarFlow AI (Vue 3)</h2>
      <p>请在左侧上传或选择一个 PDF 文档开始阅读</p>
    </div>
  </div>

  <div v-else class="flex-1 flex flex-col h-full bg-gray-100 overflow-hidden relative">
    <!-- 顶部工具栏 (翻页与缩放控制) -->
    <PdfToolbar />

    <!-- PDF 渲染区域 -->
    <div ref="scrollContainerRef" class="flex-1 overflow-auto p-4 flex justify-center bg-gray-200">
      <div v-if="documentStore.activeDocument && !documentStore.activeDocument.file"
        class="h-full max-w-xl rounded-xl border border-amber-200 bg-white p-6 text-amber-800 shadow-sm">
        <h3 class="mb-2 text-base font-semibold">该文档需要重新上传后才能恢复阅读</h3>
        <p class="text-sm leading-6">
          当前本地会话已恢复文档元数据、摘录和综述历史，但这个 PDF 没有可用的本地缓存文件。
          请重新上传同一份 PDF，以恢复左侧阅读、页码跳转和原文高亮能力。
        </p>
      </div>

      <!-- 骨架屏或全局加载 -->
      <div v-else-if="loading" class="flex items-center justify-center h-full text-gray-500">
        <Loader2 class="w-6 h-6 animate-spin mr-2" />
        正在解析 PDF...
      </div>

      <!-- 错误提示 -->
      <div v-else-if="error" class="text-red-500 p-4 bg-white rounded shadow h-fit mt-10">
        {{ error }}
      </div>

      <!-- 基础 Canvas 渲染壳 + TextLayer -->
      <div ref="canvasWrapperRef" v-show="!loading && !error"
        class="relative shadow-md bg-white h-fit origin-top transition-transform duration-200 ease-out">
        <!-- Canvas 渲染底层图像 -->
        <canvas ref="canvasRef" class="pdf-canvas" :class="{ 'opacity-70': isRendering }"></canvas>

        <!-- TextLayer 覆盖在 Canvas 之上，实现文字选中 -->
        <!-- 注意：必须加 z-index 保证它在 Canvas 之上，且颜色透明 -->
        <div ref="textLayerRef" class="textLayer absolute top-0 left-0 z-10 opacity-50"></div>

        <!-- 局部渲染中提示（当防抖重绘时显示） -->
        <div v-if="isRendering"
          class="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-[1px]">
          <Loader2 class="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </div>
    </div>
  </div>

  <!-- 【新增】脱离文档流的悬浮“加入摘录池”按钮 -->
  <Teleport to="body">
    <div v-if="isSelecting" class="fixed z-[9999] transform -translate-x-1/2 -translate-y-full pb-2 pointer-events-auto"
      :style="{ left: selectionPosition.x + 'px', top: selectionPosition.y + 'px' }">
      <button @click.stop="handleAddToExcerpt"
        class="bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg flex items-center gap-1.5 hover:bg-gray-800 transition-colors cursor-pointer">
        <Plus class="w-3.5 h-3.5" />
        加入摘录池
      </button>
    </div>
  </Teleport>
</template>

<style>
/* 
 * 【极其关键】修复 pdfjs-dist 文本层无法选中的玄学问题
 * 确保 textLayer 的样式具有最高优先级
 */
.textLayer {
  /* 必须有绝对的层级，覆盖在 Canvas 之上 */
  z-index: 10 !important;
  /* 必须允许指针事件通过 */
  pointer-events: auto !important;
  /* 使得选中的高亮背景色可见 */
  mix-blend-mode: multiply;
}

.textLayer span {
  /* 这些 span 是用来选中的，不能是透明的，但它的颜色应该设置为透明以便看到底层的 Canvas */
  color: transparent !important;
  /* color: #000; */
  cursor: text !important;
}

.textLayer ::selection {
  background-color: rgba(0, 102, 204, 0.3) !important;
  /* 经典蓝色选中框 */
}
</style>
