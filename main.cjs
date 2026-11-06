/**
 * PrismDesk Media Vault - Electron Main Process (main.cjs)
 * Native Windows Frameless Desktop App with Node.js fs Physical File Sync,
 * Dynamic Media Categories (.prism_categories.json), System Recycle Bin (shell.trashItem with EBUSY retry),
 * Real-Time Disk Hot-Reload (fs.watch), and Zero-Memory Streaming Async Queue (fs:batchImport).
 */

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pipeline } = require('stream/promises');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update('123456_prismdesk_salt_2026')
  .digest('hex');

// 1. Single Instance Lock (单实例锁定，禁止多开)
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow = null;
let vaultWatcher = null;
let watcherDebounceTimer = null;
let internalFsLockCount = 0;

function beginInternalFsOp() {
  internalFsLockCount += 1;
  if (watcherDebounceTimer) {
    clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = null;
  }
}

function endInternalFsOp() {
  setTimeout(() => {
    internalFsLockCount = Math.max(0, internalFsLockCount - 1);
  }, 600);
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.registerFileProtocol('prism-media', (request, callback) => {
      try {
        const url = request.url.replace(/^prism-media:\/\/+/i, '');
        const decodedPath = decodeURIComponent(url);
        callback({ path: path.normalize(decodedPath) });
      } catch (err) {
        console.error('Protocol error:', err);
      }
    });

    createMainWindow();

    const cfg = readAppConfig();
    if (cfg.vaultRootPath) {
      setupVaultWatcher(cfg.vaultRootPath);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

function getAppConfigPath() {
  return path.join(app.getPath('userData'), 'prismdesk_app_config.json');
}

function getDefaultThumbnailCacheDir() {
  return path.join(app.getPath('userData'), 'thumbnails');
}

function readAppConfig() {
  const cfgPath = getAppConfigPath();
  const defaultThumbDir = getDefaultThumbnailCacheDir();
  try {
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const sec = parsed.security || {};
      return {
        vaultRootPath: parsed.vaultRootPath || '',
        thumbnailCacheDir: parsed.thumbnailCacheDir || defaultThumbDir,
        security: {
          isPasswordSet: true,
          passwordHash: sec.passwordHash || DEFAULT_PASSWORD_HASH,
          hint: sec.hint !== undefined ? sec.hint : '初始密码 123456',
          isLocked: true,
        },
      };
    }
  } catch (e) {
    console.error('Failed to read app config:', e);
  }
  return {
    vaultRootPath: '',
    thumbnailCacheDir: defaultThumbDir,
    security: {
      isPasswordSet: true,
      passwordHash: DEFAULT_PASSWORD_HASH,
      hint: '初始密码 123456',
      isLocked: true,
    },
  };
}

function writeAppConfig(cfg) {
  const cfgPath = getAppConfigPath();
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
}

// ==================== 实时磁盘热加载监听 (fs.watch 仅响应结构重命名/增删 + 1500ms 防抖 + 内部静默锁) ====================
function setupVaultWatcher(rootPath) {
  if (vaultWatcher) {
    try {
      vaultWatcher.close();
    } catch {}
    vaultWatcher = null;
  }

  if (!rootPath || !fs.existsSync(rootPath)) return;

  try {
    vaultWatcher = fs.watch(rootPath, { recursive: true }, (eventType, filename) => {
      if (internalFsLockCount > 0) return;
      // 关键防闪烁修复：Windows 下 <video> 读取视频首帧或流播放时会触发 'change' 事件，
      // 严禁因读取文件触发热重载清空列表，仅在文件新增/删除/重命名 ('rename') 时触发同步
      if (eventType && eventType !== 'rename') return;

      if (filename) {
        const strName = String(filename);
        const base = path.basename(strName);
        if (
          base.startsWith('.prism_') ||
          base.startsWith('_prism_tmp_') ||
          strName.includes('.prism_trash') ||
          strName.includes('.prism_thumbnails') ||
          strName.includes('thumbnails') ||
          base === 'Thumbs.db' ||
          base === 'desktop.ini' ||
          base === '.DS_Store'
        ) {
          return;
        }
      }

      if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
      watcherDebounceTimer = setTimeout(() => {
        if (internalFsLockCount > 0) return;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vault:fsChanged', {
            timestamp: Date.now(),
            filename: filename ? String(filename) : '',
          });
        }
      }, 1500);
    });
  } catch (err) {
    console.error('Failed to setup fs.watch on vaultRootPath:', err);
  }
}

