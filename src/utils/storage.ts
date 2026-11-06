/**
 * Node.js `fs` Physical File System Synchronization Engine for PrismDesk Media Vault
 * Integrates dynamic categories (.prism_categories.json), folder cover metadata (.prism_meta.json),
 * Electron shell.trashItem (Recycle Bin safe deletion), and chunked async batch IPC (fs:batchImport / fs:batchTrash).
 */

import { FolderItem, MediaItem, SectionConfig, SectionId, SecurityConfig } from '../types';
import { SECTIONS, DEFAULT_INITIAL_FOLDERS } from './constants';

export function isElectronEnv(): boolean {
  return (
    typeof window !== 'undefined' &&
    (typeof (window as any).require === 'function' || typeof (window as any).electronAPI === 'object')
  );
}

function getNodeModules() {
  if (typeof window === 'undefined' || typeof (window as any).require !== 'function') return null;
  const req = (window as any).require;
  return {
    fs: req('fs') as typeof import('fs'),
    path: req('path') as typeof import('path'),
    electron: req('electron'),
  };
}

/**
 * 安全提取拖拽或文件选择器的原生物理路径 (file.path)
 * 同时兼容 Electron 原生 file.path 属性与 Electron 32+ webUtils.getPathForFile(file)
 */
export function extractNativeFilePath(file: File | any): string {
  if (!file) return '';
  if (typeof file.path === 'string' && file.path.trim().length > 0) {
    return file.path.trim();
  }
  try {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (api && typeof api.getPathForFile === 'function') {
      const p = api.getPathForFile(file);
      if (typeof p === 'string' && p.trim().length > 0) {
        return p.trim();
      }
    }
  } catch {}
  try {
    const mods = getNodeModules();
    if (mods?.electron?.webUtils && typeof mods.electron.webUtils.getPathForFile === 'function') {
      const p = mods.electron.webUtils.getPathForFile(file);
      if (typeof p === 'string' && p.trim().length > 0) {
        return p.trim();
      }
    }
  } catch {}
  return '';
}

/**
 * 彻底释放前端所有 <video> 标签对本地大视频文件的句柄占用
 * 将 src 置为 "" 并调用 load()，防止 Windows 删除/重命名/移动时报错 EBUSY/EPERM
 */
export async function releaseVideoFileHandles(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    const videos = Array.from(document.querySelectorAll('video'));
    for (const v of videos) {
      try {
        v.pause();
        v.removeAttribute('src');
        v.src = '';
        v.load();
      } catch {}
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 140));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function sanitizeFileName(name: string): string {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || '未命名';
}

export function isMediaFile(fileName: string): { isMedia: boolean; type: 'image' | 'video' } {
  if (!fileName || fileName.startsWith('.prism_')) return { isMedia: false, type: 'image' };
  const lower = fileName.toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)$/.test(lower)) {
    return { isMedia: true, type: 'image' };
  }
  if (/\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv)$/.test(lower)) {
    return { isMedia: true, type: 'video' };
  }
  return { isMedia: false, type: 'image' };
}

function toLocalFileUrl(filePath: string, mtimeMs?: number): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').map((seg, idx) => {
    if (idx === 0 && /^[a-zA-Z]:$/.test(seg)) return seg;
    return encodeURIComponent(seg);
  });
  const encodedPath = parts.join('/');
  const prefix = encodedPath.startsWith('/') ? 'file://' : 'file:///';
  const query = mtimeMs ? `?t=${Math.floor(mtimeMs)}` : '';
  return `${prefix}${encodedPath}${query}`;
}

// ==================== GLOBAL VAULT ROOT & CONFIG ====================

export interface VaultAppConfig {
  vaultRootPath: string;
  defaultSuggestedPath: string;
  thumbnailCacheDir: string;
  defaultThumbnailCacheDir: string;
  thumbnailCacheCount: number;
  thumbnailCacheBytes: number;
  security: SecurityConfig;
}

export interface ThumbnailCacheMigrationResult {
  ok: boolean;
  thumbnailCacheDir: string;
  migratedCount: number;
  thumbnailCacheCount: number;
  thumbnailCacheBytes: number;
  error?: string;
}

export async function getVaultAppConfig(): Promise<VaultAppConfig> {
  const defaultHash = await hashPassword('123456');
  const mods = getNodeModules();
  if (mods) {
    const cfg = await mods.electron.ipcRenderer.invoke('config:get');
    const sec = cfg.security || {};
    return {
      vaultRootPath: cfg.vaultRootPath || '',
      defaultSuggestedPath: cfg.defaultSuggestedPath || 'C:\\Users\\Public\\PrismDeskVault',
      thumbnailCacheDir: cfg.thumbnailCacheDir || '',
      defaultThumbnailCacheDir: cfg.defaultThumbnailCacheDir || '',
      thumbnailCacheCount: Number(cfg.thumbnailCacheCount || 0),
      thumbnailCacheBytes: Number(cfg.thumbnailCacheBytes || 0),
      security: {
        isPasswordSet: true,
        passwordHash: sec.passwordHash || defaultHash,
        hint: sec.hint !== undefined ? sec.hint : '初始密码 123456',
        isLocked: true,
      },
    };
  }

  const res = await fetch('/api/fs/config');
  const data = await res.json();
  const sec = data.security || {};
  return {
    vaultRootPath: data.vaultRootPath || '',
    defaultSuggestedPath: data.defaultSuggestedPath || '/app/applet/PrismDeskVault',
    thumbnailCacheDir: data.thumbnailCacheDir || '/app/applet/PrismDeskVault/.prism_thumbnails',
    defaultThumbnailCacheDir:
      data.defaultThumbnailCacheDir || '/app/applet/PrismDeskVault/.prism_thumbnails',
    thumbnailCacheCount: Number(data.thumbnailCacheCount || 0),
    thumbnailCacheBytes: Number(data.thumbnailCacheBytes || 0),
    security: {
      isPasswordSet: true,
      passwordHash: sec.passwordHash || defaultHash,
      hint: sec.hint !== undefined ? sec.hint : '初始密码 123456',
      isLocked: true,
    },
  };
}

