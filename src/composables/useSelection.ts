import { ref, onMounted, onUnmounted, type Ref } from 'vue';

/**
 * 监听并提取 DOM 选区文本
 * @param containerRef 限制选区生效的 DOM 容器（例如 textLayerDiv）
 */
export function useSelection(containerRef: Ref<HTMLElement | null>) {
  const selectedText = ref('');
  const selectionPosition = ref({ x: 0, y: 0 });
  const isSelecting = ref(false);

  // 处理鼠标松开事件：提取选区
  const handleMouseUp = (e: MouseEvent) => {
    // 稍微延迟以确保浏览器原生选区已完成更新
    setTimeout(() => {
      const selection = window.getSelection();
      
      // 1. 如果没有选区或者选区闭合（只是点击没拖拽），取消选中状态
      if (!selection || selection.isCollapsed) {
        isSelecting.value = false;
        selectedText.value = '';
        return;
      }

      // 2. 确保选区在我们的 PDF 文本层容器内
      if (containerRef.value && containerRef.value.contains(selection.anchorNode)) {
        const text = selection.toString().trim();
        
        if (text) {
          // 3. 获取选区的几何边界，用于定位悬浮按钮
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          selectedText.value = text;
          // 将按钮定位在选区正上方居中位置
          selectionPosition.value = {
            x: rect.left + rect.width / 2,
            y: rect.top - 8 // 往上偏移一点点
          };
          isSelecting.value = true;
        }
      }
    }, 50);
  };

  // 处理鼠标按下事件：如果在容器内按下，先隐藏当前的悬浮按钮
  const handleMouseDown = (e: MouseEvent) => {
    if (containerRef.value && containerRef.value.contains(e.target as Node)) {
      isSelecting.value = false;
    }
  };

  onMounted(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
  });

  onUnmounted(() => {
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('mousedown', handleMouseDown);
  });

  // 主动清除选区（例如点击“加入摘录池”后）
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    isSelecting.value = false;
    selectedText.value = '';
  };

  return {
    selectedText,
    selectionPosition,
    isSelecting,
    clearSelection
  };
}