const DEFAULT_CATEGORIES = [
  {
    id: 'materials',
    name: '素材图区域',
    enName: 'Raw Materials',
    dirName: 'materials',
    description: '原始素材图片、设计原件、构图参考与元素资产',
    iconName: 'Image',
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: '#0284c7',
    mediaCategory: 'image',
    isBuiltin: true,
  },
  {
    id: 'finished',
    name: '成品图区域',
    enName: 'Finished Works',
    dirName: 'finished',
    description: '定稿海报、电商详情图、KV 视觉与发布级视觉成稿',
    iconName: 'Sparkles',
    badgeColor: 'text-sky-800 bg-sky-100/70 border-sky-300/80',
    accentColor: '#0369a1',
    mediaCategory: 'image',
    isBuiltin: true,
  },
  {
    id: 'upscaled',
    name: '二次放大图片区域',
    enName: 'Upscaled Images',
    dirName: 'upscaled',
    description: '超分高清重绘、AI 放大 4K/8K 增强图与精修细节特写',
    iconName: 'Maximize2',
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: '#0ea5e9',
    mediaCategory: 'image',
    isBuiltin: true,
  },
  {
    id: 'video_assets',
    name: '视频素材区域',
    enName: 'Video Assets',
    dirName: 'video_assets',
    description: '实拍镜头、转场特写、背景动态与 B-Roll 空镜视频片段',
    iconName: 'Film',
    badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
    accentColor: '#38bdf8',
    mediaCategory: 'video',
    isBuiltin: true,
  },
  {
    id: 'generated_videos',
    name: '生成视频素材区域',
    enName: 'Generated Videos',
    dirName: 'generated_videos',
    description: 'AI 生成动态视频、特效镜头、运镜合成与动作演化素材',
    iconName: 'Activity',
    badgeColor: 'text-sky-800 bg-sky-100/60 border-sky-200',
    accentColor: '#0284c7',
    mediaCategory: 'video',
    isBuiltin: true,
  },
  {
    id: 'masterpieces',
    name: '成品区域',
    enName: 'Final Deliverables',
    dirName: 'masterpieces',
    description: '最终定稿成片、代表作合集、高光混剪与全套商业交付成品',
    iconName: 'Crown',
    badgeColor: 'text-sky-900 bg-sky-100 border-sky-300',
    accentColor: '#0369a1',
    mediaCategory: 'all',
    isBuiltin: true,
  },
];

function sanitizeName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || '未命名';
}

function getCategoriesFilePath(rootPath) {
  return path.join(rootPath, '.prism_categories.json');
}

function readVaultCategories(rootPath) {
  if (!rootPath) return DEFAULT_CATEGORIES;
  const catPath = getCategoriesFilePath(rootPath);
  if (fs.existsSync(catPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(catPath, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error('Failed to read .prism_categories.json:', e);
    }
  }
  fs.mkdirSync(rootPath, { recursive: true });
  fs.writeFileSync(catPath, JSON.stringify(DEFAULT_CATEGORIES, null, 2), 'utf-8');
  return DEFAULT_CATEGORIES;
}

function ensureVaultStructure(rootPath) {
  if (!rootPath) return;
  fs.mkdirSync(rootPath, { recursive: true });
  const categories = readVaultCategories(rootPath);
  for (const cat of categories) {
    const dirName = cat.dirName || cat.id;
    fs.mkdirSync(path.join(rootPath, dirName), { recursive: true });
  }
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false, // 无边框窗口，配合前端 TitleBar -webkit-app-region: drag
    titleBarStyle: 'hidden',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ==================== IPC 原生桌面与防卡顿流式物理文件通信接口 ====================

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('config:get', () => {
  const cfg = readAppConfig();
  const defaultSuggestedPath = path.join(os.homedir(), 'Documents', 'PrismDeskVault');
  const defaultThumbnailCacheDir = getDefaultThumbnailCacheDir();
  if (cfg.vaultRootPath) {
    ensureVaultStructure(cfg.vaultRootPath);
    setupVaultWatcher(cfg.vaultRootPath);
  }
  const stats = getThumbnailCacheStats(getThumbnailsDir());
  return {
    ...cfg,
    thumbnailCacheDir: getThumbnailsDir(),
    defaultThumbnailCacheDir,
    thumbnailCacheCount: stats.count,
    thumbnailCacheBytes: stats.bytes,
    defaultSuggestedPath,
  };
});

ipcMain.handle('config:setVaultRoot', (_event, newRootPath) => {
  const resolved = path.resolve(newRootPath);
  ensureVaultStructure(resolved);
  const cfg = readAppConfig();
  cfg.vaultRootPath = resolved;
  writeAppConfig(cfg);
  setupVaultWatcher(resolved);
  return { vaultRootPath: resolved };
});

ipcMain.handle('config:selectDirectoryDialog', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 PrismDesk 媒体宝库本地物理根目录',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  const chosenPath = result.filePaths[0];
  ensureVaultStructure(chosenPath);
  const cfg = readAppConfig();
  cfg.vaultRootPath = chosenPath;
  writeAppConfig(cfg);
  setupVaultWatcher(chosenPath);
  return chosenPath;
});

// 1. 系统原生文件选择器标准接口 (fs:showOpenDialog)
ipcMain.handle('fs:showOpenDialog', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '媒体文件',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mkv', 'avi'],
      },
    ],
  });
  if (result.canceled || !result.filePaths) {
    return [];
  }
  return result.filePaths;
});