export async function setVaultRootPath(newRootPath: string): Promise<string> {
  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('config:setVaultRoot', newRootPath);
    ensureElectronInitialFolders(res.vaultRootPath);
    return res.vaultRootPath;
  }

  const res = await fetch('/api/fs/config/root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vaultRootPath: newRootPath }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '设置物理根目录失败');
  return data.vaultRootPath;
}

export async function selectNativeDirectoryDialog(): Promise<string | null> {
  const mods = getNodeModules();
  if (mods) {
    const picked = await mods.electron.ipcRenderer.invoke('config:selectDirectoryDialog');
    if (picked) {
      ensureElectronInitialFolders(picked);
    }
    return picked;
  }
  return null;
}

export async function selectNativeThumbnailCacheDirDialog(): Promise<ThumbnailCacheMigrationResult | null> {
  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('config:selectThumbnailCacheDir');
    return res || null;
  }
  return null;
}

export async function setCustomThumbnailCacheDir(
  newDirPath: string
): Promise<ThumbnailCacheMigrationResult> {
  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('config:setThumbnailCacheDir', newDirPath);
    if (!res || !res.ok) {
      throw new Error(res?.error || '设置缩略图缓存目录失败');
    }
    return res;
  }

  const res = await fetch('/api/fs/config/thumbnail-dir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ thumbnailCacheDir: newDirPath }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '设置缩略图缓存目录失败');
  return data;
}

export async function clearDiskThumbnailCache(): Promise<{
  deletedCount: number;
  thumbnailCacheCount: number;
  thumbnailCacheBytes: number;
}> {
  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('fs:clearThumbnailCache');
    return {
      deletedCount: Number(res?.deletedCount || 0),
      thumbnailCacheCount: Number(res?.thumbnailCacheCount || 0),
      thumbnailCacheBytes: Number(res?.thumbnailCacheBytes || 0),
    };
  }

  const res = await fetch('/api/fs/thumbnail/clear', { method: 'POST' });
  const data = await res.json();
  return {
    deletedCount: Number(data?.deletedCount || 0),
    thumbnailCacheCount: Number(data?.thumbnailCacheCount || 0),
    thumbnailCacheBytes: Number(data?.thumbnailCacheBytes || 0),
  };
}

export interface NativeSelectedMediaFile {
  sourcePath: string;
  name: string;
  size: number;
  type: 'image' | 'video';
}

export async function selectNativeMediaFilesDialog(): Promise<NativeSelectedMediaFile[]> {
  const mods = getNodeModules();
  if (mods) {
    try {
      const filePaths: string[] = await mods.electron.ipcRenderer.invoke('fs:showOpenDialog');
      if (Array.isArray(filePaths) && filePaths.length > 0) {
        return filePaths.map((fp) => {
          let size = 0;
          try {
            size = mods.fs.statSync(fp).size;
          } catch {}
          const name = mods.path.basename(fp);
          const check = isMediaFile(name);
          return {
            sourcePath: fp,
            name,
            size,
            type: check.type,
          };
        });
      }
    } catch {
      const files = await mods.electron.ipcRenderer.invoke('dialog:selectMediaFiles');
      return Array.isArray(files) ? files : [];
    }
  }
  return [];
}

export function subscribeToVaultFsChanges(onChanged: () => void): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const triggerDebounced = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChanged();
    }, 1200);
  };

  const mods = getNodeModules();
  if (mods) {
    const handler = () => {
      triggerDebounced();
    };
    mods.electron.ipcRenderer.on('vault:fsChanged', handler);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      mods.electron.ipcRenderer.removeListener('vault:fsChanged', handler);
    };
  }

  let lastVersion: number | null = null;
  const timer = setInterval(async () => {
    try {
      const res = await fetch('/api/fs/watch-version');
      if (!res.ok) return;
      const data = await res.json();
      if (lastVersion === null) {
        lastVersion = data.version;
      } else if (data.version && data.version !== lastVersion) {
        lastVersion = data.version;
        triggerDebounced();
      }
    } catch {}
  }, 3000);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(timer);
  };
}

// ==================== NATIVE OS DRAG-OUT (event.sender.startDrag) ====================

let internalMediaDragUntil = 0;

/**
 * 标记当前正在执行“从软件向外部系统（桌面/PS/PR）拖拽导出文件”，
 * 防止触发窗口自身的“拖入导入文件”遮罩层。
 */
export function isInternalMediaDragActive(): boolean {
  return Date.now() < internalMediaDragUntil;
}

export function clearInternalMediaDragActive(): void {
  internalMediaDragUntil = 0;
}

/**
 * 触发 Electron 主进程原生系统级文件拖出 (event.sender.startDrag)
 * 支持单文件拖出及多选批量拖出到 Windows 桌面、资源管理器、PS、PR、剪映等外部软件
 */
export function startNativeFileDragOut(
  primaryItem: MediaItem,
  selectedItems?: MediaItem[],
  resolvedPosterPath?: string
): boolean {
  if (!primaryItem || !primaryItem.filePath) return false;

  internalMediaDragUntil = Date.now() + 2800;

  const batchList =
    selectedItems && selectedItems.length > 1 && selectedItems.some((m) => m.id === primaryItem.id)
      ? selectedItems
      : [primaryItem];

  const filePaths = Array.from(
    new Set(batchList.map((m) => m.filePath).filter((p): p is string => Boolean(p && p.trim())))
  );
  if (filePaths.length === 0) return false;

  const payload = {
    filePath: primaryItem.filePath,
    filePaths,
    iconPath: resolvedPosterPath || primaryItem.thumbUrl || primaryItem.filePath,
  };

  try {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;
    if (api && typeof api.startDrag === 'function') {
      api.startDrag(payload);
      return true;
    }
  } catch {}

  try {
    const mods = getNodeModules();
    if (mods?.electron?.ipcRenderer) {
      mods.electron.ipcRenderer.send('fs:startDrag', payload);
      return true;
    }
  } catch {}

  return false;
}

