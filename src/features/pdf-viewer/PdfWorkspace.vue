<script setup lang="ts">
import { watch } from 'vue';
import { Loader2, FileX } from 'lucide-vue-next';
import { useDocumentStore } from '@/stores/document';
import { usePdfRenderer } from '@/composables/usePdf';
import PdfToolbar from './PdfToolbar.vue';
import PdfVirtualViewport from './PdfVirtualViewport.vue';

// 必须保留！TextLayer 的定位、span 绝对布局、选区命中都依赖这份官方样式。
import 'pdfjs-dist/web/pdf_viewer.css';

const documentStore = useDocumentStore();
const { loading, error, numPages, pdfDoc, loadPdf } = usePdfRenderer();

// 监听活动文档变化，重新加载 PDF
watch(
  () => documentStore.activeDocument,
  async (newDoc) => {
    if (!newDoc || !newDoc.file) return;

    if (newDoc.restoreStatus !== 'needs_reupload') {
      await loadPdf(newDoc.file);

      const safePage = Math.min(Math.max(documentStore.viewerState.pageNumber, 1), Math.max(numPages.value, 1));
      documentStore.updateViewerState({
        numPages: numPages.value,
        pageNumber: safePage,
      });

      documentStore.consumePendingJump();
    }
  },
  { immediate: true }
);

// 监听文档总页数变化，同步到 store
watch(numPages, (newNum) => {
  if (newNum > 0) {
    documentStore.updateViewerState({ numPages: newNum });
    documentStore.consumePendingJump();
  }
});

const handlePageChange = (newPage: number) => {
  documentStore.setPage(newPage);
};
</script>

<template>
  <div v-if="!documentStore.activeDocument" class="flex-1 flex flex-col items-center justify-center bg-gray-50">
    <div class="text-center text-gray-400">
      <div class="text-4xl mb-4">📄</div>
      <h2 class="text-xl font-medium mb-2">欢迎使用 ScholarFlow AI</h2>
      <p>请在左侧上传或选择一个 PDF 文档开始阅读</p>
    </div>
  </div>

  <div v-else class="flex-1 flex flex-col h-full bg-gray-100 overflow-hidden relative">
    <!-- 顶部工具栏 (翻页与缩放控制) -->
    <PdfToolbar />

    <!-- PDF 渲染区域 -->
    <div class="flex-1 overflow-hidden relative flex justify-center bg-gray-200">
      <!-- 降级提示 -->
      <div v-if="documentStore.activeDocument.restoreStatus === 'needs_reupload'"
        class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50/80 px-8 text-center z-10">
        <FileX class="w-12 h-12 mb-4 text-gray-300" />
        <h3 class="text-lg font-medium text-gray-600 mb-2">当前 PDF 未缓存</h3>
        <p class="text-sm text-gray-500 max-w-md leading-relaxed">
          该文档的本地数据已丢失。但为了保护您的工作成果，我们保留了相关的摘录和综述历史。
          <br /><br />
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

      <!-- 阶段 8 核心：虚拟列表滚动容器 -->
      <PdfVirtualViewport v-else-if="pdfDoc" :pdf-doc="pdfDoc" :scale="documentStore.viewerState.scale"
        :highlight-text="documentStore.highlightText" @update:page-number="handlePageChange" />
    </div>
  </div>
</template>

<style>
.textLayer {
  z-index: 10 !important;
  pointer-events: auto !important;
  mix-blend-mode: multiply;
}

.textLayer span {
  color: transparent !important;
  cursor: text !important;
}

.textLayer ::selection {
  background-color: rgba(0, 102, 204, 0.3) !important;
}
</style>