// 兼容返回元数据的原生文件选择器接口 (dialog:selectMediaFiles)
ipcMain.handle('dialog:selectMediaFiles', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择要导入的图片或视频文件 (支持 400MB+ 大视频流式复制)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: '媒体文件',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'mp4', 'webm', 'mov', 'mkv', 'avi'],
      },
    ],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return [];
  }

  return result.filePaths.map((fp) => {
    let size = 0;
    try {
      size = fs.statSync(fp).size;
    } catch {}
    const name = path.basename(fp);
    const isVideo = /\.(mp4|webm|mov|mkv|avi|m4v|flv|wmv)$/i.test(name);
    return {
      sourcePath: fp,
      name,
      size,
      type: isVideo ? 'video' : 'image',
    };
  });
});

ipcMain.handle('config:saveSecurity', (_event, securityConfig) => {
  const cfg = readAppConfig();
  cfg.security = {
    isPasswordSet: true,
    passwordHash: securityConfig.passwordHash || DEFAULT_PASSWORD_HASH,
    hint: securityConfig.hint !== undefined ? securityConfig.hint : '初始密码 123456',
    isLocked: false,
  };
  writeAppConfig(cfg);
  return cfg.security;
});

ipcMain.handle('shell:openPath', async (_event, targetPath) => {
  const cfg = readAppConfig();
  const dirToOpen = targetPath || cfg.vaultRootPath;
  if (dirToOpen && fs.existsSync(dirToOpen)) {
    await shell.openPath(dirToOpen);
    return { ok: true, path: dirToOpen };
  }
  return { ok: false, error: '目录不存在' };
});

// 系统级剪贴板复制路径与文件本体
ipcMain.handle('clipboard:copyFileAndPath', (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ok: false, error: '源文件不存在' };
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext);

    clipboard.writeText(filePath);

    if (isImage) {
      const img = nativeImage.createFromPath(filePath);
      if (!img.isEmpty()) {
        clipboard.write({
          text: filePath,
          image: img,
        });
      }
    }

    if (process.platform === 'win32') {
      const filePathWithNull = filePath + '\0';
      const ucs2Buffer = Buffer.from(filePathWithNull, 'ucs2');
      clipboard.writeBuffer('FileNameW', ucs2Buffer);
    }

    return { ok: true, path: filePath };
  } catch (err) {
    clipboard.writeText(filePath);
    return { ok: true, path: filePath };
  }
});

// ==================== 原生文件拖拽到外部应用 (Windows 桌面 / PS / PR / 剪映等) ====================
// 内置轻量级 1x1 PNG 兜底图标 DataURL，防止 Windows 下 nativeImage 为空导致 startDrag 报错
const FALLBACK_DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAbklEQVR4nO3RsQkAIBAEwZP9l9Z2sYgg4J7ZBL45z8x0A4M7AAMDGxgY2MDAxgYGNjAwsIGBjQ0MbGBgYwMDGxgY2MDAxgYGNjAwsIGBjQ0MbGBgYwMDGxgY2MDAxgYGNjAwsIGBjQ0MbGDgBZYTAcH2n2sAAAAASUVORK5CYII=';

function buildNativeDragIcon(primaryPath, mtimeMs) {
  try {
    // 1. 若是视频且存在磁盘缩略图缓存 (.jpg)，优先使用该视频首帧缩略图作为拖拽图标
    const hash = computeThumbnailHash(primaryPath, mtimeMs || fs.statSync(primaryPath).mtimeMs);
    const cachedJpg = path.join(getThumbnailsDir(), `${hash}.jpg`);
    if (fs.existsSync(cachedJpg)) {
      const thumbImg = nativeImage.createFromPath(cachedJpg);
      if (!thumbImg.isEmpty()) {
        return thumbImg.resize({ width: 96 });
      }
    }

    // 2. 若本身是图片文件，直接缩放原图作为拖拽预览图标
    const ext = path.extname(primaryPath).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext)) {
      const fileImg = nativeImage.createFromPath(primaryPath);
      if (!fileImg.isEmpty()) {
        return fileImg.resize({ width: 96 });
      }
    }
  } catch {}

  return nativeImage.createFromDataURL(FALLBACK_DRAG_ICON_DATA_URL);
}

ipcMain.on('fs:startDrag', (event, payload) => {
  try {
    const rawPath = typeof payload === 'string' ? payload : payload?.filePath;
    const rawList = Array.isArray(payload?.filePaths) ? payload.filePaths : rawPath ? [rawPath] : [];
    const validFiles = rawList
      .map((p) => (p ? path.normalize(String(p)) : ''))
      .filter((p) => p && fs.existsSync(p));

    if (validFiles.length === 0) return;

    const primaryFile = validFiles[0];
    const dragIcon = buildNativeDragIcon(primaryFile, payload?.mtimeMs);

    event.sender.startDrag({
      file: primaryFile,
      files: validFiles,
      icon: dragIcon,
    });
  } catch (err) {
    console.error('Native startDrag failed:', err?.message || err);
  }
});

