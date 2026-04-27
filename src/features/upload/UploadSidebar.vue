<template>
  <aside class="w-64 bg-white border-r border-gray-200 flex flex-col h-full shrink-0">
    <div class="p-4 border-b border-gray-200">
      <div class="mb-4 flex items-start justify-between gap-3">
        <h1 class="text-xl font-bold text-gray-800">ScholarFlow AI</h1>
        <button
          type="button"
          class="shrink-0 rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isHydrating"
          @click="onClearLocalSession"
        >
          清空本地会话
        </button>
      </div>

      <!-- 上传区域 -->
      <div
        class="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-50 transition-colors"
        @dragover="onDragOver" @drop="onDrop" @click="triggerFileInput">
        <Upload class="w-8 h-8 text-gray-400 mb-2" />
        <p class="text-sm text-gray-600">点击或拖拽上传 PDF</p>
        <input type="file" ref="fileInputRef" class="hidden" accept="application/pdf" multiple
          @change="onFileInputChange" />
      </div>
      <!-- 错误提示 -->
      <div v-if="documentStore.uploadError"
        class="mt-3 p-2 bg-red-50 text-red-600 text-sm rounded flex items-start gap-2">
        <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
        <span>{{ documentStore.uploadError }}</span>
      </div>
    </div>

    <!-- 文档列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
        已上传文档 ({{ documentStore.documents.length }})
      </h2>
      <p v-if="documentStore.documents.length === 0" class="text-sm text-gray-400 px-2">暂无文档，请上传。</p>

      <ul v-else class="space-y-1">
        <li v-for="doc in documentStore.documents" :key="doc.id">
          <button @click="documentStore.setActiveDocument(doc.id)" :class="cn(
            'w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm transition-colors',
            documentStore.activeDocumentId === doc.id
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-gray-700 hover:bg-gray-100'
          )">
            <FileText
              :class="cn('w-4 h-4 shrink-0', documentStore.activeDocumentId === doc.id ? 'text-blue-500' : 'text-gray-400')" />
            <span class="min-w-0 flex-1 truncate" :title="doc.name">{{ doc.name }}</span>
            <span
              v-if="doc.restoreStatus === 'needs_reupload'"
              class="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700"
            >
              需重传
            </span>
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Upload, FileText, AlertCircle } from 'lucide-vue-next';
import { useDocumentStore } from '@/stores/document';
import { cn } from '@/shared/utils';

defineProps<{
  isHydrating: boolean;
  onClearLocalSession: () => Promise<void> | void;
}>();

/**
 * 左侧上传与文档列表侧边栏
 * 职责：
 * 1. 拖拽和点击上传 PDF
 * 2. 验证文件类型
 * 3. 显示已上传的文档列表及选中状态
 */

const documentStore = useDocumentStore();
const fileInputRef = ref<HTMLInputElement | null>(null);

// 触发隐藏的文件输入框
const triggerFileInput = () => {
  fileInputRef.value?.click();
};

// 处理文件选择逻辑
const handleFiles = (files: FileList | null) => {
  if (!files) return;

  Array.from(files).forEach(file => {
    // 检查文件类型是否为 PDF
    if (file.type !== 'application/pdf') {
      documentStore.setUploadError(`文件 "${file.name}" 不是 PDF 格式。`);
      return;
    }

    const newDoc = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      file: file,
      uploadTime: Date.now(),
      restoreStatus: 'ready' as const,
    };

    documentStore.addDocument(newDoc);
  });
};

// 拖拽事件处理
const onDragOver = (e: DragEvent) => {
  e.preventDefault(); // 必须阻止默认行为，否则浏览器会尝试打开文件，无法触发 drop 事件
};

const onDrop = (e: DragEvent) => {
  e.preventDefault(); // 阻止浏览器默认打开文件的行为
  handleFiles(e.dataTransfer?.files || null);
};

// input change 事件处理
const onFileInputChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  handleFiles(target.files);
  // 清空 input 值，以便重复上传同一文件触发 change 事件
  if (target) target.value = '';
};
</script>