export function subscribeToImportProgress(
  onProgress: (info: { completed: number; total: number; currentFile: string }) => void
): () => void {
  const mods = getNodeModules();
  if (mods) {
    const handler = (_event: any, info: { completed: number; total: number; currentFile: string }) => {
      if (info) onProgress(info);
    };
    mods.electron.ipcRenderer.on('fs:importProgress', handler);
    return () => {
      mods.electron.ipcRenderer.removeListener('fs:importProgress', handler);
    };
  }
  return () => {};
}

// ==================== DYNAMIC CATEGORIES (.prism_categories.json) ====================

function readElectronCategories(rootPath: string): SectionConfig[] {
  const mods = getNodeModules();
  if (!mods || !rootPath) return SECTIONS;
  const { fs, path } = mods;
  const catPath = path.join(rootPath, '.prism_categories.json');
  if (fs.existsSync(catPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(catPath, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  fs.mkdirSync(rootPath, { recursive: true });
  fs.writeFileSync(catPath, JSON.stringify(SECTIONS, null, 2), 'utf-8');
  return SECTIONS;
}

function writeElectronCategories(rootPath: string, categories: SectionConfig[]) {
  const mods = getNodeModules();
  if (!mods || !rootPath) return;
  const { fs, path } = mods;
  fs.mkdirSync(rootPath, { recursive: true });
  fs.writeFileSync(path.join(rootPath, '.prism_categories.json'), JSON.stringify(categories, null, 2), 'utf-8');
}

function ensureElectronInitialFolders(rootPath: string) {
  const mods = getNodeModules();
  if (!mods || !rootPath) return;
  const { fs, path } = mods;
  fs.mkdirSync(rootPath, { recursive: true });

  const categories = readElectronCategories(rootPath);
  let existingSubfolders = 0;

  for (const cat of categories) {
    const secDir = cat.dirName || cat.id;
    const secPath = path.join(rootPath, secDir);
    fs.mkdirSync(secPath, { recursive: true });
    const entries = fs.readdirSync(secPath, { withFileTypes: true });
    existingSubfolders += entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length;
  }

  if (existingSubfolders === 0) {
    for (const def of DEFAULT_INITIAL_FOLDERS) {
      const cat = categories.find((c) => c.id === def.sectionId);
      if (!cat) continue;
      const secDir = cat.dirName || cat.id;
      const folderPath = path.join(rootPath, secDir, sanitizeFileName(def.name));
      fs.mkdirSync(folderPath, { recursive: true });
      const metaPath = path.join(folderPath, '.prism_meta.json');
      if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(
          metaPath,
          JSON.stringify(
            {
              id: def.id,
              name: def.name,
              description: def.description,
              coverFileName: '',
              coverUrl: '',
              createdAt: Date.now(),
              mediaSpecs: {},
            },
            null,
            2
          ),
          'utf-8'
        );
      }
    }
  }
}

export async function createPhysicalCategory(name: string, description?: string): Promise<SectionConfig> {
  const mods = getNodeModules();
  if (mods) {
    const { fs, path } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath) throw new Error('尚未配置根目录');

    const safeName = name.trim();
    const categories = readElectronCategories(cfg.vaultRootPath);
    let dirName = sanitizeFileName(safeName);
    if (fs.existsSync(path.join(cfg.vaultRootPath, dirName))) {
      dirName = `${dirName}_${Date.now().toString().slice(-4)}`;
    }

    const newCat: SectionConfig = {
      id: `cat-${Date.now()}`,
      name: safeName,
      enName: safeName,
      dirName,
      description: (description || '').trim() || `${safeName} 专属媒体归档区域`,
      iconName: 'Folder',
      badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
      accentColor: '#0ea5e9',
      mediaCategory: 'all',
      isBuiltin: false,
    };

    const catPhysicalPath = path.join(cfg.vaultRootPath, dirName);
    fs.mkdirSync(catPhysicalPath, { recursive: true });
    const defaultSub = path.join(catPhysicalPath, '默认素材夹');
    fs.mkdirSync(defaultSub, { recursive: true });
    fs.writeFileSync(
      path.join(defaultSub, '.prism_meta.json'),
      JSON.stringify({ name: '默认素材夹', description: '新建分类默认归档文件夹', createdAt: Date.now(), mediaSpecs: {} }, null, 2),
      'utf-8'
    );

    categories.push(newCat);
    writeElectronCategories(cfg.vaultRootPath, categories);
    return newCat;
  }

  const res = await fetch('/api/fs/category/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '新建分类失败');
  return data.category;
}

export async function renamePhysicalCategory(id: string, newName: string): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    const { fs, path } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath) return;

    const safeName = newName.trim();
    const categories = readElectronCategories(cfg.vaultRootPath);
    const idx = categories.findIndex((c) => c.id === id);
    if (idx === -1) return;

    const cat = categories[idx];
    const oldDirName = cat.dirName || cat.id;
    const newDirName = sanitizeFileName(safeName);
    const oldPath = path.join(cfg.vaultRootPath, oldDirName);
    const newPath = path.join(cfg.vaultRootPath, newDirName);

    if (oldPath !== newPath && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      fs.renameSync(oldPath, newPath);
      cat.dirName = newDirName;
    }

    cat.name = safeName;
    cat.enName = safeName;
    categories[idx] = cat;
    writeElectronCategories(cfg.vaultRootPath, categories);
    return;
  }

  const res = await fetch('/api/fs/category/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, newName }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '修改分类名称失败');
}

export async function deletePhysicalCategory(id: string): Promise<void> {
  await releaseVideoFileHandles();
  const mods = getNodeModules();
  if (mods) {
    const { fs, path, electron } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath) return;

    const categories = readElectronCategories(cfg.vaultRootPath);
    const target = categories.find((c) => c.id === id);
    if (!target) return;

    const dirName = target.dirName || target.id;
    const physicalPath = path.join(cfg.vaultRootPath, dirName);
    if (fs.existsSync(physicalPath)) {
      await electron.ipcRenderer.invoke('fs:batchTrash', [physicalPath]);
    }

    const nextCategories = categories.filter((c) => c.id !== id);
    writeElectronCategories(cfg.vaultRootPath, nextCategories);
    return;
  }

  const res = await fetch('/api/fs/category/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '删除分类失败');
}