// ==================== 核心修复 1: 安全删除至回收站 + EBUSY/EPERM 句柄占用重试机制 ====================
async function safeTrashItemWithRetry(targetPath, maxRetries = 2) {
  if (!targetPath) return false;
  const normalized = path.normalize(targetPath);
  if (!fs.existsSync(normalized)) return true;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!fs.existsSync(normalized)) return true;
      await shell.trashItem(normalized);
      return true;
    } catch (err) {
      const isLast = attempt === maxRetries;
      if (!isLast) {
        // 遇到 Windows 文件句柄占用 (EBUSY / EPERM / EACCES) 时异步等待句柄释放后重试
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      } else {
        console.warn(`shell.trashItem retry exhausted for ${normalized}:`, err?.message || err);
        try {
          if (fs.existsSync(normalized)) {
            await fsp.rm(normalized, {
              recursive: true,
              force: true,
              maxRetries: 2,
              retryDelay: 250,
            });
          }
          return true;
        } catch (rmErr) {
          console.error('Fallback rm failed:', rmErr?.message || rmErr);
          return false;
        }
      }
    }
  }
  return false;
}

ipcMain.handle('fs:batchTrash', async (_event, targetPaths) => {
  if (!Array.isArray(targetPaths) || targetPaths.length === 0) {
    return { ok: true, count: 0 };
  }

  beginInternalFsOp();
  try {
    const validPaths = targetPaths.filter((p) => p && fs.existsSync(p));
    let deletedCount = 0;
    const CHUNK_SIZE = 3;

    for (let i = 0; i < validPaths.length; i += CHUNK_SIZE) {
      const chunk = validPaths.slice(i, i + CHUNK_SIZE);
      const results = await Promise.all(
        chunk.map((targetPath) => safeTrashItemWithRetry(targetPath, 2))
      );
      deletedCount += results.filter(Boolean).length;
    }

    return { ok: true, count: deletedCount };
  } finally {
    endInternalFsOp();
  }
});

// ==================== 核心修复 2: 零内存流式大文件复制与强制关闭流句柄 (fs:batchImport) ====================
async function streamCopyFileSafe(srcPath, destPath) {
  let readStream = null;
  let writeStream = null;
  try {
    readStream = fs.createReadStream(srcPath, {
      highWaterMark: 4 * 1024 * 1024,
      autoClose: true,
    });
    writeStream = fs.createWriteStream(destPath, {
      autoClose: true,
    });
    await pipeline(readStream, writeStream);
  } finally {
    // 强制销毁读写流句柄，杜绝复制完大视频后残留文件锁导致无法删除
    if (readStream && !readStream.destroyed) {
      try {
        readStream.destroy();
      } catch {}
    }
    if (writeStream && !writeStream.destroyed) {
      try {
        writeStream.destroy();
      } catch {}
    }
  }
}

ipcMain.handle('fs:batchImport', async (_event, payload) => {
  const cfg = readAppConfig();
  const { folderPath, items } = payload || {};
  if (!cfg.vaultRootPath || !folderPath || !Array.isArray(items)) {
    return { ok: false, error: '无效的导入参数' };
  }

  beginInternalFsOp();
  try {
    await fsp.mkdir(folderPath, { recursive: true });
    const metaPath = path.join(folderPath, '.prism_meta.json');
    let meta = { name: path.basename(folderPath), mediaSpecs: {} };
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
        if (!meta.mediaSpecs) meta.mediaSpecs = {};
      } catch {}
    }

    const total = items.length;
    let completed = 0;
    // 严格控制异步并发队列（每次最多并发流式复制 2 个大视频，防止磁盘 I/O 饱和或卡死）
    const CONCURRENCY_LIMIT = 2;

    for (let i = 0; i < total; i += CONCURRENCY_LIMIT) {
      const chunk = items.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.all(
        chunk.map(async (item, idx) => {
          const rawName =
            item.name ||
            (item.sourcePath ? path.basename(item.sourcePath) : `media_${Date.now()}_${idx}.mp4`);
          let safeFileName = sanitizeName(rawName);
          let destPath = path.join(folderPath, safeFileName);

          if (
            fs.existsSync(destPath) &&
            (!item.sourcePath || path.resolve(item.sourcePath) !== path.resolve(destPath))
          ) {
            const ext = path.extname(safeFileName);
            const base = path.basename(safeFileName, ext);
            safeFileName = `${base}_${Date.now().toString().slice(-4)}_${idx}${ext}`;
            destPath = path.join(folderPath, safeFileName);
          }

          if (item.sourcePath && fs.existsSync(item.sourcePath)) {
            if (path.resolve(item.sourcePath) !== path.resolve(destPath)) {
              await streamCopyFileSafe(item.sourcePath, destPath);
            }
          } else if (item.base64Data) {
            const cleanBase64 = item.base64Data.includes(',')
              ? item.base64Data.split(',')[1]
              : item.base64Data;
            await fsp.writeFile(destPath, Buffer.from(cleanBase64, 'base64'));
          }

          meta.mediaSpecs[safeFileName] = {
            dimensions: item.dimensions || '1920 × 1080',
            durationFormatted: item.durationFormatted,
            createdAt: Date.now(),
            tags: item.tags || [],
          };

          completed += 1;
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('fs:importProgress', {
              completed,
              total,
              currentFile: safeFileName,
            });
          }
        })
      );
    }

    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    return { ok: true, count: total };
  } finally {
    endInternalFsOp();
  }
});

