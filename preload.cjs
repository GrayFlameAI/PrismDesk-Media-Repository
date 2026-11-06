/**
 * PrismDesk Media Vault - Electron Preload Script (preload.cjs)
 * Bridges native file path extraction (file.path & webUtils.getPathForFile),
 * native file dialog (fs:showOpenDialog), and streaming IPC channels.
 */

const { ipcRenderer, webUtils } = require('electron');

function resolveNativeFilePath(file) {
  if (!file) return '';
  if (typeof file.path === 'string' && file.path.length > 0) {
    return file.path;
  }
  if (webUtils && typeof webUtils.getPathForFile === 'function') {
    try {
      const p = webUtils.getPathForFile(file);
      if (typeof p === 'string' && p.length > 0) {
        return p;
      }
    } catch {}
  }
  return '';
}

// Automatically attach .path on dropped File instances if missing in modern Electron (Electron 32+)
if (typeof window !== 'undefined') {
  window.addEventListener(
    'drop',
    (e) => {
      try {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f && !f.path) {
              const resolved = resolveNativeFilePath(f);
              if (resolved) {
                try {
                  Object.defineProperty(f, 'path', {
                    value: resolved,
                    writable: false,
                    configurable: true,
                  });
                } catch {}
              }
            }
          }
        }
      } catch {}
    },
    true
  );

  window.electronAPI = {
    getPathForFile: resolveNativeFilePath,
    showOpenDialog: () => ipcRenderer.invoke('fs:showOpenDialog'),
    selectMediaFiles: () => ipcRenderer.invoke('dialog:selectMediaFiles'),
    batchImport: (payload) => ipcRenderer.invoke('fs:batchImport', payload),
    batchTrash: (targetPaths) => ipcRenderer.invoke('fs:batchTrash', targetPaths),
    batchRenameMedia: (payload) => ipcRenderer.invoke('fs:batchRenameMedia', payload),
    moveMedia: (payload) => ipcRenderer.invoke('fs:moveMedia', payload),
    getThumbnail: (payload) => ipcRenderer.invoke('fs:getThumbnail', payload),
    saveThumbnail: (payload) => ipcRenderer.invoke('fs:saveThumbnail', payload),
    selectThumbnailCacheDir: () => ipcRenderer.invoke('config:selectThumbnailCacheDir'),
    setThumbnailCacheDir: (newDir) => ipcRenderer.invoke('config:setThumbnailCacheDir', newDir),
    clearThumbnailCache: () => ipcRenderer.invoke('fs:clearThumbnailCache'),
    scanVaultChunked: (payload) => ipcRenderer.invoke('fs:scanVaultChunked', payload),
    startDrag: (payload) => ipcRenderer.send('fs:startDrag', payload),
  };
}
