<template>
  <div class="pdf-page-item relative bg-white shadow-sm mb-2" :style="{
    width: `${metric.width}px`,
    height: `${metric.height}px`,
    transform: `translateY(${metric.top}px)`,
    position: 'absolute',
    left: '50%',
    marginLeft: `-${metric.width / 2}px`
  }" :data-page-number="metric.pageNumber">
    <!-- Canvas 渲染层 -->
    <canvas ref="canvasRef" class="block w-full h-full"></canvas>

    <!-- TextLayer 文本选择层 -->
    <div ref="textLayerRef" class="textLayer absolute inset-0 w-full h-full" style="opacity: 0.2"></div>

    <!-- 加载骨架/状态 -->
    <div v-if="isRendering" class="absolute inset-0 flex items-center justify-center bg-gray-50/50 backdrop-blur-[1px]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-red-50 text-red-500">
      {{ error }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import { usePdfPageRenderer } from '@/composables/usePdfPageRenderer';
import type { PageMetrics, PageRenderState } from '@/types';

const props = defineProps<{
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  metric: PageMetrics;
  scale: number;
  highlightText?: string | null;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const textLayerRef = ref<HTMLDivElement | null>(null);

const renderState = ref<PageRenderState>('uninitialized');
const { isRendering, error, renderPage, cancelRender } = usePdfPageRenderer();

// 真正的渲染动作
const doRender = async () => {
  if (!canvasRef.value || !textLayerRef.value || renderState.value === 'loading') return;

  renderState.value = 'loading';
  try {
    const page = await props.pdfDoc.getPage(props.metric.pageNumber);
    await renderPage(page, canvasRef.value, textLayerRef.value, props.scale, props.highlightText);
    renderState.value = 'rendered';
  } catch (err: any) {
    if (err.name !== 'RenderingCancelledException') {
      renderState.value = 'error';
    }
  }
};

// 如果缩放比例或高亮词改变，需要重绘
watch([() => props.scale, () => props.highlightText], () => {
  if (renderState.value === 'rendered') {
    doRender();
  }
});

onMounted(() => {
  // 当它被虚拟列表挂载时，立刻开始渲染
  doRender();
});

onBeforeUnmount(() => {
  // 核心修复 4：离开可视区时卸载，主动取消渲染任务
  cancelRender();

  // 释放 Canvas 内存
  if (canvasRef.value) {
    canvasRef.value.width = 0;
    canvasRef.value.height = 0;
  }

  if (textLayerRef.value) {
    textLayerRef.value.innerHTML = '';
  }
});
</script>

<style scoped>
.textLayer {
  pointer-events: auto;
}
</style>