// ==================== PHYSICAL DISK REAL-TIME SCANNING (IPC 50-ITEM CHUNKING + IDEMPOTENT DEDUP) ====================

function isSameMediaAsset(a: MediaItem, b: MediaItem): boolean {
  return (
    a.id === b.id &&
    a.filePath === b.filePath &&
    a.mtimeMs === b.mtimeMs &&
    a.size === b.size &&
    a.name === b.name &&
    a.folderId === b.folderId &&
    a.sectionId === b.sectionId &&
    (a.thumbUrl || '') === (b.thumbUrl || '')
  );
}

export function deduplicateMediaList(items: MediaItem[]): MediaItem[] {
  const map = new Map<string, MediaItem>();
  for (const item of items) {
    if (!item) continue;
    const key = item.filePath || item.id;
    map.set(key, item);
  }
  return Array.from(map.values());
}

/**
 * 分批流式累加函数式合并：
 * 1. 严禁在收到第 1 批分片 (isFirst) 时清空已有分类/文件夹的数据，彻底根除“切换或滚动时文件突然消失变空白”的 Bug；
 * 2. 对未发生属性变化的媒体项严格复用旧对象引用 (prevItem)，避免破坏 React.memo 引发全列表重绘闪烁。
 */
export function mergeMediaChunkPreservingRefs(
  prev: MediaItem[],
  chunk: MediaItem[]
): MediaItem[] {
  if (!Array.isArray(chunk) || chunk.length === 0) return prev;
  const map = new Map<string, MediaItem>();
  for (const existing of prev) {
    if (existing) {
      map.set(existing.filePath || existing.id, existing);
    }
  }

  let hasChanged = false;
  for (const incoming of chunk) {
    if (!incoming) continue;
    const key = incoming.filePath || incoming.id;
    const oldItem = map.get(key);
    if (oldItem && isSameMediaAsset(oldItem, incoming)) {
      // 复用旧引用，保持 React.memo 稳定
      continue;
    }
    map.set(key, incoming);
    hasChanged = true;
  }

  return hasChanged ? Array.from(map.values()) : prev;
}

/**
 * 全量扫描完成后的幂等引用对账函数：
 * 1. 对物理路径、修改时间、大小未变的媒体项 100% 复用原对象引用；
 * 2. 如果数组长度与各项引用完全一致，直接返回原数组引用 `prev`，实现 0 重渲染。
 */
export function reconcileMediaListPreservingRefs(
  prev: MediaItem[],
  next: MediaItem[]
): MediaItem[] {
  const dedupedNext = deduplicateMediaList(next);
  if (prev.length === 0 && dedupedNext.length === 0) return prev;

  const prevMap = new Map<string, MediaItem>();
  for (const item of prev) {
    if (item) {
      prevMap.set(item.filePath || item.id, item);
    }
  }

  let anyDiff = prev.length !== dedupedNext.length;
  const reconciled: MediaItem[] = new Array(dedupedNext.length);

  for (let i = 0; i < dedupedNext.length; i++) {
    const incoming = dedupedNext[i];
    const key = incoming.filePath || incoming.id;
    const existing = prevMap.get(key);
    if (existing && isSameMediaAsset(existing, incoming)) {
      reconciled[i] = existing;
      if (!anyDiff && prev[i] !== existing) {
        anyDiff = true;
      }
    } else {
      reconciled[i] = incoming;
      anyDiff = true;
    }
  }

  return anyDiff ? reconciled : prev;
}

