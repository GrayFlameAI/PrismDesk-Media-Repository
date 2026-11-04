import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const fsp = fs.promises;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const CONFIG_FILE = path.join(__dirname, '.prismdesk_config.json');
const DEFAULT_VAULT_ROOT = path.join(__dirname, 'PrismDeskVault');

const DEFAULT_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update('123456_prismdesk_salt_2026')
  .digest('hex');

let vaultWatchVersion = Date.now();
let serverVaultWatcher: fs.FSWatcher | null = null;
let serverWatchDebounce: NodeJS.Timeout | null = null;

function setupServerVaultWatcher(rootPath: string) {
  if (serverVaultWatcher) {
    try {
      serverVaultWatcher.close();
    } catch {}
    serverVaultWatcher = null;
  }
  if (!rootPath || !fs.existsSync(rootPath)) return;
  try {
    serverVaultWatcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
      if (filename) {
        const str = String(filename);
        if (str.includes('.prism_meta.json') || str.includes('.prism_categories.json') || str.includes('.prism_trash')) {
          return;
        }
      }
      if (serverWatchDebounce) clearTimeout(serverWatchDebounce);
      serverWatchDebounce = setTimeout(() => {
        vaultWatchVersion = Date.now();
      }, 350);
    });
  } catch {}
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

const DEFAULT_INITIAL_FOLDERS = [
  { id: 'f-mat-1', sectionId: 'materials', dirName: '纹理背景与环境材质', name: '纹理背景与环境材质', description: '高质感背景、光影与渐变素材' },
  { id: 'f-mat-2', sectionId: 'materials', dirName: '人物肖像与主体抠图', name: '人物肖像与主体抠图', description: '无损透明底、人像模特与手势参考' },
  { id: 'f-fin-1', sectionId: 'finished', dirName: '2026 商业视觉发布系列', name: '2026 商业视觉发布系列', description: '最终交付商业全套宣传主图' },
  { id: 'f-fin-2', sectionId: 'finished', dirName: '电商大促活动 KV 定稿', name: '电商大促活动 KV 定稿', description: '首页焦点图与各端适配版面' },
  { id: 'f-ups-1', sectionId: 'upscaled', dirName: '8K 超清细节增强图', name: '8K 超清细节增强图', description: 'Topaz / AI 细节放大原图' },
  { id: 'f-vid-1', sectionId: 'video_assets', dirName: '实拍镜头与空镜素材库', name: '实拍镜头与空镜素材库', description: '4K 运镜实拍、转场特写与 B-Roll 空镜' },
  { id: 'f-gen-1', sectionId: 'generated_videos', dirName: 'AI 生成动态视频与特效', name: 'AI 生成动态视频与特效', description: 'Sora / Runway / Veo 生成视频素材片段' },
  { id: 'f-mas-1', sectionId: 'masterpieces', dirName: '个人年度代表作精选集', name: '个人年度代表作精选集', description: '最终定稿视频与最具影响力核心成品' },
];

interface AppConfig {
  vaultRootPath: string;
  security: {
    isPasswordSet: boolean;
    passwordHash: string;
    hint: string;
    isLocked: boolean;
  };
}

function readConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      const sec = raw.security || {};
      return {
        vaultRootPath: raw.vaultRootPath || '',
        security: {
          isPasswordSet: true,
          passwordHash: sec.passwordHash || DEFAULT_PASSWORD_HASH,
          hint: sec.hint !== undefined ? sec.hint : '初始密码 123456',
          isLocked: true,
        },
      };
    }
  } catch (err) {
    console.error('Error reading config:', err);
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

function writeConfig(cfg: AppConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function sanitizeDirName(name: string): string {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || '未命名文件夹';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getCategoriesFilePath(rootPath: string) {
  return path.join(rootPath, '.prism_categories.json');
}

function readCategories(rootPath: string): any[] {
  if (!rootPath) return DEFAULT_CATEGORIES;
  const catFile = getCategoriesFilePath(rootPath);
  if (fs.existsSync(catFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(catFile, 'utf-8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  fs.mkdirSync(rootPath, { recursive: true });
  fs.writeFileSync(catFile, JSON.stringify(DEFAULT_CATEGORIES, null, 2), 'utf-8');
  return DEFAULT_CATEGORIES;
}

function writeCategories(rootPath: string, categories: any[]) {
  if (!rootPath) return;
  fs.mkdirSync(rootPath, { recursive: true });
  fs.writeFileSync(getCategoriesFilePath(rootPath), JSON.stringify(categories, null, 2), 'utf-8');
}

// 安全移入回收站隔离目录（模拟 shell.trashItem，绝不直接 unlink / rmSync 销毁源文件）
async function moveItemToSafeTrash(rootPath: string, targetPath: string) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  const trashRoot = path.join(rootPath, '.prism_trash');
  await fsp.mkdir(trashRoot, { recursive: true });
  const base = path.basename(targetPath);
  const dest = path.join(trashRoot, `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${base}`);
  await fsp.rename(targetPath, dest);
}

function ensureVaultDirectories(rootPath: string) {
  if (!rootPath) return;
  fs.mkdirSync(rootPath, { recursive: true });
  const categories = readCategories(rootPath);
  let totalExistingFolders = 0;

  for (const cat of categories) {
    const secDir = cat.dirName || cat.id;
    const secPath = path.join(rootPath, secDir);
    fs.mkdirSync(secPath, { recursive: true });
    const entries = fs.readdirSync(secPath, { withFileTypes: true });
    totalExistingFolders += entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length;
  }

  if (totalExistingFolders === 0) {
    for (const def of DEFAULT_INITIAL_FOLDERS) {
      const cat = categories.find((c) => c.id === def.sectionId);
      if (!cat) continue;
      const secDir = cat.dirName || cat.id;
      const folderPath = path.join(rootPath, secDir, def.dirName);
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

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
  };
  return map[ext] || 'application/octet-stream';
}

function isMediaFile(fileName: string): { isMedia: boolean; type: 'image' | 'video' } {
  if (fileName.startsWith('.prism_')) return { isMedia: false, type: 'image' };
  const ext = path.extname(fileName).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) {
    return { isMedia: true, type: 'image' };
  }
  if (['.mp4', '.webm', '.mov', '.mkv'].includes(ext)) {
    return { isMedia: true, type: 'video' };
  }
  return { isMedia: false, type: 'image' };
}

function scanVault(rootPath: string) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return { categories: DEFAULT_CATEGORIES, folders: [], media: [] };
  }

  const categories = readCategories(rootPath);
  const folders: any[] = [];
  const media: any[] = [];

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
          effectiveCoverUrl = `/api/fs/stream?path=${encodeURIComponent(coverPhysicalPath)}&t=${Math.floor(coverStat.mtimeMs)}`;
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
        const spec = (meta.mediaSpecs && meta.mediaSpecs[f.name]) || {};

        media.push({
          id: `${folderId}::${f.name}`,
          folderId,
          sectionId: secId,
          name: f.name,
          filePath: fullFilePath,
          type: check.type,
          url: `/api/fs/stream?path=${encodeURIComponent(fullFilePath)}&t=${Math.floor(fStat.mtimeMs)}`,
          size: fStat.size,
          sizeFormatted: formatFileSize(fStat.size),
          dimensions: spec.dimensions || (check.type === 'video' ? '1920 × 1080' : '高清原图'),
          durationFormatted: spec.durationFormatted || (check.type === 'video' ? '00:15' : undefined),
          createdAt: spec.createdAt || fStat.mtimeMs || Date.now(),
          tags: spec.tags || [],
        });
      }
    }
  }

  return { categories, folders, media };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ extended: true, limit: '200mb' }));

  app.get('/api/fs/config', (_req, res) => {
    const cfg = readConfig();
    if (cfg.vaultRootPath) {
      setupServerVaultWatcher(cfg.vaultRootPath);
    }
    res.json({
      ...cfg,
      defaultSuggestedPath: DEFAULT_VAULT_ROOT,
      homedir: os.homedir(),
    });
  });

  app.get('/api/fs/watch-version', (_req, res) => {
    res.json({ version: vaultWatchVersion });
  });

  app.post('/api/fs/config/root', (req, res) => {
    try {
      const rawPath = (req.body.vaultRootPath || '').trim() || DEFAULT_VAULT_ROOT;
      const resolvedPath = path.resolve(rawPath);
      ensureVaultDirectories(resolvedPath);
      const cfg = readConfig();
      cfg.vaultRootPath = resolvedPath;
      writeConfig(cfg);
      setupServerVaultWatcher(resolvedPath);
      res.json({ ok: true, vaultRootPath: resolvedPath });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || '无法创建或访问该本地路径' });
    }
  });

  app.post('/api/fs/config/security', (req, res) => {
    const cfg = readConfig();
    const sec = req.body.security || {};
    cfg.security = {
      isPasswordSet: true,
      passwordHash: sec.passwordHash || DEFAULT_PASSWORD_HASH,
      hint: sec.hint !== undefined ? sec.hint : '初始密码 123456',
      isLocked: false,
    };
    writeConfig(cfg);
    res.json({ ok: true, security: cfg.security });
  });

  app.get('/api/fs/scan', (_req, res) => {
    const cfg = readConfig();
    if (!cfg.vaultRootPath) {
      return res.json({ categories: DEFAULT_CATEGORIES, folders: [], media: [], vaultRootPath: '' });
    }
    ensureVaultDirectories(cfg.vaultRootPath);
    const data = scanVault(cfg.vaultRootPath);
    res.json({ ...data, vaultRootPath: cfg.vaultRootPath });
  });

  // ==================== 动态媒体目录 (Categories) 增删改接口 ====================
  app.post('/api/fs/category/create', async (req, res) => {
    try {
      const cfg = readConfig();
      if (!cfg.vaultRootPath) return res.status(400).json({ ok: false, error: '未设置根目录' });

      const { name, description, iconName } = req.body;
      const safeName = (name || '').trim();
      if (!safeName) return res.status(400).json({ ok: false, error: '目录名称不能为空' });

      const categories = readCategories(cfg.vaultRootPath);
      let dirName = sanitizeDirName(safeName);
      if (fs.existsSync(path.join(cfg.vaultRootPath, dirName))) {
        dirName = `${dirName}_${Date.now().toString().slice(-4)}`;
      }

      const newCat = {
        id: `cat-${Date.now()}`,
        name: safeName,
        enName: safeName,
        dirName,
        description: (description || '').trim() || `${safeName} 专属媒体归档区域`,
        iconName: iconName || 'Folder',
        badgeColor: 'text-sky-700 bg-sky-50 border-sky-200',
        accentColor: '#0ea5e9',
        mediaCategory: 'all',
        isBuiltin: false,
      };

      const catPhysicalPath = path.join(cfg.vaultRootPath, dirName);
      await fsp.mkdir(catPhysicalPath, { recursive: true });
      // 默认为新媒体目录创建一个初始子文件夹，方便直接存放文件
      const defaultSub = path.join(catPhysicalPath, '默认素材夹');
      await fsp.mkdir(defaultSub, { recursive: true });
      await fsp.writeFile(
        path.join(defaultSub, '.prism_meta.json'),
        JSON.stringify({ name: '默认素材夹', description: '新建分类默认归档文件夹', createdAt: Date.now(), mediaSpecs: {} }, null, 2),
        'utf-8'
      );

      categories.push(newCat);
      writeCategories(cfg.vaultRootPath, categories);

      res.json({ ok: true, category: newCat, categories });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/fs/category/rename', async (req, res) => {
    try {
      const cfg = readConfig();
      if (!cfg.vaultRootPath) return res.status(400).json({ ok: false, error: '未设置根目录' });

      const { id, newName } = req.body;
      const safeName = (newName || '').trim();
      if (!id || !safeName) return res.status(400).json({ ok: false, error: '参数无效' });

      const categories = readCategories(cfg.vaultRootPath);
      const idx = categories.findIndex((c) => c.id === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: '未找到该分类' });

      const cat = categories[idx];
      const oldDirName = cat.dirName || cat.id;
      const newDirName = sanitizeDirName(safeName);
      const oldPath = path.join(cfg.vaultRootPath, oldDirName);
      const newPath = path.join(cfg.vaultRootPath, newDirName);

      if (oldPath !== newPath && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
        await fsp.rename(oldPath, newPath);
        cat.dirName = newDirName;
      }

      cat.name = safeName;
      cat.enName = safeName;
      categories[idx] = cat;
      writeCategories(cfg.vaultRootPath, categories);

      res.json({ ok: true, category: cat, categories });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/fs/category/delete', async (req, res) => {
    try {
      const cfg = readConfig();
      if (!cfg.vaultRootPath) return res.status(400).json({ ok: false, error: '未设置根目录' });

      const { id } = req.body;
      const categories = readCategories(cfg.vaultRootPath);
      const target = categories.find((c) => c.id === id);
      if (!target) return res.status(404).json({ ok: false, error: '未找到该分类' });

      const dirName = target.dirName || target.id;
      const physicalPath = path.join(cfg.vaultRootPath, dirName);
      if (fs.existsSync(physicalPath)) {
        // 安全移入回收站隔离区，禁止直接 rmSync
        await moveItemToSafeTrash(cfg.vaultRootPath, physicalPath);
      }

      const nextCategories = categories.filter((c) => c.id !== id);
      writeCategories(cfg.vaultRootPath, nextCategories);

      res.json({ ok: true, categories: nextCategories });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 5. 新建 / 编辑物理子文件夹并写入 .prism_meta.json 永久保存封面
  app.post('/api/fs/folder/save', (req, res) => {
    try {
      const cfg = readConfig();
      if (!cfg.vaultRootPath) {
        return res.status(400).json({ ok: false, error: '未设置物理根目录' });
      }

      const {
        existingFolderId,
        sectionId,
        name,
        description,
        coverDataUrl,
        coverSourceFilePath,
        coverUrl,
        clearCover,
      } = req.body;

      const categories = readCategories(cfg.vaultRootPath);
      const cat = categories.find((c) => c.id === sectionId);
      const secDirName = cat ? cat.dirName || cat.id : sectionId;

      const safeDirName = sanitizeDirName(name);
      const secPath = path.join(cfg.vaultRootPath, secDirName);
      fs.mkdirSync(secPath, { recursive: true });

      let targetFolderPath = path.join(secPath, safeDirName);
      let existingMeta: any = {
        name: name.trim(),
        description: description || '',
        coverFileName: '',
        coverUrl: '',
        createdAt: Date.now(),
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

      if (clearCover) {
        existingMeta.coverFileName = '';
        existingMeta.coverUrl = '';
      }

      if (coverDataUrl && coverDataUrl.startsWith('data:image/')) {
        const matches = coverDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'png' ? '.png' : matches[1] === 'webp' ? '.webp' : '.jpg';
          const coverFileName = `.prism_cover${ext}`;
          const coverDest = path.join(targetFolderPath, coverFileName);
          fs.writeFileSync(coverDest, Buffer.from(matches[2], 'base64'));
          existingMeta.coverFileName = coverFileName;
          existingMeta.coverUrl = '';
        }
      } else if (coverSourceFilePath && fs.existsSync(coverSourceFilePath)) {
        const ext = path.extname(coverSourceFilePath) || '.jpg';
        const coverFileName = `.prism_cover${ext}`;
        const coverDest = path.join(targetFolderPath, coverFileName);
        if (path.resolve(coverSourceFilePath) !== path.resolve(coverDest)) {
          fs.copyFileSync(coverSourceFilePath, coverDest);
        }
        existingMeta.coverFileName = coverFileName;
        existingMeta.coverUrl = '';
      } else if (typeof coverUrl === 'string' && coverUrl.trim()) {
        if (coverUrl.includes('/api/fs/stream?path=')) {
          const urlObj = new URL(coverUrl, 'http://localhost');
          const extractedPath = urlObj.searchParams.get('path');
          if (extractedPath && fs.existsSync(extractedPath)) {
            const ext = path.extname(extractedPath) || '.jpg';
            const coverFileName = `.prism_cover${ext}`;
            const coverDest = path.join(targetFolderPath, coverFileName);
            if (path.resolve(extractedPath) !== path.resolve(coverDest)) {
              fs.copyFileSync(extractedPath, coverDest);
            }
            existingMeta.coverFileName = coverFileName;
            existingMeta.coverUrl = '';
          }
        } else {
          existingMeta.coverUrl = coverUrl.trim();
        }
      }

      existingMeta.name = name.trim();
      existingMeta.description = (description || '').trim();

      const metaPath = path.join(targetFolderPath, '.prism_meta.json');
      fs.writeFileSync(metaPath, JSON.stringify(existingMeta, null, 2), 'utf-8');

      res.json({ ok: true, folderId: `${sectionId}::${path.basename(targetFolderPath)}` });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 6. 安全移入回收站删除子文件夹
  app.post('/api/fs/folder/delete', async (req, res) => {
    try {
      const cfg = readConfig();
      const { folderId } = req.body;
      if (!cfg.vaultRootPath || !folderId || !folderId.includes('::')) {
        return res.status(400).json({ ok: false, error: '无效的文件夹参数' });
      }
      const [secId, dirName] = folderId.split('::');
      const categories = readCategories(cfg.vaultRootPath);
      const cat = categories.find((c) => c.id === secId);
      const secDirName = cat ? cat.dirName || cat.id : secId;
      const targetPath = path.join(cfg.vaultRootPath, secDirName, dirName);
      if (fs.existsSync(targetPath)) {
        await moveItemToSafeTrash(cfg.vaultRootPath, targetPath);
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 7. 批量防卡顿异步导入 (Promise.all Chunking)
  app.post('/api/fs/media/import', async (req, res) => {
    try {
      const cfg = readConfig();
      const { folderId, items } = req.body;
      if (!cfg.vaultRootPath || !folderId || !folderId.includes('::')) {
        return res.status(400).json({ ok: false, error: '目标文件夹无效' });
      }

      const [secId, dirName] = folderId.split('::');
      const categories = readCategories(cfg.vaultRootPath);
      const cat = categories.find((c) => c.id === secId);
      const secDirName = cat ? cat.dirName || cat.id : secId;
      const folderPath = path.join(cfg.vaultRootPath, secDirName, dirName);
      await fsp.mkdir(folderPath, { recursive: true });

      const metaPath = path.join(folderPath, '.prism_meta.json');
      let meta: any = { name: dirName, mediaSpecs: {} };
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
          if (!meta.mediaSpecs) meta.mediaSpecs = {};
        } catch {}
      }

      const itemList: any[] = items || [];
      const CHUNK_SIZE = 8;

      for (let i = 0; i < itemList.length; i += CHUNK_SIZE) {
        const chunk = itemList.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (item, idx) => {
            let safeFileName = sanitizeDirName(item.name || `media_${Date.now()}_${idx}.jpg`);
            let destPath = path.join(folderPath, safeFileName);

            if (fs.existsSync(destPath) && (!item.sourcePath || path.resolve(item.sourcePath) !== path.resolve(destPath))) {
              const ext = path.extname(safeFileName);
              const base = path.basename(safeFileName, ext);
              safeFileName = `${base}_${Date.now().toString().slice(-4)}_${idx}${ext}`;
              destPath = path.join(folderPath, safeFileName);
            }

            if (item.sourcePath && fs.existsSync(item.sourcePath)) {
              await fsp.copyFile(item.sourcePath, destPath);
            } else if (item.base64Data) {
              const base64Clean = item.base64Data.includes(',')
                ? item.base64Data.split(',')[1]
                : item.base64Data;
              await fsp.writeFile(destPath, Buffer.from(base64Clean, 'base64'));
            }

            meta.mediaSpecs[safeFileName] = {
              dimensions: item.dimensions || '1920 × 1080',
              durationFormatted: item.durationFormatted,
              createdAt: Date.now(),
              tags: item.tags || [],
            };
          })
        );
      }

      await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 8. 跨文件夹物理文件复制粘贴
  app.post('/api/fs/media/paste', async (req, res) => {
    try {
      const cfg = readConfig();
      const { targetFolderId, sourceFilePaths } = req.body;
      if (!cfg.vaultRootPath || !targetFolderId || !targetFolderId.includes('::')) {
        return res.status(400).json({ ok: false, error: '无效的目标文件夹' });
      }

      const [secId, dirName] = targetFolderId.split('::');
      const categories = readCategories(cfg.vaultRootPath);
      const cat = categories.find((c) => c.id === secId);
      const secDirName = cat ? cat.dirName || cat.id : secId;
      const targetFolderPath = path.join(cfg.vaultRootPath, secDirName, dirName);
      await fsp.mkdir(targetFolderPath, { recursive: true });

      const metaPath = path.join(targetFolderPath, '.prism_meta.json');
      let meta: any = { name: dirName, mediaSpecs: {} };
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(await fsp.readFile(metaPath, 'utf-8'));
          if (!meta.mediaSpecs) meta.mediaSpecs = {};
        } catch {}
      }

      for (const srcItem of sourceFilePaths || []) {
        const srcPath = typeof srcItem === 'string' ? srcItem : srcItem.filePath;
        if (!srcPath || !fs.existsSync(srcPath)) continue;

        const origName = path.basename(srcPath);
        const ext = path.extname(origName);
        const base = path.basename(origName, ext);
        let newFileName = origName;
        let destPath = path.join(targetFolderPath, newFileName);

        if (fs.existsSync(destPath)) {
          newFileName = `${base}_副本_${Date.now().toString().slice(-4)}${ext}`;
          destPath = path.join(targetFolderPath, newFileName);
        }

        await fsp.copyFile(srcPath, destPath);
        if (typeof srcItem === 'object') {
          meta.mediaSpecs[newFileName] = {
            dimensions: srcItem.dimensions || '1920 × 1080',
            durationFormatted: srcItem.durationFormatted,
            createdAt: Date.now(),
          };
        }
      }

      await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 9. 媒体文件重命名 (fs.renameSync)
  app.post('/api/fs/media/rename', async (req, res) => {
    try {
      const { filePath, newName } = req.body;
      if (!filePath || !fs.existsSync(filePath) || !newName) {
        return res.status(400).json({ ok: false, error: '源文件或新名称无效' });
      }

      const dir = path.dirname(filePath);
      const oldFileName = path.basename(filePath);
      const origExt = path.extname(oldFileName);
      let safeNewName = sanitizeDirName(newName);
      if (!path.extname(safeNewName) && origExt) {
        safeNewName += origExt;
      }

      const newFilePath = path.join(dir, safeNewName);
      if (path.resolve(filePath) === path.resolve(newFilePath)) {
        return res.json({ ok: true, newFilePath: filePath, newName: oldFileName });
      }
      if (fs.existsSync(newFilePath)) {
        return res.status(400).json({ ok: false, error: '同名文件已存在' });
      }

      fs.renameSync(filePath, newFilePath);

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

      res.json({ ok: true, newFilePath, newName: safeNewName });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 10. 媒体文件跨目录物理移动 (fs.promises.rename)
  app.post('/api/fs/media/move', async (req, res) => {
    try {
      const cfg = readConfig();
      const { filePaths, targetFolderId } = req.body;
      if (!cfg.vaultRootPath || !Array.isArray(filePaths) || !targetFolderId || !targetFolderId.includes('::')) {
        return res.status(400).json({ ok: false, error: '无效的移动参数' });
      }

      const [secId, dirName] = targetFolderId.split('::');
      const categories = readCategories(cfg.vaultRootPath);
      const cat = categories.find((c) => c.id === secId);
      const secDirName = cat ? cat.dirName || cat.id : secId;
      const targetFolderPath = path.join(cfg.vaultRootPath, secDirName, dirName);
      await fsp.mkdir(targetFolderPath, { recursive: true });

      const targetMetaPath = path.join(targetFolderPath, '.prism_meta.json');
      let targetMeta: any = { name: dirName, mediaSpecs: {} };
      if (fs.existsSync(targetMetaPath)) {
        try {
          targetMeta = JSON.parse(await fsp.readFile(targetMetaPath, 'utf-8'));
          if (!targetMeta.mediaSpecs) targetMeta.mediaSpecs = {};
        } catch {}
      }

      const CHUNK_SIZE = 8;
      for (let i = 0; i < filePaths.length; i += CHUNK_SIZE) {
        const chunk = filePaths.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (srcPath: string, idx: number) => {
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

            await fsp.rename(srcPath, destPath);
            targetMeta.mediaSpecs[destName] = {
              dimensions: '1920 × 1080',
              createdAt: Date.now(),
            };
          })
        );
      }

      await fsp.writeFile(targetMetaPath, JSON.stringify(targetMeta, null, 2), 'utf-8');
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 11. 批量安全移入回收站 (Chunked Promise.all)
  app.post('/api/fs/media/delete', async (req, res) => {
    try {
      const cfg = readConfig();
      const { filePaths } = req.body;
      const list: string[] = filePaths || [];
      const CHUNK_SIZE = 8;
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
        const chunk = list.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (fp) => {
            if (fp && fs.existsSync(fp) && cfg.vaultRootPath) {
              await moveItemToSafeTrash(cfg.vaultRootPath, fp);
            }
          })
        );
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 12. 清空所有物理目录并移入回收站重置
  app.post('/api/fs/clear-all', async (_req, res) => {
    try {
      const cfg = readConfig();
      if (cfg.vaultRootPath && fs.existsSync(cfg.vaultRootPath)) {
        const categories = readCategories(cfg.vaultRootPath);
        for (const cat of categories) {
          const secDirName = cat.dirName || cat.id;
          const secPath = path.join(cfg.vaultRootPath, secDirName);
          if (fs.existsSync(secPath)) {
            await moveItemToSafeTrash(cfg.vaultRootPath, secPath);
          }
        }
        writeCategories(cfg.vaultRootPath, DEFAULT_CATEGORIES);
        ensureVaultDirectories(cfg.vaultRootPath);
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/fs/stream', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }

    const stat = fs.statSync(filePath);
    const mimeType = getMimeType(filePath);
    const range = req.headers.range;

    if (range && mimeType.startsWith('video/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PrismDesk Physical FS Server running at http://localhost:${PORT}`);
  });
}

startServer();
