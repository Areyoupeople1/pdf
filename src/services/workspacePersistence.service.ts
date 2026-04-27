import { appDb } from '@/db/app-db';
import type {
  ChatMessage,
  DocumentInfo,
  DocumentRestoreStatus,
  Excerpt,
  PersistedDocumentAsset,
  PersistedDocumentRef,
  PersistedWorkspaceSession,
  SummarySourceRef,
  WorkbenchMode,
} from '@/types';

export const CURRENT_WORKSPACE_SESSION_ID = 'current-workspace-session';
export const WORKSPACE_SCHEMA_VERSION = 1;

interface SaveWorkspaceSessionInput {
  activeDocumentId: string | null;
  workbenchMode: WorkbenchMode;
  viewerState: {
    pageNumber: number;
    scale: number;
  };
  documents: DocumentInfo[];
  excerpts: Excerpt[];
  summaryMessages: ChatMessage[];
  summarySources: SummarySourceRef[];
}

export interface RestoredWorkspacePayload {
  session: PersistedWorkspaceSession;
  documents: DocumentInfo[];
}

type PersistedAssetState = {
  hasBlob: boolean;
  restoreStatus: DocumentRestoreStatus;
};

function sanitizeSummaryMessages(messages: ChatMessage[]): ChatMessage[] {
  const cleaned = messages.map(message => ({ ...message }));

  while (cleaned.length > 0) {
    const lastMessage = cleaned[cleaned.length - 1];
    if (lastMessage.role === 'assistant' && !lastMessage.content.trim()) {
      cleaned.pop();
      continue;
    }
    break;
  }

  return cleaned;
}

async function persistDocumentAsset(document: DocumentInfo): Promise<PersistedAssetState> {
  if (!document.file) {
    return {
      hasBlob: false,
      restoreStatus: 'needs_reupload',
    };
  }

  const asset: PersistedDocumentAsset = {
    id: document.id,
    name: document.name,
    size: document.size,
    mimeType: document.file.type || 'application/pdf',
    blob: document.file,
    cachedAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    await appDb.documentAssets.put(asset);
    return {
      hasBlob: true,
      restoreStatus: 'ready',
    };
  } catch (error) {
    console.warn(`缓存 PDF Blob 失败，已降级为仅保存元数据: ${document.name}`, error);
    return {
      hasBlob: false,
      restoreStatus: 'needs_reupload',
    };
  }
}

async function buildPersistedDocumentRefs(documents: DocumentInfo[]): Promise<PersistedDocumentRef[]> {
  const persistedDocuments: PersistedDocumentRef[] = [];

  for (const document of documents) {
    const assetState = await persistDocumentAsset(document);
    persistedDocuments.push({
      id: document.id,
      name: document.name,
      size: document.size,
      uploadTime: document.uploadTime,
      hasBlob: assetState.hasBlob,
      restoreStatus: assetState.restoreStatus,
    });
  }

  return persistedDocuments;
}

export async function saveWorkspaceSession(input: SaveWorkspaceSessionInput): Promise<void> {
  const persistedDocuments = await buildPersistedDocumentRefs(input.documents);

  const session: PersistedWorkspaceSession = {
    id: CURRENT_WORKSPACE_SESSION_ID,
    version: WORKSPACE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    activeDocumentId: input.activeDocumentId,
    workbenchMode: input.workbenchMode,
    viewerState: {
      pageNumber: input.viewerState.pageNumber,
      scale: input.viewerState.scale,
    },
    documents: persistedDocuments,
    excerpts: input.excerpts.map(excerpt => ({ ...excerpt })),
    summaryMessages: sanitizeSummaryMessages(input.summaryMessages),
    summarySources: input.summarySources.map(source => ({ ...source })),
  };

  await appDb.workspaceSessions.put(session);
}

function createFileFromAsset(asset: PersistedDocumentAsset): File | null {
  if (!asset.blob) return null;

  return new File([asset.blob], asset.name, {
    type: asset.mimeType || 'application/pdf',
    lastModified: asset.updatedAt,
  });
}

async function restoreDocument(documentRef: PersistedDocumentRef): Promise<DocumentInfo> {
  if (!documentRef.hasBlob) {
    return {
      id: documentRef.id,
      name: documentRef.name,
      size: documentRef.size,
      uploadTime: documentRef.uploadTime,
      file: null,
      restoreStatus: 'needs_reupload',
    };
  }

  try {
    const asset = await appDb.documentAssets.get(documentRef.id);
    if (!asset?.blob) {
      return {
        id: documentRef.id,
        name: documentRef.name,
        size: documentRef.size,
        uploadTime: documentRef.uploadTime,
        file: null,
        restoreStatus: 'needs_reupload',
      };
    }

    return {
      id: documentRef.id,
      name: documentRef.name,
      size: documentRef.size,
      uploadTime: documentRef.uploadTime,
      file: createFileFromAsset(asset),
      restoreStatus: 'ready',
    };
  } catch (error) {
    console.warn(`恢复 PDF Blob 失败，文档将退化为仅元数据: ${documentRef.name}`, error);
    return {
      id: documentRef.id,
      name: documentRef.name,
      size: documentRef.size,
      uploadTime: documentRef.uploadTime,
      file: null,
      restoreStatus: 'needs_reupload',
    };
  }
}

export async function restoreWorkspaceSession(): Promise<RestoredWorkspacePayload | null> {
  const session = await appDb.workspaceSessions.get(CURRENT_WORKSPACE_SESSION_ID);
  if (!session) return null;

  const documents: DocumentInfo[] = [];
  for (const documentRef of session.documents) {
    documents.push(await restoreDocument(documentRef));
  }

  return {
    session: {
      ...session,
      activeDocumentId: session.activeDocumentId ?? null,
      viewerState: {
        pageNumber: session.viewerState?.pageNumber && session.viewerState.pageNumber >= 1
          ? session.viewerState.pageNumber
          : 1,
        scale: session.viewerState?.scale
          ? Math.round(Math.min(Math.max(session.viewerState.scale, 0.5), 3.0) * 10) / 10
          : 1.0,
      },
      summaryMessages: sanitizeSummaryMessages(session.summaryMessages),
    },
    documents,
  };
}

export async function clearWorkspacePersistence(): Promise<void> {
  await appDb.transaction('rw', appDb.workspaceSessions, appDb.documentAssets, async () => {
    await appDb.workspaceSessions.clear();
    await appDb.documentAssets.clear();
  });
}