export async function scanPhysicalVault(
  onMediaChunk?: (chunk: MediaItem[], isFirst: boolean) => void
): Promise<{
  categories: SectionConfig[];
  folders: FolderItem[];
  allMedia: MediaItem[];
  vaultRootPath: string;
}> {
  const mods = getNodeModules();
  if (mods) {
    const { fs, path, electron } = mods;
    const cfg = await getVaultAppConfig();
    const rootPath = cfg.vaultRootPath;
    if (!rootPath || !fs.existsSync(rootPath)) {
      return { categories: SECTIONS, folders: [], allMedia: [], vaultRootPath: '' };
    }

    ensureElectronInitialFolders(rootPath);

    // 优先使用主进程分片流式扫描 (fs:scanVaultChunked，50 条/批 + 唯一 scanId 会话锁 + Map 物理路径幂等去重)
    try {
      const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const collectedMap = new Map<string, MediaItem>();

      const chunkListener = (
        _event: any,
        payload: {
          scanId: string;
          chunk: MediaItem[];
          isFirst: boolean;
          isDone: boolean;
          total: number;
        }
      ) => {
        if (!payload || payload.scanId !== scanId || !Array.isArray(payload.chunk)) return;
        if (payload.isFirst) {
          collectedMap.clear();
        }
        for (const m of payload.chunk) {
          if (m) {
            collectedMap.set(m.filePath || m.id, m);
          }
        }
        if (onMediaChunk) {
          // 直接同步传递当前批次，彻底杜绝 requestAnimationFrame 跨帧延迟引发的“250截断”或“重复累加复制体”
          onMediaChunk(payload.chunk, payload.isFirst);
        }
      };

      electron.ipcRenderer.on('vault:mediaChunk', chunkListener);
      try {
        const res = await electron.ipcRenderer.invoke('fs:scanVaultChunked', { scanId });
        if (res && res.ok) {
          return {
            categories: res.categories?.length ? res.categories : SECTIONS,
            folders: res.folders || [],
            allMedia: Array.from(collectedMap.values()),
            vaultRootPath: res.vaultRootPath || rootPath,
          };
        }
      } finally {
        electron.ipcRenderer.removeListener('vault:mediaChunk', chunkListener);
      }
    } catch {
      // Fallback to direct fs scan if main process doesn't have fs:scanVaultChunked registered yet
    }

    const categories = readElectronCategories(rootPath);
    const folders: FolderItem[] = [];
    const mediaMap = new Map<string, MediaItem>();

    for (const cat of categories) {
      const secId = cat.id;
      const secDirName = cat.dirName || cat.id;
      const secPath = path.join(rootPath, secDirName);
      if (!fs.existsSync(secPath)) {
        fs.mkdirSync(secPath, { recursive: true });
      }

      const dirEntries = fs.readdirSync(secPath, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const folderPath = path.join(secPath, entry.name);
        const metaPath = path.join(folderPath, '.prism_meta.json');
        const stat = fs.statSync(folderPath);

        let meta: any = {
          id: `folder-${secId}-${entry.name}`,
          name: entry.name,
          description: '',
          coverFileName: '',
          coverUrl: '',
          createdAt: stat.birthtimeMs || stat.mtimeMs || Date.now(),
          mediaSpecs: {},
        };

        if (fs.existsSync(metaPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            meta = { ...meta, ...parsed };
          } catch {}
        } else {
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        }

        let effectiveCoverUrl = meta.coverUrl || '';
        if (meta.coverFileName) {
          const coverPhysicalPath = path.join(folderPath, meta.coverFileName);
          if (fs.existsSync(coverPhysicalPath)) {
            const coverStat = fs.statSync(coverPhysicalPath);
            effectiveCoverUrl = toLocalFileUrl(coverPhysicalPath, coverStat.mtimeMs);
          }
        }

        const folderId = `${secId}::${entry.name}`;
        folders.push({
          id: folderId,
          sectionId: secId,
          name: meta.name || entry.name,
          dirName: entry.name,
          folderPath,
          description: meta.description || '',
          coverUrl: effectiveCoverUrl || undefined,
          coverFileName: meta.coverFileName || undefined,
          createdAt: meta.createdAt || stat.mtimeMs,
        });

        const files = fs.readdirSync(folderPath, { withFileTypes: true });
        for (const f of files) {
          if (!f.isFile()) continue;
          const check = isMediaFile(f.name);
          if (!check.isMedia) continue;

          const fullFilePath = path.join(folderPath, f.name);
          const fStat = fs.statSync(fullFilePath);
          const mtimeMs = Math.floor(fStat.mtimeMs || Date.now());
          const spec = (meta.mediaSpecs && meta.mediaSpecs[f.name]) || {};

          const item: MediaItem = {
            id: `${folderId}::${f.name}`,
            folderId,
            sectionId: secId,
            name: f.name,
            filePath: fullFilePath,
            type: check.type,
            url: toLocalFileUrl(fullFilePath, mtimeMs),
            mtimeMs,
            size: fStat.size,
            sizeFormatted: formatFileSize(fStat.size),
            dimensions: spec.dimensions || (check.type === 'video' ? '1920 × 1080' : '高清原图'),
            durationFormatted: spec.durationFormatted || (check.type === 'video' ? '00:15' : undefined),
            createdAt: spec.createdAt || mtimeMs,
            tags: spec.tags || [],
          };
          mediaMap.set(fullFilePath, item);
        }
      }
    }

    const allMedia = Array.from(mediaMap.values());
    if (onMediaChunk && allMedia.length > 0) {
      const CHUNK_SIZE = 50;
      for (let i = 0; i < allMedia.length; i += CHUNK_SIZE) {
        const chunk = allMedia.slice(i, i + CHUNK_SIZE);
        onMediaChunk(chunk, i === 0);
      }
    }

    return { categories, folders, allMedia, vaultRootPath: rootPath };
  }

  const res = await fetch('/api/fs/scan');
  const data = await res.json();
  const mediaList: MediaItem[] = deduplicateMediaList(data.media || []);

  if (onMediaChunk && mediaList.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < mediaList.length; i += CHUNK_SIZE) {
      const chunk = mediaList.slice(i, i + CHUNK_SIZE);
      onMediaChunk(chunk, i === 0);
    }
  }

  return {
    categories: data.categories || SECTIONS,
    folders: data.folders || [],
    allMedia: mediaList,
    vaultRootPath: data.vaultRootPath || '',
  };
}

// ==================== PERSISTENT DISK THUMBNAIL CACHE (MD5 path + mtimeMs) ====================

export interface DiskThumbnailResult {
  hit: boolean;
  thumbUrl?: string;
  durationFormatted?: string;
  dimensions?: string;
}

export async function getDiskThumbnail(item: MediaItem): Promise<DiskThumbnailResult> {
  if (item.thumbUrl) {
    return {
      hit: true,
      thumbUrl: item.thumbUrl,
      durationFormatted: item.durationFormatted,
      dimensions: item.dimensions,
    };
  }
  if (!item.filePath) return { hit: false };

  const mods = getNodeModules();
  if (mods) {
    try {
      const res = await mods.electron.ipcRenderer.invoke('fs:getThumbnail', {
        filePath: item.filePath,
        mtimeMs: item.mtimeMs,
      });
      if (res && res.hit && res.thumbUrl) {
        return {
          hit: true,
          thumbUrl: res.thumbUrl,
          durationFormatted: res.durationFormatted,
          dimensions: res.dimensions,
        };
      }
    } catch {}
    return { hit: false };
  }

  try {
    const res = await fetch('/api/fs/thumbnail/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: item.filePath, mtimeMs: item.mtimeMs }),
    });
    const data = await res.json();
    if (data && data.hit && data.thumbUrl) {
      return {
        hit: true,
        thumbUrl: data.thumbUrl,
        durationFormatted: data.durationFormatted,
        dimensions: data.dimensions,
      };
    }
  } catch {}
  return { hit: false };
}

export async function saveDiskThumbnail(
  item: MediaItem,
  base64Jpeg: string,
  durationFormatted?: string,
  dimensions?: string
): Promise<string | null> {
  if (!item.filePath || !base64Jpeg) return null;

  const mods = getNodeModules();
  if (mods) {
    try {
      const res = await mods.electron.ipcRenderer.invoke('fs:saveThumbnail', {
        filePath: item.filePath,
        mtimeMs: item.mtimeMs,
        base64Jpeg,
        durationFormatted,
        dimensions,
      });
      if (res && res.ok && res.thumbUrl) {
        return res.thumbUrl;
      }
    } catch {}
    return null;
  }

  try {
    const res = await fetch('/api/fs/thumbnail/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: item.filePath,
        mtimeMs: item.mtimeMs,
        base64Jpeg,
        durationFormatted,
        dimensions,
      }),
    });
    const data = await res.json();
    if (data && data.ok && data.thumbUrl) {
      return data.thumbUrl;
    }
  } catch {}
  return null;
}

