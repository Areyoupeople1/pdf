<template>
  <div class="pdf-virtual-viewport relative w-full h-full overflow-y-auto bg-gray-100 custom-scrollbar"
    @scroll="handleScroll" ref="viewportRef">
    <!-- 虚拟高度撑开滚动条 -->
    <div :style="{ height: `${totalHeight}px`, width: '100%', position: 'relative' }">
      <!-- 动态渲染可视区内的页面 -->
      <PdfPageItem v-for="metric in visiblePages" :key="metric.pageNumber" :metric="metric" :pdfDoc="pdfDoc"
        :scale="scale" :highlightText="highlightText" />
    </div>

    <!-- 摘录池交互按钮 -->
    <Teleport to="body">
      <div v-if="isSelecting"
        class="fixed z-[9999] transform -translate-x-1/2 -translate-y-full pb-2 pointer-events-auto"
        :style="{ left: selectionPosition.x + 'px', top: selectionPosition.y + 'px' }">
        <button @click.stop="handleAddToExcerpt"
          class="bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg flex items-center gap-1.5 hover:bg-gray-800 transition-colors cursor-pointer">
          <PenLine class="w-3.5 h-3.5" />
          加入摘录池
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, computed } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import { PenLine } from 'lucide-vue-next';
import PdfPageItem from './PdfPageItem.vue';
import { usePdfVirtualization } from '@/composables/usePdfVirtualization';
import { useDocumentStore } from '@/stores/document';
import { useWorkbenchStore } from '@/stores/workbench';
import { useSelection } from '@/composables/useSelection';
import type { PageMetrics, VisibleRange } from '@/types';

const props = defineProps<{
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  scale: number;
  highlightText?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:pageNumber', pageNumber: number): void;
}>();

const documentStore = useDocumentStore();
const workbenchStore = useWorkbenchStore();
const viewportRef = ref<HTMLDivElement | null>(null);

const {
  pageMetrics,
  totalHeight,
  initializeMetrics,
  updateScale,
  calculateVisibleRange,
  getVisiblePages,
  getCurrentPageNumber
} = usePdfVirtualization();

const visibleRange = ref<VisibleRange>({ startIndex: 0, endIndex: 0 });
const visiblePages = computed(() => getVisiblePages(visibleRange.value));

// 防循环联动：是否是通过程序触发的滚动（例如点击了右侧的引用角标）
let isProgrammaticScroll = false;

// 防抖定时器
let scrollTimeout: number | null = null;

// 初始化 PDF 虚拟列表尺寸
const initVirtualList = async () => {
  await initializeMetrics(props.pdfDoc, props.scale);
  updateVisibleRange();
};

const updateVisibleRange = () => {
  if (!viewportRef.value) return;
  const scrollTop = viewportRef.value.scrollTop;
  const clientHeight = viewportRef.value.clientHeight;
  visibleRange.value = calculateVisibleRange(scrollTop, clientHeight, 2); // 缓冲 2 页
};

const handleScroll = () => {
  if (!viewportRef.value) return;

  // 正在进行原生划词时，不要主动清空选区。
  // 否则滚动容器产生轻微 scroll 就会把浏览器原生选区打断。
  if (isSelecting.value) {
    return;
  }

  if (scrollTimeout) window.clearTimeout(scrollTimeout);
  scrollTimeout = window.setTimeout(() => {
    updateVisibleRange();

    // 更新外部页码 (除非是程序滚动引起的)
    if (!isProgrammaticScroll) {
      const currentPage = getCurrentPageNumber(viewportRef.value!.scrollTop, viewportRef.value!.clientHeight);
      emit('update:pageNumber', currentPage);
    }
  }, 100); // 100ms 节流
};

// 监听文档加载
watch(() => props.pdfDoc, () => {
  initVirtualList();
}, { immediate: true });

// 监听缩放变化
watch(() => props.scale, (newScale) => {
  updateScale(newScale);
  updateVisibleRange();
});

// 核心修复 3：监听外部 store 的 pendingJump 或页码变化
// 当用户在左侧工具栏直接改了页码，或者在右侧点了引用角标时触发
watch(
  () => documentStore.viewerState.pageNumber,
  (newPage) => {
    if (!viewportRef.value || pageMetrics.value.length === 0) return;

    // 检查这是否已经是当前滚动的页码，防止循环
    const currentPageFromScroll = getCurrentPageNumber(viewportRef.value.scrollTop, viewportRef.value.clientHeight);
    if (currentPageFromScroll === newPage) return;

    // 找到目标页
    const targetMetric = pageMetrics.value.find(m => m.pageNumber === newPage);
    if (targetMetric) {
      isProgrammaticScroll = true;
      viewportRef.value.scrollTo({
        top: targetMetric.top,
        behavior: 'smooth' // 平滑滚动体验更好
      });

      // 滚动结束后重置标记
      setTimeout(() => {
        isProgrammaticScroll = false;
        updateVisibleRange();
      }, 500);
    }
  }
);

// 摘录功能复用 useSelection
const {
  isSelecting,
  selectedText,
  selectionPosition,
  clearSelection
} = useSelection(viewportRef as any);

const handleAddToExcerpt = () => {
  if (!selectedText.value || !documentStore.activeDocument) return;

  // 【核心修复 5】：跨页选区很复杂，我们只取起点所在的页码
  // 这里通过选取最近的页码，保证摘录的正确性
  const currentPage = getCurrentPageNumber(viewportRef.value!.scrollTop, viewportRef.value!.clientHeight);

  workbenchStore.addExcerpt({
    id: crypto.randomUUID(),
    text: selectedText.value,
    documentId: documentStore.activeDocument.id,
    documentName: documentStore.activeDocument.name,
    pageNumber: currentPage,
    createdAt: Date.now()
  });

  clearSelection();
  documentStore.setWorkbenchMode('excerpt');
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(107, 114, 128, 0.8);
}
</style>
