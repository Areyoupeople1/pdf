<script setup lang="ts">
import { useDocumentStore } from '@/stores/document';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw 
} from 'lucide-vue-next';

const documentStore = useDocumentStore();

// 输入框页码跳转
const onPageInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const page = parseInt(target.value, 10);
  if (!isNaN(page)) {
    documentStore.setPage(page);
  } else {
    // 如果输入非数字，强制恢复为当前页码
    target.value = documentStore.viewerState.pageNumber.toString();
  }
};
</script>

<template>
  <div class="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0 shadow-sm z-10 select-none">
    <!-- 文档名称 -->
    <h2 class="font-medium text-gray-800 truncate w-48 shrink-0" :title="documentStore.activeDocument?.name">
      {{ documentStore.activeDocument?.name }}
    </h2>

    <div class="flex-1 flex justify-center items-center gap-4">
      <!-- 翻页控制 -->
      <div class="flex items-center bg-gray-100 rounded p-1">
        <button 
          @click="documentStore.prevPage" 
          :disabled="documentStore.viewerState.pageNumber <= 1"
          class="p-1 rounded hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
          title="上一页"
        >
          <ChevronLeft class="w-5 h-5 text-gray-600" />
        </button>
        
        <div class="px-3 flex items-center text-sm text-gray-600 font-medium">
          <input 
            type="number" 
            :value="documentStore.viewerState.pageNumber"
            @change="onPageInputChange"
            @keyup.enter="onPageInputChange"
            class="w-12 text-center bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none mx-1"
            min="1"
            :max="documentStore.viewerState.numPages || 1"
          />
          <span>/ {{ documentStore.viewerState.numPages || '-' }}</span>
        </div>

        <button 
          @click="documentStore.nextPage" 
          :disabled="documentStore.viewerState.numPages === null || documentStore.viewerState.pageNumber >= documentStore.viewerState.numPages"
          class="p-1 rounded hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
          title="下一页"
        >
          <ChevronRight class="w-5 h-5 text-gray-600" />
        </button>
      </div>

      <div class="w-px h-6 bg-gray-300"></div>

      <!-- 缩放控制 -->
      <div class="flex items-center bg-gray-100 rounded p-1">
        <button 
          @click="documentStore.zoomOut" 
          :disabled="documentStore.viewerState.scale <= 0.5"
          class="p-1 rounded hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
          title="缩小"
        >
          <ZoomOut class="w-4 h-4 text-gray-600" />
        </button>
        
        <span class="text-xs text-gray-600 font-medium w-12 text-center">
          {{ Math.round(documentStore.viewerState.scale * 100) }}%
        </span>

        <button 
          @click="documentStore.zoomIn" 
          :disabled="documentStore.viewerState.scale >= 3.0"
          class="p-1 rounded hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
          title="放大"
        >
          <ZoomIn class="w-4 h-4 text-gray-600" />
        </button>

        <button 
          @click="documentStore.resetZoom" 
          class="p-1 ml-1 rounded hover:bg-white hover:shadow-sm transition-all"
          title="重置大小"
        >
          <RotateCcw class="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>

    <!-- 右侧占位（平衡布局） -->
    <div class="w-48 shrink-0"></div>
  </div>
</template>