// ==================== SUBFOLDER & .prism_meta.json PERSISTENCE ====================

export async function savePhysicalFolder(
  folder: FolderItem,
  existingFolderId?: string
): Promise<string> {
  const mods = getNodeModules();
  if (mods) {
    const { fs, path } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath) throw new Error('尚未配置本地媒体库根目录');

    const categories = readElectronCategories(cfg.vaultRootPath);
    const cat = categories.find((c) => c.id === folder.sectionId);
    const secDirName = cat ? cat.dirName || cat.id : folder.sectionId;

    const safeDirName = sanitizeFileName(folder.name);
    const secPath = path.join(cfg.vaultRootPath, secDirName);
    fs.mkdirSync(secPath, { recursive: true });

    let targetFolderPath = path.join(secPath, safeDirName);
    let existingMeta: any = {
      name: folder.name.trim(),
      description: folder.description || '',
      coverFileName: '',
      coverUrl: '',
      createdAt: folder.createdAt || Date.now(),
      mediaSpecs: {},
    };

    if (existingFolderId && existingFolderId.includes('::')) {
      const [oldSecId, oldDirName] = existingFolderId.split('::');
      const oldCat = categories.find((c) => c.id === oldSecId);
      const oldSecDir = oldCat ? oldCat.dirName || oldCat.id : oldSecId;
      const oldFolderPath = path.join(cfg.vaultRootPath, oldSecDir, oldDirName);
      if (fs.existsSync(oldFolderPath)) {
        const oldMetaPath = path.join(oldFolderPath, '.prism_meta.json');
        if (fs.existsSync(oldMetaPath)) {
          try {
            existingMeta = { ...existingMeta, ...JSON.parse(fs.readFileSync(oldMetaPath, 'utf-8')) };
          } catch {}
        }
        if (oldFolderPath !== targetFolderPath) {
          if (!fs.existsSync(targetFolderPath)) {
            fs.renameSync(oldFolderPath, targetFolderPath);
          } else {
            targetFolderPath = oldFolderPath;
          }
        }
      }
    }

    fs.mkdirSync(targetFolderPath, { recursive: true });

    if (folder.clearCover) {
      existingMeta.coverFileName = '';
      existingMeta.coverUrl = '';
    }

    if (folder.coverDataUrl && folder.coverDataUrl.startsWith('data:image/')) {
      const matches = folder.coverDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] === 'png' ? '.png' : matches[1] === 'webp' ? '.webp' : '.jpg';
        const coverFileName = `.prism_cover${ext}`;
        const coverDest = path.join(targetFolderPath, coverFileName);
        fs.writeFileSync(coverDest, Buffer.from(matches[2], 'base64'));
        existingMeta.coverFileName = coverFileName;
        existingMeta.coverUrl = '';
      }
    } else if (folder.coverSourceFilePath && fs.existsSync(folder.coverSourceFilePath)) {
      const ext = path.extname(folder.coverSourceFilePath) || '.jpg';
      const coverFileName = `.prism_cover${ext}`;
      const coverDest = path.join(targetFolderPath, coverFileName);
      if (path.resolve(folder.coverSourceFilePath) !== path.resolve(coverDest)) {
        fs.copyFileSync(folder.coverSourceFilePath, coverDest);
      }
      existingMeta.coverFileName = coverFileName;
      existingMeta.coverUrl = '';
    } else if (folder.coverUrl && !folder.coverUrl.startsWith('file://')) {
      existingMeta.coverUrl = folder.coverUrl;
    }

    existingMeta.name = folder.name.trim();
    existingMeta.description = (folder.description || '').trim();

    const metaPath = path.join(targetFolderPath, '.prism_meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(existingMeta, null, 2), 'utf-8');

    return `${folder.sectionId}::${path.basename(targetFolderPath)}`;
  }

  const res = await fetch('/api/fs/folder/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      existingFolderId,
      sectionId: folder.sectionId,
      name: folder.name,
      description: folder.description,
      coverDataUrl: folder.coverDataUrl,
      coverSourceFilePath: folder.coverSourceFilePath,
      coverUrl: folder.coverUrl,
      clearCover: folder.clearCover,
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '保存文件夹失败');
  return data.folderId;
}

export async function deletePhysicalFolder(folderId: string): Promise<void> {
  await releaseVideoFileHandles();
  const mods = getNodeModules();
  if (mods) {
    const { fs, path, electron } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath || !folderId.includes('::')) return;
    const [secId, dirName] = folderId.split('::');
    const categories = readElectronCategories(cfg.vaultRootPath);
    const cat = categories.find((c) => c.id === secId);
    const secDirName = cat ? cat.dirName || cat.id : secId;
    const folderPath = path.join(cfg.vaultRootPath, secDirName, dirName);
    if (fs.existsSync(folderPath)) {
      await electron.ipcRenderer.invoke('fs:batchTrash', [folderPath]);
    }
    return;
  }

  await fetch('/api/fs/folder/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId }),
  });
}

// ==================== BATCH IMPORT / RENAME / MOVE / RECYCLE BIN TRASH ====================

export interface PhysicalImportPayload {
  name: string;
  type: 'image' | 'video';
  sourcePath?: string;
  base64Data?: string;
  dimensions?: string;
  durationFormatted?: string;
  tags?: string[];
}

