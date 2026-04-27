<script setup lang="ts">
import { onMounted } from 'vue';
import UploadSidebar from '@/features/upload/UploadSidebar.vue';
import PdfWorkspace from '@/features/pdf-viewer/PdfWorkspace.vue';
import WorkbenchPanel from '@/features/workbench/WorkbenchPanel.vue';
import { useWorkspacePersistence } from '@/composables/useWorkspacePersistence';

/**
 * 应用入口组件
 * 实现三栏布局
 */

const { isHydrating, initializeWorkspacePersistence, clearCurrentLocalSession } = useWorkspacePersistence();

onMounted(() => {
  void initializeWorkspacePersistence();
});
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden bg-white text-gray-900">
    <!-- 左侧：上传与列表 -->
    <UploadSidebar :is-hydrating="isHydrating" :on-clear-local-session="clearCurrentLocalSession" />
    
    <!-- 中间：PDF 预览区 -->
    <PdfWorkspace />
    
    <!-- 右侧：工作台占位 -->
    <WorkbenchPanel />
  </div>
</template>