// ==================== 核心修复 3: 媒体文件物理重命名与跨目录移动 (含 EBUSY 重试) ====================
ipcMain.handle('fs:renameMedia', async (_event, { filePath, newName }) => {
  if (!filePath || !fs.existsSync(filePath) || !newName) {
    return { ok: false, error: '源文件或新名称无效' };
  }

  beginInternalFsOp();
  try {
    const dir = path.dirname(filePath);
    const oldFileName = path.basename(filePath);
    const origExt = path.extname(oldFileName);
    let safeNewName = sanitizeName(newName);
    if (!path.extname(safeNewName) && origExt) {
      safeNewName += origExt;
    }

    const newFilePath = path.join(dir, safeNewName);
    if (path.resolve(filePath) === path.resolve(newFilePath)) {
      return { ok: true, newFilePath: filePath, newName: oldFileName };
    }
    if (fs.existsSync(newFilePath)) {
      return { ok: false, error: '目标文件名已存在' };
    }

    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        await fsp.rename(filePath, newFilePath);
        break;
      } catch (err) {
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }

    // 同步更新 .prism_meta.json
    const metaPath = path.join(dir, '.prism_meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
        if (meta.mediaSpecs && meta.mediaSpecs[oldFileName]) {
          meta.mediaSpecs[safeNewName] = meta.mediaSpecs[oldFileName];
          delete meta.mediaSpecs[oldFileName];
        }
        await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      } catch {}
    }

    return { ok: true, newFilePath, newName: safeNewName };
  } finally {
    endInternalFsOp();
  }
});

ipcMain.handle('fs:moveMedia', async (_event, { filePaths, targetFolderPath }) => {
  if (!Array.isArray(filePaths) || !targetFolderPath) {
    return { ok: false, error: '移动参数无效' };
  }

  beginInternalFsOp();
  try {
    await fsp.mkdir(targetFolderPath, { recursive: true });
    const targetMetaPath = path.join(targetFolderPath, '.prism_meta.json');
    let targetMeta = { name: path.basename(targetFolderPath), mediaSpecs: {} };
    if (fs.existsSync(targetMetaPath)) {
      try {
        targetMeta = JSON.parse(await fsp.readFile(targetMetaPath, 'utf-8'));
        if (!targetMeta.mediaSpecs) targetMeta.mediaSpecs = {};
      } catch {}
    }

    const CHUNK_SIZE = 3;
    for (let i = 0; i < filePaths.length; i += CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (srcPath, idx) => {
          if (!srcPath || !fs.existsSync(srcPath)) return;
          const srcDir = path.dirname(srcPath);
          if (path.resolve(srcDir) === path.resolve(targetFolderPath)) return;

          const origName = path.basename(srcPath);
          let destName = origName;
          let destPath = path.join(targetFolderPath, destName);
          if (fs.existsSync(destPath)) {
            const ext = path.extname(origName);
            const base = path.basename(origName, ext);
            destName = `${base}_${Date.now().toString().slice(-4)}_${idx}${ext}`;
            destPath = path.join(targetFolderPath, destName);
          }

          for (let attempt = 0; attempt <= 2; attempt++) {
            try {
              await fsp.rename(srcPath, destPath);
              break;
            } catch (err) {
              if (attempt === 2) {
                // 跨磁盘分区移动时 rename 会报 EXDEV，回退为流式复制 + 安全移除
                await streamCopyFileSafe(srcPath, destPath);
                await safeTrashItemWithRetry(srcPath, 2);
              } else {
                await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
              }
            }
          }

          targetMeta.mediaSpecs[destName] = {
            dimensions: '1920 × 1080',
            createdAt: Date.now(),
          };
        })
      );
    }

    await fsp.writeFile(targetMetaPath, JSON.stringify(targetMeta, null, 2), 'utf-8');
    return { ok: true };
  } finally {
    endInternalFsOp();
  }
});