export async function importPhysicalMediaItems(
  folderId: string,
  items: PhysicalImportPayload[]
): Promise<void> {
  if (!items || items.length === 0) return;

  const mods = getNodeModules();
  if (mods) {
    const { path, electron } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath || !folderId.includes('::')) return;

    const [secId, dirName] = folderId.split('::');
    const categories = readElectronCategories(cfg.vaultRootPath);
    const cat = categories.find((c) => c.id === secId);
    const secDirName = cat ? cat.dirName || cat.id : secId;
    const folderPath = path.join(cfg.vaultRootPath, secDirName, dirName);

    // 单次批量数组 IPC 请求，主进程内部使用 Promise.all 分块异步处理，绝不卡顿
    const res = await electron.ipcRenderer.invoke('fs:batchImport', {
      folderPath,
      items,
    });
    if (!res.ok) throw new Error(res.error || '批量导入失败');
    return;
  }

  const res = await fetch('/api/fs/media/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, items }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '导入物理文件失败');
}

export async function pastePhysicalMediaItems(
  targetFolderId: string,
  items: MediaItem[]
): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    const payloads: PhysicalImportPayload[] = items
      .filter((i) => i.filePath)
      .map((i) => ({
        name: i.name,
        type: i.type,
        sourcePath: i.filePath,
        dimensions: i.dimensions,
        durationFormatted: i.durationFormatted,
      }));
    await importPhysicalMediaItems(targetFolderId, payloads);
    return;
  }

  await fetch('/api/fs/media/paste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetFolderId,
      sourceFilePaths: items.map((i) => ({
        filePath: i.filePath,
        dimensions: i.dimensions,
        durationFormatted: i.durationFormatted,
      })),
    }),
  });
}

// 安全删除：先彻底释放 <video> 文件句柄，再通过批量 IPC 调用 Electron shell.trashItem(path)
export async function deletePhysicalMediaItems(items: MediaItem[]): Promise<void> {
  const filePaths = items.map((i) => i.filePath).filter(Boolean) as string[];
  if (filePaths.length === 0) return;

  await releaseVideoFileHandles();

  const mods = getNodeModules();
  if (mods) {
    await mods.electron.ipcRenderer.invoke('fs:batchTrash', filePaths);
    return;
  }

  await fetch('/api/fs/media/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePaths }),
  });
}

// 物理重命名单个媒体文件 (先释放视频句柄再重命名)
export async function renamePhysicalMediaItem(item: MediaItem, newName: string): Promise<void> {
  if (!item.filePath || !newName.trim()) return;

  await releaseVideoFileHandles();

  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('fs:renameMedia', {
      filePath: item.filePath,
      newName: newName.trim(),
    });
    if (!res.ok) throw new Error(res.error || '重命名文件失败');
    return;
  }

  const res = await fetch('/api/fs/media/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath: item.filePath, newName: newName.trim() }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '重命名文件失败');
}

// 批量顺序重命名多个物理媒体文件 (BaseName_01.ext, BaseName_02.ext...)
export async function batchRenamePhysicalMediaItems(
  items: MediaItem[],
  baseName: string
): Promise<number> {
  const filePaths = items.map((i) => i.filePath).filter(Boolean) as string[];
  const cleanBase = baseName.trim();
  if (filePaths.length === 0 || !cleanBase) return 0;

  await releaseVideoFileHandles();

  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('fs:batchRenameMedia', {
      filePaths,
      baseName: cleanBase,
    });
    if (!res.ok) throw new Error(res.error || '批量重命名文件失败');
    return res.count || filePaths.length;
  }

  const res = await fetch('/api/fs/media/batch-rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePaths, baseName: cleanBase }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '批量重命名文件失败');
  return data.count || filePaths.length;
}

// 跨目录批量移动物理媒体文件 (先释放视频句柄再移动)
export async function movePhysicalMediaItems(items: MediaItem[], targetFolderId: string): Promise<void> {
  const filePaths = items.map((i) => i.filePath).filter(Boolean) as string[];
  if (filePaths.length === 0 || !targetFolderId.includes('::')) return;

  await releaseVideoFileHandles();

  const mods = getNodeModules();
  if (mods) {
    const { path, electron } = mods;
    const cfg = await getVaultAppConfig();
    if (!cfg.vaultRootPath) return;

    const [secId, dirName] = targetFolderId.split('::');
    const categories = readElectronCategories(cfg.vaultRootPath);
    const cat = categories.find((c) => c.id === secId);
    const secDirName = cat ? cat.dirName || cat.id : secId;
    const targetFolderPath = path.join(cfg.vaultRootPath, secDirName, dirName);

    const res = await electron.ipcRenderer.invoke('fs:moveMedia', {
      filePaths,
      targetFolderPath,
    });
    if (!res.ok) throw new Error(res.error || '移动文件失败');
    return;
  }

  const res = await fetch('/api/fs/media/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePaths, targetFolderId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '移动文件失败');
}

// ==================== SYSTEM CLIPBOARD & EXPLORER SHELL ====================

export async function copyMediaToSystemClipboard(item: MediaItem): Promise<void> {
  const mods = getNodeModules();
  if (mods && item.filePath) {
    await mods.electron.ipcRenderer.invoke('clipboard:copyFileAndPath', item.filePath);
    return;
  }

  const pathText = item.filePath || item.url;
  try {
    await navigator.clipboard.writeText(pathText);
  } catch {}
}

export async function openVaultRootInExplorer(targetPath?: string): Promise<{
  openedNative: boolean;
  path: string;
}> {
  const mods = getNodeModules();
  if (mods) {
    const res = await mods.electron.ipcRenderer.invoke('shell:openPath', targetPath);
    return {
      openedNative: !!res.ok,
      path: res.path || targetPath || '',
    };
  }

  const cfg = await getVaultAppConfig();
  return {
    openedNative: false,
    path: targetPath || cfg.vaultRootPath || cfg.defaultSuggestedPath,
  };
}

// ==================== WINDOW CONTROLS ====================

export async function minimizeAppWindow(): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    await mods.electron.ipcRenderer.invoke('window:minimize');
  }
}

export async function toggleMaximizeAppWindow(): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    await mods.electron.ipcRenderer.invoke('window:toggleMaximize');
  }
}

export async function closeAppWindow(): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    await mods.electron.ipcRenderer.invoke('window:close');
  }
}

// ==================== SECURITY & PASSWORD HASH ====================

