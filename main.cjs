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

function readAppConfig() {
  const cfgPath = getAppConfigPath();
  try {
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const sec = parsed.security || {};
      return {
        vaultRootPath: parsed.vaultRootPath || '',
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

// ==================== 实时磁盘热加载监听 (fs.watch + 防抖 + 内部操作静默锁) ====================
function setupVaultWatcher(rootPath) {
  if (vaultWatcher) {
    try {
      vaultWatcher.close();
    } catch {}
    vaultWatcher = null;
  }

  if (!rootPath || !fs.existsSync(rootPath)) return;

  try {
    vaultWatcher = fs.watch(rootPath, { recursive: true }, (_eventType, filename) => {
      if (internalFsLockCount > 0) return;
      if (filename) {
        const base = path.basename(String(filename));
        if (
          base.startsWith('.prism_') ||
          String(filename).includes('.prism_trash') ||
          base === 'Thumbs.db' ||
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
      }, 450);
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
  if (cfg.vaultRootPath) {
    ensureVaultStructure(cfg.vaultRootPath);
    setupVaultWatcher(cfg.vaultRootPath);
  }
  return {
    ...cfg,
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