// ==================== 核心修复 4: 批量重命名物理媒体文件 (两阶段防碰撞 BaseName_01, BaseName_02...) ====================
ipcMain.handle('fs:batchRenameMedia', async (_event, { filePaths, baseName }) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0 || !baseName) {
    return { ok: false, error: '批量重命名参数无效' };
  }

  beginInternalFsOp();
  try {
    const rawBase = sanitizeName(String(baseName).trim()).replace(/\.[^/.]+$/, '') || '未命名';
    const validPaths = filePaths.filter((p) => p && fs.existsSync(p));
    // < 100 项采用两位补零 (01, 02)，>= 100 项自动采用三位或更多位补零 (001, 002)
    const padLen = validPaths.length >= 100 ? Math.max(3, String(validPaths.length).length) : 2;
    const metaUpdatesByDir = new Map();
    const stagedList = [];
    const batchSessionToken = `_prism_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_`;

    // 第一阶段：先重命名为临时中转文件名，彻底避免选中文件内部新旧名称互相冲突
    for (let i = 0; i < validPaths.length; i++) {
      const srcPath = validPaths[i];
      if (!fs.existsSync(srcPath)) continue;
      const dir = path.dirname(srcPath);
      const oldFileName = path.basename(srcPath);
      const origExt = path.extname(oldFileName);
      const tempFileName = `${batchSessionToken}${i}${origExt}`;
      const tempFilePath = path.join(dir, tempFileName);

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          await fsp.rename(srcPath, tempFilePath);
          stagedList.push({
            index: i,
            dir,
            oldFileName,
            origExt,
            tempFilePath,
          });
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }

    // 第二阶段：按顺序从临时文件重命名为最终序号文件 (Name_01.ext, Name_02.ext...)
    let renamedCount = 0;
    for (const item of stagedList) {
      const { index, dir, oldFileName, origExt, tempFilePath } = item;
      const seqStr = String(index + 1).padStart(padLen, '0');
      let targetFileName = `${rawBase}_${seqStr}${origExt}`;
      let targetFilePath = path.join(dir, targetFileName);

      let suffixTry = 1;
      while (fs.existsSync(targetFilePath)) {
        targetFileName = `${rawBase}_${seqStr}_${suffixTry}${origExt}`;
        targetFilePath = path.join(dir, targetFileName);
        suffixTry += 1;
      }

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          await fsp.rename(tempFilePath, targetFilePath);
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }

      if (!metaUpdatesByDir.has(dir)) {
        metaUpdatesByDir.set(dir, []);
      }
      metaUpdatesByDir.get(dir).push({ oldFileName, targetFileName });
      renamedCount += 1;
    }

    for (const [dir, changes] of metaUpdatesByDir.entries()) {
      const metaPath = path.join(dir, '.prism_meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
          if (meta.mediaSpecs) {
            const nextSpecs = { ...meta.mediaSpecs };
            for (const { oldFileName, targetFileName } of changes) {
              if (meta.mediaSpecs[oldFileName]) {
                nextSpecs[targetFileName] = meta.mediaSpecs[oldFileName];
                if (oldFileName !== targetFileName) {
                  delete nextSpecs[oldFileName];
                }
              }
            }
            meta.mediaSpecs = nextSpecs;
            await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
          }
        } catch {}
      }
    }

    return { ok: true, count: renamedCount };
  } catch (err) {
    return { ok: false, error: err?.message || '批量重命名失败' };
  } finally {
    endInternalFsOp();
  }
});

// ==================== 核心优化 5: 主进程持久化磁盘缩略图缓存 & 自定义缓存目录 (保护 C 盘) ====================
function getThumbnailsDir() {
  const cfg = readAppConfig();
  const configuredDir = cfg.thumbnailCacheDir || getDefaultThumbnailCacheDir();
  try {
    fs.mkdirSync(configuredDir, { recursive: true });
    return configuredDir;
  } catch {
    const fallback = getDefaultThumbnailCacheDir();
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function getThumbnailCacheStats(dirPath) {
  let count = 0;
  let bytes = 0;
  try {
    if (dirPath && fs.existsSync(dirPath)) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jpg')) {
          count += 1;
          try {
            bytes += fs.statSync(path.join(dirPath, e.name)).size;
          } catch {}
        }
      }
    }
  } catch {}
  return { count, bytes };
}

async function migrateAndSwitchThumbnailCacheDir(newDirRaw) {
  const resolvedNewDir = path.resolve(String(newDirRaw || '').trim() || getDefaultThumbnailCacheDir());
  const oldDir = getThumbnailsDir();
  await fsp.mkdir(resolvedNewDir, { recursive: true });

  let migratedCount = 0;
  if (oldDir && fs.existsSync(oldDir) && path.resolve(oldDir) !== resolvedNewDir) {
    try {
      const entries = await fsp.readdir(oldDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.jpg') && !entry.name.endsWith('.json')) continue;
        const srcFile = path.join(oldDir, entry.name);
        const destFile = path.join(resolvedNewDir, entry.name);
        try {
          if (!fs.existsSync(destFile)) {
            await streamCopyFileSafe(srcFile, destFile);
          }
          await fsp.unlink(srcFile);
          if (entry.name.endsWith('.jpg')) migratedCount += 1;
        } catch {}
      }
    } catch {}
  }

  const cfg = readAppConfig();
  cfg.thumbnailCacheDir = resolvedNewDir;
  writeAppConfig(cfg);

  const stats = getThumbnailCacheStats(resolvedNewDir);
  return {
    ok: true,
    thumbnailCacheDir: resolvedNewDir,
    migratedCount,
    thumbnailCacheCount: stats.count,
    thumbnailCacheBytes: stats.bytes,
  };
}