export async function saveSecurityConfig(config: SecurityConfig): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    await mods.electron.ipcRenderer.invoke('config:saveSecurity', config);
    return;
  }

  await fetch('/api/fs/config/security', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ security: config }),
  });
}

export async function hashPassword(password: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(password + '_prismdesk_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ==================== CLEAR DATA & DEMO PACK GENERATOR ====================

export async function clearAllPhysicalData(): Promise<void> {
  const mods = getNodeModules();
  if (mods) {
    const { fs, path, electron } = mods;
    const cfg = await getVaultAppConfig();
    if (cfg.vaultRootPath && fs.existsSync(cfg.vaultRootPath)) {
      const categories = readElectronCategories(cfg.vaultRootPath);
      const pathsToTrash: string[] = [];
      for (const cat of categories) {
        const secDir = cat.dirName || cat.id;
        const secPath = path.join(cfg.vaultRootPath, secDir);
        if (fs.existsSync(secPath)) {
          pathsToTrash.push(secPath);
        }
      }
      if (pathsToTrash.length > 0) {
        await electron.ipcRenderer.invoke('fs:batchTrash', pathsToTrash);
      }
      writeElectronCategories(cfg.vaultRootPath, SECTIONS);
      ensureElectronInitialFolders(cfg.vaultRootPath);
    }
    return;
  }

  await fetch('/api/fs/clear-all', { method: 'POST' });
}

export async function populatePhysicalDemoPack(): Promise<void> {
  const createSampleImageBase64 = (
    title: string,
    subtitle: string,
    c1: string,
    c2: string,
    width = 1600,
    height = 900
  ): string => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    for (let x = 0; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(width * 0.78, height * 0.35, 260, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 58px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(title, 120, height / 2 - 15);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '32px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(subtitle, 120, height / 2 + 50);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '24px "JetBrains Mono", monospace';
    ctx.fillText(`${width} × ${height} · PRISMDESK PHYSICAL ASSET`, 120, height / 2 + 115);

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const { folders } = await scanPhysicalVault();

  const demoSamples: {
    sectionId: SectionId;
    folderName: string;
    fileName: string;
    title: string;
    subtitle: string;
    c1: string;
    c2: string;
    dimensions: string;
  }[] = [
    {
      sectionId: 'materials',
      folderName: '纹理背景与环境材质',
      fileName: '天际流光流体渐变主背景_01.jpg',
      title: '天际流光流体渐变背景',
      subtitle: '高动态范围渐变素材 · 适用海报与主视觉底图',
      c1: '#0284c7',
      c2: '#0369a1',
      dimensions: '3840 × 2160',
    },
    {
      sectionId: 'materials',
      folderName: '人物肖像与主体抠图',
      fileName: '商业先锋人像伦勃朗光参考_RAW.jpg',
      title: '先锋光影人像构图原片',
      subtitle: '无损细节人像参考 · 商业摄影原片归档',
      c1: '#0f172a',
      c2: '#0284c7',
      dimensions: '3000 × 4000',
    },
    {
      sectionId: 'finished',
      folderName: '2026 商业视觉发布系列',
      fileName: '2026全球数字艺术峰会KV定稿.jpg',
      title: '2026 全球数字艺术峰会主视觉',
      subtitle: '已全渠道过审定稿 · 商业发布级成图',
      c1: '#0369a1',
      c2: '#0ea5e9',
      dimensions: '5120 × 2880',
    },
    {
      sectionId: 'upscaled',
      folderName: '8K 超清细节增强图',
      fileName: '微距晶石折射超分重绘_8K.jpg',
      title: '8K 超清晶石光学纹理增强',
      subtitle: 'AI 4x 超分辨无损放大 · 纤毫毕现',
      c1: '#075985',
      c2: '#38bdf8',
      dimensions: '7680 × 4320',
    },
    {
      sectionId: 'video_assets',
      folderName: '实拍镜头与空镜素材库',
      fileName: '深海流光粒子实拍空镜预览帧.jpg',
      title: '4K 实拍流光空镜镜头归档',
      subtitle: 'B-Roll 高帧率实拍空镜与转场素材',
      c1: '#0c4a6e',
      c2: '#0284c7',
      dimensions: '3840 × 2160',
    },
    {
      sectionId: 'generated_videos',
      folderName: 'AI 生成动态视频与特效',
      fileName: 'Sora云端天空之城运镜生成帧.jpg',
      title: 'AI 生成云端建筑动态运镜',
      subtitle: '生成式视频特效镜头 · 60fps 序列参考',
      c1: '#0284c7',
      c2: '#38bdf8',
      dimensions: '1920 × 1080',
    },
    {
      sectionId: 'masterpieces',
      folderName: '个人年度代表作精选集',
      fileName: '《苍穹之境》年度视觉金奖成片海报.jpg',
      title: '《苍穹之境》年度代表作终稿',
      subtitle: 'PrismDesk 成品区域殿堂级典藏作品',
      c1: '#0369a1',
      c2: '#0284c7',
      dimensions: '3840 × 2160',
    },
  ];

  for (const sample of demoSamples) {
    const targetFolder = folders.find(
      (f) => f.sectionId === sample.sectionId && f.name === sample.folderName
    );
    let folderId = targetFolder?.id;

    if (!folderId) {
      folderId = await savePhysicalFolder({
        id: '',
        sectionId: sample.sectionId,
        name: sample.folderName,
        description: sample.subtitle,
        createdAt: Date.now(),
      });
    }

    const base64Data = createSampleImageBase64(
      sample.title,
      sample.subtitle,
      sample.c1,
      sample.c2
    );

    await importPhysicalMediaItems(folderId, [
      {
        name: sample.fileName,
        type: 'image',
        base64Data,
        dimensions: sample.dimensions,
        tags: ['精选演示', sample.sectionId],
      },
    ]);

    await savePhysicalFolder(
      {
        id: folderId,
        sectionId: sample.sectionId,
        name: sample.folderName,
        description: targetFolder?.description || sample.subtitle,
        coverDataUrl: base64Data,
        createdAt: Date.now(),
      },
      folderId
    );
  }
}
