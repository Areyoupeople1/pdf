import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useDocumentStore } from '@/stores/document';
import { useWorkbenchStore } from '@/stores/workbench';
import {
  clearWorkspacePersistence,
  restoreWorkspaceSession,
  saveWorkspaceSession,
} from '@/services/workspacePersistence.service';

const AUTO_SAVE_DEBOUNCE_MS = 600;

export function useWorkspacePersistence() {
  const documentStore = useDocumentStore();
  const workbenchStore = useWorkbenchStore();

  const isHydrating = ref(true);
  const hasInitialized = ref(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelScheduledSave = () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  };

  const persistNow = async () => {
    if (isHydrating.value) return;

    await saveWorkspaceSession({
      activeDocumentId: documentStore.activeDocumentId,
      workbenchMode: documentStore.workbenchMode,
      viewerState: {
        pageNumber: documentStore.viewerState.pageNumber,
        scale: documentStore.viewerState.scale,
      },
      documents: documentStore.documents,
      excerpts: workbenchStore.excerpts,
      summaryMessages: workbenchStore.summaryMessages,
      summarySources: workbenchStore.summarySources,
    });
  };

  const schedulePersist = () => {
    if (isHydrating.value) return;
    cancelScheduledSave();
    saveTimer = setTimeout(() => {
      void persistNow();
    }, AUTO_SAVE_DEBOUNCE_MS);
  };

  watch(
    () => ({
      documents: documentStore.documents,
      activeDocumentId: documentStore.activeDocumentId,
      workbenchMode: documentStore.workbenchMode,
      viewerState: {
        pageNumber: documentStore.viewerState.pageNumber,
        scale: documentStore.viewerState.scale,
      },
      excerpts: workbenchStore.excerpts,
      summaryMessages: workbenchStore.summaryMessages,
      summarySources: workbenchStore.summarySources,
    }),
    () => {
      schedulePersist();
    },
    { deep: true }
  );

  const initializeWorkspacePersistence = async () => {
    if (hasInitialized.value) return;

    isHydrating.value = true;

    try {
      const restored = await restoreWorkspaceSession();
      if (!restored) {
        hasInitialized.value = true;
        return;
      }

      documentStore.hydrateDocuments(restored.documents, restored.session.activeDocumentId);
      documentStore.hydrateViewerState(restored.session.viewerState);
      documentStore.setWorkbenchMode(restored.session.workbenchMode);

      workbenchStore.hydratePersistedSession({
        excerpts: restored.session.excerpts,
        summaryMessages: restored.session.summaryMessages,
        summarySources: restored.session.summarySources,
      });

      hasInitialized.value = true;
    } catch (error) {
      console.error('恢复本地工作台会话失败:', error);
      hasInitialized.value = true;
    } finally {
      await nextTick();
      isHydrating.value = false;
    }
  };

  const clearCurrentLocalSession = async () => {
    isHydrating.value = true;
    cancelScheduledSave();

    try {
      documentStore.clearPersistedSessionState();
      workbenchStore.clearPersistedSessionState();
      await clearWorkspacePersistence();
    } finally {
      await nextTick();
      isHydrating.value = false;
    }
  };

  onBeforeUnmount(() => {
    cancelScheduledSave();
  });

  return {
    isHydrating,
    hasInitialized,
    initializeWorkspacePersistence,
    clearCurrentLocalSession,
  };
}