ipcMain.handle('config:selectThumbnailCacheDir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择缩略图缓存目录 (建议选择 D 盘或 E 盘等大容量分区)',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  const chosenDir = result.filePaths[0];
  return await migrateAndSwitchThumbnailCacheDir(chosenDir);
});

ipcMain.handle('config:setThumbnailCacheDir', async (_event, newDirPath) => {
  if (!newDirPath || !String(newDirPath).trim()) {
    return { ok: false, error: '无效的缓存目录路径' };
  }
  try {
    return await migrateAndSwitchThumbnailCacheDir(String(newDirPath).trim());
  } catch (err) {
    return { ok: false, error: err?.message || '无法设置或迁移缩略图缓存目录' };
  }
});

ipcMain.handle('fs:clearThumbnailCache', async () => {
  const dir = getThumbnailsDir();
  let deleted = 0;
  try {
    if (dir && fs.existsSync(dir)) {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && (e.name.endsWith('.jpg') || e.name.endsWith('.json'))) {
          try {
            await fsp.unlink(path.join(dir, e.name));
            if (e.name.endsWith('.jpg')) deleted += 1;
          } catch {}
        }
      }
    }
  } catch {}
  const stats = getThumbnailCacheStats(dir);
  return {
    ok: true,
    deletedCount: deleted,
    thumbnailCacheCount: stats.count,
    thumbnailCacheBytes: stats.bytes,
  };
});

function computeThumbnailHash(filePath, mtimeMs) {
  const normalized = path.resolve(String(filePath || ''));
  const mtime = Math.floor(Number(mtimeMs) || 0);
  return crypto.createHash('md5').update(`${normalized}_${mtime}`).digest('hex');
}

function toLocalFileUrl(filePath, mtimeMs) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/').map((seg, idx) => {
    if (idx === 0 && /^[a-zA-Z]:$/.test(seg)) return seg;
    return encodeURIComponent(seg);
  });
  const encodedPath = parts.join('/');
  const prefix = encodedPath.startsWith('/') ? 'file://' : 'file:///';
  const query = mtimeMs ? `?t=${Math.floor(mtimeMs)}` : '';
  return `${prefix}${encodedPath}${query}`;
}

function formatBytesSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function checkIsMediaFile(fileName) {
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

ipcMain.handle('fs:getThumbnail', async (_event, { filePath, mtimeMs }) => {
  if (!filePath) return { hit: false };
  try {
    let effectiveMtime = mtimeMs;
    if (!effectiveMtime && fs.existsSync(filePath)) {
      effectiveMtime = fs.statSync(filePath).mtimeMs;
    }
    const hash = computeThumbnailHash(filePath, effectiveMtime);
    const thumbDir = getThumbnailsDir();
    const jpgPath = path.join(thumbDir, `${hash}.jpg`);
    if (fs.existsSync(jpgPath)) {
      let meta = {};
      const jsonPath = path.join(thumbDir, `${hash}.json`);
      if (fs.existsSync(jsonPath)) {
        try {
          meta = JSON.parse(await fsp.readFile(jsonPath, 'utf-8'));
        } catch {}
      }
      return {
        hit: true,
        thumbUrl: toLocalFileUrl(jpgPath),
        durationFormatted: meta.durationFormatted,
        dimensions: meta.dimensions,
      };
    }
  } catch {}
  return { hit: false };
});

ipcMain.handle('fs:saveThumbnail', async (_event, { filePath, mtimeMs, base64Jpeg, durationFormatted, dimensions }) => {
  if (!filePath || !base64Jpeg) return { ok: false };
  try {
    let effectiveMtime = mtimeMs;
    if (!effectiveMtime && fs.existsSync(filePath)) {
      effectiveMtime = fs.statSync(filePath).mtimeMs;
    }
    const hash = computeThumbnailHash(filePath, effectiveMtime);
    const thumbDir = getThumbnailsDir();
    const jpgPath = path.join(thumbDir, `${hash}.jpg`);
    const cleanBase64 = base64Jpeg.includes(',') ? base64Jpeg.split(',')[1] : base64Jpeg;
    await fsp.writeFile(jpgPath, Buffer.from(cleanBase64, 'base64'));

    if (durationFormatted || dimensions) {
      const jsonPath = path.join(thumbDir, `${hash}.json`);
      await fsp.writeFile(
        jsonPath,
        JSON.stringify({ durationFormatted, dimensions }, null, 0),
        'utf-8'
      );
    }

    return {
      ok: true,
      thumbUrl: toLocalFileUrl(jpgPath),
    };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
});

// ==================== 核心优化 6: IPC 数据分片流式扫描 (50 条/批，防主进程与渲染进程阻塞) ====================
ipcMain.handle('fs:scanVaultChunked', async (event, { scanId } = {}) => {
  const cfg = readAppConfig();
  const rootPath = cfg.vaultRootPath;
  if (!rootPath || !fs.existsSync(rootPath)) {
    return {
      ok: true,
      categories: DEFAULT_CATEGORIES,
      folders: [],
      totalMedia: 0,
      vaultRootPath: '',
    };
  }

  ensureVaultStructure(rootPath);
  const categories = readVaultCategories(rootPath);
  const folders = [];
  const allMedia = [];
  const thumbDir = getThumbnailsDir();

  for (const cat of categories) {
    const secId = cat.id;
    const secDirName = cat.dirName || cat.id;
    const secPath = path.join(rootPath, secDirName);
    if (!fs.existsSync(secPath)) {
      fs.mkdirSync(secPath, { recursive: true });
    }

    let dirEntries = [];
    try {
      dirEntries = await fsp.readdir(secPath, { withFileTypes: true });
    } catch {}

    for (const entry of dirEntries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const folderPath = path.join(secPath, entry.name);
      const metaPath = path.join(folderPath, '.prism_meta.json');
      let stat;
      try {
        stat = await fsp.stat(folderPath);
      } catch {
        continue;
      }

      let meta = {
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
          const parsed = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
          meta = { ...meta, ...parsed };
        } catch {}
      } else {
        try {
          await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        } catch {}
      }

      let effectiveCoverUrl = meta.coverUrl || '';
      if (meta.coverFileName) {
        const coverPhysicalPath = path.join(folderPath, meta.coverFileName);
        if (fs.existsSync(coverPhysicalPath)) {
          try {
            const coverStat = await fsp.stat(coverPhysicalPath);
            effectiveCoverUrl = toLocalFileUrl(coverPhysicalPath, coverStat.mtimeMs);
          } catch {}
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

      let files = [];
      try {
        files = await fsp.readdir(folderPath, { withFileTypes: true });
      } catch {}

      for (const f of files) {
        if (!f.isFile()) continue;
        const check = checkIsMediaFile(f.name);
        if (!check.isMedia) continue;

        const fullFilePath = path.join(folderPath, f.name);
        let fStat;
        try {
          fStat = await fsp.stat(fullFilePath);
        } catch {
          continue;
        }

        const spec = (meta.mediaSpecs && meta.mediaSpecs[f.name]) || {};
        const mtimeMs = Math.floor(fStat.mtimeMs || Date.now());
        let thumbUrl = undefined;
        let cachedDuration = spec.durationFormatted;
        let cachedDimensions = spec.dimensions;

        if (check.type === 'video') {
          const hash = computeThumbnailHash(fullFilePath, mtimeMs);
          const jpgPath = path.join(thumbDir, `${hash}.jpg`);
          if (fs.existsSync(jpgPath)) {
            thumbUrl = toLocalFileUrl(jpgPath);
            const jsonPath = path.join(thumbDir, `${hash}.json`);
            if (fs.existsSync(jsonPath)) {
              try {
                const sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                if (sidecar.durationFormatted) cachedDuration = sidecar.durationFormatted;
                if (sidecar.dimensions) cachedDimensions = sidecar.dimensions;
              } catch {}
            }
          }
        }

        allMedia.push({
          id: `${folderId}::${f.name}`,
          folderId,
          sectionId: secId,
          name: f.name,
          filePath: fullFilePath,
          type: check.type,
          url: toLocalFileUrl(fullFilePath, mtimeMs),
          thumbUrl,
          mtimeMs,
          size: fStat.size,
          sizeFormatted: formatBytesSize(fStat.size),
          dimensions: cachedDimensions || (check.type === 'video' ? '1920 × 1080' : '高清原图'),
          durationFormatted: cachedDuration || (check.type === 'video' ? '00:15' : undefined),
          createdAt: spec.createdAt || mtimeMs,
          tags: spec.tags || [],
        });
      }
    }
  }

  // 分批推送媒体列表 (每批 50 条)，避免一次性序列化巨型 JSON 阻塞主进程或渲染进程
  const CHUNK_SIZE = 50;
  for (let i = 0; i < allMedia.length; i += CHUNK_SIZE) {
    const chunk = allMedia.slice(i, i + CHUNK_SIZE);
    if (!event.sender.isDestroyed()) {
      event.sender.send('vault:mediaChunk', {
        scanId,
        chunk,
        isFirst: i === 0,
        isDone: i + CHUNK_SIZE >= allMedia.length,
        total: allMedia.length,
      });
    }
    if (i + CHUNK_SIZE < allMedia.length) {
      await new Promise((r) => setImmediate(r));
    }
  }

  return {
    ok: true,
    categories,
    folders,
    totalMedia: allMedia.length,
    vaultRootPath: rootPath,
  };
});

app.on('window-all-closed', () => {
  if (vaultWatcher) {
    try {
      vaultWatcher.close();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
