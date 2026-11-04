/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  SectionId, 
  SectionConfig,
  FolderItem, 
  MediaItem, 
  ClipboardState, 
  SecurityConfig, 
  ViewMode, 
  SortOption,
  ThemeMode
} from './types';
import { SECTIONS } from './utils/constants';
import { 
  getVaultAppConfig,
  setVaultRootPath,
  selectNativeDirectoryDialog,
  scanPhysicalVault,
  createPhysicalCategory,
  renamePhysicalCategory,
  deletePhysicalCategory,
  savePhysicalFolder,
  deletePhysicalFolder,
  importPhysicalMediaItems,
  pastePhysicalMediaItems,
  deletePhysicalMediaItems,
  renamePhysicalMediaItem,
  movePhysicalMediaItems,
  copyMediaToSystemClipboard,
  openVaultRootInExplorer,
  saveSecurityConfig,
  clearAllPhysicalData,
  populatePhysicalDemoPack,
  isElectronEnv,
  PhysicalImportPayload,
  subscribeToVaultFsChanges,
  subscribeToImportProgress,
  hashPassword,
  extractNativeFilePath,
  releaseVideoFileHandles,
  isMediaFile
} from './utils/storage';
import { useI18n, UI_DICTIONARY } from './locales';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { BreadcrumbBar } from './components/BreadcrumbBar';
import { FolderCard } from './components/FolderCard';
import { MediaCard } from './components/MediaCard';
import { VirtualGridCell } from './components/VirtualGridCell';
import { LightboxModal } from './components/LightboxModal';
import { UploadModal } from './components/UploadModal';
import { FolderModal } from './components/FolderModal';
import { LockScreen } from './components/LockScreen';
import { SettingsModal } from './components/SettingsModal';
import { 
  FolderOpen, 
  Upload, 
  FolderPlus, 
  Sparkles, 
  ArrowLeft, 
  CheckCircle2,
  HardDrive,
  UploadCloud,
  Trash2,
  Globe,
  Edit3,
  Copy,
  FolderInput,
  Camera,
  Loader2,
  X,
  Search
} from 'lucide-react';

const THEME_STORAGE_KEY = 'prismdesk_theme';

export default function App() {
  const { lang, toggleLang, t, getSectionText, getFolderDisplay } = useI18n();

  // Theme State (Light / Dark)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  // Dynamic Categories & Navigation State
  const [categories, setCategories] = useState<SectionConfig[]>(SECTIONS);
  const [activeSectionId, setActiveSectionId] = useState<SectionId>('materials');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Physical Vault Root Config & First-Launch Setup
  const [vaultRootPath, setVaultRootState] = useState<string>('');
  const [suggestedRootPath, setSuggestedRootPath] = useState<string>('');
  const [showRootSetupModal, setShowRootSetupModal] = useState<boolean>(false);
  const [setupPathInput, setSetupPathInput] = useState<string>('');
  const [isInitializingVault, setIsInitializingVault] = useState<boolean>(false);

  // Data Stores (Scanned directly from Node.js fs)
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [allMedia, setAllMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);

  // Search & Filters (Global Search)
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');

  // Selection & Clipboard
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  // Security & Lock Screen (Default locked with 123456 on launch)
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    isPasswordSet: true,
    passwordHash: '',
    hint: '',
    isLocked: true,
  });
  const [isUnlockedThisSession, setIsUnlockedThisSession] = useState(false);

  // Modal Dialogs & Inline Confirmations
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<FolderItem | null>(null);

  // Dynamic Category Modals (Create / Rename / Delete Category)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SectionConfig | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryDescInput, setCategoryDescInput] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<SectionConfig | null>(null);

  // Media Card Right-Click Context Menu & Modals (Rename / Move To)
  const [mediaCtxMenu, setMediaCtxMenu] = useState<{
    x: number;
    y: number;
    item: MediaItem;
  } | null>(null);
  const [renamingMediaItem, setRenamingMediaItem] = useState<MediaItem | null>(null);
  const [renameMediaInput, setRenameMediaInput] = useState('');
  const [isRenamingMedia, setIsRenamingMedia] = useState(false);

  const [movingMediaItem, setMovingMediaItem] = useState<MediaItem | null>(null);
  const [targetMoveCategoryId, setTargetMoveCategoryId] = useState<string>('');
  const [targetMoveFolderId, setTargetMoveFolderId] = useState<string>('');
  const [isMovingMedia, setIsMovingMedia] = useState(false);

  // Native Desktop Drag-and-Drop Overlay State
  const [isWindowDragging, setIsWindowDragging] = useState(false);

  // Current Section Def & Localized Text
  const currentSection = useMemo(() => {
    return categories.find((s) => s.id === activeSectionId) || categories[0] || SECTIONS[0];
  }, [categories, activeSectionId]);

  const currentSectionText = useMemo(() => {
    return getSectionText(currentSection);
  }, [currentSection, getSectionText]);

  // Active Folder Object resolved from live scanned folders
  const activeFolder = useMemo(() => {
    if (!activeFolderId) return null;
    return folders.find((f) => f.id === activeFolderId) || null;
  }, [folders, activeFolderId]);

  const activeFolderDisplay = useMemo(() => {
    if (!activeFolder) return null;
    return getFolderDisplay(activeFolder);
  }, [activeFolder, getFolderDisplay]);

  // Pre-indexed O(1) map of media items by folderId to avoid O(N*M) filtering in CategoryView
  const mediaByFolderId = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const m of allMedia) {
      const arr = map.get(m.folderId);
      if (arr) {
        arr.push(m);
      } else {
        map.set(m.folderId, [m]);
      }
    }
    return map;
  }, [allMedia]);

  // Media inside current active folder
  const currentFolderMedia = useMemo(() => {
    if (!activeFolder) return [];
    return mediaByFolderId.get(activeFolder.id) || [];
  }, [mediaByFolderId, activeFolder]);

  // Show Toast Helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Scan Physical Disk via Node.js fs
  const reloadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const cfg = await getVaultAppConfig();
      const defaultHash = await hashPassword('123456');
      setSecurityConfig({
        isPasswordSet: true,
        passwordHash: cfg.security?.passwordHash || defaultHash,
        hint: cfg.security?.hint || '',
        isLocked: true,
      });
      setSuggestedRootPath(cfg.defaultSuggestedPath);

      if (!cfg.vaultRootPath) {
        setSetupPathInput(cfg.defaultSuggestedPath);
        setShowRootSetupModal(true);
        if (!silent) setIsLoading(false);
        return;
      }

      setVaultRootState(cfg.vaultRootPath);
      const scanned = await scanPhysicalVault();
      setVaultRootState(scanned.vaultRootPath || cfg.vaultRootPath);
      const nextCategories = scanned.categories?.length ? scanned.categories : SECTIONS;
      setCategories(nextCategories);
      setFolders(scanned.folders);
      setAllMedia(scanned.allMedia);

      setActiveSectionId((prev) => {
        if (nextCategories.some((c) => c.id === prev)) return prev;
        return nextCategories[0]?.id || 'materials';
      });
    } catch (err) {
      console.error('Failed to scan physical vault:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Subscribe to real-time disk changes from fs.watch (hot-reload)
  useEffect(() => {
    const unsubscribe = subscribeToVaultFsChanges(() => {
      reloadData(true);
    });
    return () => unsubscribe();
  }, [reloadData]);

  // Subscribe to streaming batch import progress events
  useEffect(() => {
    const unsubscribe = subscribeToImportProgress((info) => {
      setBatchStatus(
        t('workspace.importingProgress', {
          current: info.completed,
          total: info.total,
        })
      );
    });
    return () => unsubscribe();
  }, [t]);

  // Clear selection when switching folder
  useEffect(() => {
    setSelectedMediaIds(new Set());
  }, [activeFolderId, activeSectionId]);

  // Close right-click context menu on global click or Escape
  useEffect(() => {
    if (!mediaCtxMenu) return;
    const closeMenu = () => setMediaCtxMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, [mediaCtxMenu]);

  // Prevent Chromium default file-open navigation when dragging files anywhere in window
  useEffect(() => {
    const preventDefaultDrag = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefaultDrag);
    window.addEventListener('drop', preventDefaultDrag);
    return () => {
      window.removeEventListener('dragover', preventDefaultDrag);
      window.removeEventListener('drop', preventDefaultDrag);
    };
  }, []);

  // Keyboard shortcut listener (Esc / Backspace for returning to upper level)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mediaCtxMenu) {
        setMediaCtxMenu(null);
        return;
      }
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if ((e.key === 'Escape' || e.key === 'Backspace') && activeFolderId && !lightboxItemId) {
        setActiveFolderId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFolderId, lightboxItemId, mediaCtxMenu]);

  // Section Folders
  const sectionFolders = useMemo(() => {
    return folders.filter((f) => f.sectionId === activeSectionId);
  }, [folders, activeSectionId]);

  // Subfolders inside target category for "Move To..." modal
  const moveTargetSubfolders = useMemo(() => {
    return folders.filter((f) => f.sectionId === targetMoveCategoryId);
  }, [folders, targetMoveCategoryId]);

  // Filtered & Sorted Media in current folder view (Name, Date, Size asc/desc)
  const displayMedia = useMemo(() => {
    const list = [...currentFolderMedia];

    list.sort((a, b) => {
      if (sortOption === 'date-desc') return b.createdAt - a.createdAt;
      if (sortOption === 'date-asc') return a.createdAt - b.createdAt;
      if (sortOption === 'name-asc') return a.name.localeCompare(b.name, lang === 'zh' ? 'zh-CN' : 'en-US');
      if (sortOption === 'name-desc') return b.name.localeCompare(a.name, lang === 'zh' ? 'zh-CN' : 'en-US');
      if (sortOption === 'size-desc') return b.size - a.size;
      if (sortOption === 'size-asc') return a.size - b.size;
      return 0;
    });

    return list;
  }, [currentFolderMedia, sortOption, lang]);

  // Global Search Results across ALL categories and ALL subfolders
  const isGlobalSearching = searchQuery.trim().length > 0;

  const globalMatchedFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return folders.filter((f) => {
      const disp = getFolderDisplay(f);
      const sec = categories.find((c) => c.id === f.sectionId);
      const secName = sec ? getSectionText(sec).name.toLowerCase() : '';
      return (
        f.name.toLowerCase().includes(q) ||
        disp.name.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q)) ||
        (disp.description && disp.description.toLowerCase().includes(q)) ||
        secName.includes(q)
      );
    });
  }, [folders, searchQuery, getFolderDisplay, categories, getSectionText]);

  const globalMatchedMedia = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const list = allMedia.filter((m) => {
      const folderObj = folders.find((f) => f.id === m.folderId);
      const folderName = folderObj ? getFolderDisplay(folderObj).name.toLowerCase() : '';
      return (
        m.name.toLowerCase().includes(q) ||
        m.tags?.some((tTag) => tTag.toLowerCase().includes(q)) ||
        folderName.includes(q)
      );
    });

    list.sort((a, b) => {
      if (sortOption === 'date-desc') return b.createdAt - a.createdAt;
      if (sortOption === 'date-asc') return a.createdAt - b.createdAt;
      if (sortOption === 'name-asc') return a.name.localeCompare(b.name, lang === 'zh' ? 'zh-CN' : 'en-US');
      if (sortOption === 'name-desc') return b.name.localeCompare(a.name, lang === 'zh' ? 'zh-CN' : 'en-US');
      if (sortOption === 'size-desc') return b.size - a.size;
      if (sortOption === 'size-asc') return a.size - b.size;
      return 0;
    });

    return list;
  }, [allMedia, folders, searchQuery, sortOption, lang, getFolderDisplay]);

  // Items currently active for Lightbox navigation (supports both folder view and global search view)
  const activeLightboxList = useMemo(() => {
    return isGlobalSearching ? globalMatchedMedia : displayMedia;
  }, [isGlobalSearching, globalMatchedMedia, displayMedia]);

  // ----------------- HANDLERS -----------------

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await reloadData(true);
      showToast(t('toast.refreshed'));
    } finally {
      setTimeout(() => setIsRefreshing(false), 350);
    }
  };

  const handleToggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    showToast(next === 'dark' ? t('toast.themeDark') : t('toast.themeLight'));
  };

  const handleLanguageToggled = (nextLang: 'zh' | 'en') => {
    showToast(UI_DICTIONARY[nextLang]['toast.langSwitched']);
  };

  const handleConfirmFirstLaunchRoot = async () => {
    const target = setupPathInput.trim() || suggestedRootPath;
    if (!target) return;
    setIsInitializingVault(true);
    try {
      const normalized = await setVaultRootPath(target);
      setVaultRootState(normalized);
      setShowRootSetupModal(false);
      await reloadData();
      showToast(t('toast.rootBound', { path: normalized }));
    } catch (err: any) {
      showToast(err?.message || t('toast.rootInitFailed'));
    } finally {
      setIsInitializingVault(false);
    }
  };

  const handleChangeVaultRoot = async (newPath: string) => {
    const normalized = await setVaultRootPath(newPath);
    setVaultRootState(normalized);
    setActiveFolderId(null);
    await reloadData();
    showToast(t('toast.rootChanged', { path: normalized }));
  };

  const handleOpenRootInExplorer = async () => {
    const target = activeFolder?.folderPath || vaultRootPath;
    const res = await openVaultRootInExplorer(target);
    if (res.openedNative) {
      showToast(t('toast.openedInExplorer', { path: res.path }));
    } else {
      try {
        await navigator.clipboard.writeText(res.path);
      } catch {}
      showToast(t('toast.copiedPathFallback', { path: res.path }));
    }
  };

  const handleSelectSection = (id: SectionId) => {
    setActiveSectionId(id);
    setActiveFolderId(null);
    setSearchQuery('');
  };

  const handleSelectSubfolderFromSidebar = (sectionId: SectionId, folder: FolderItem) => {
    setActiveSectionId(sectionId);
    setActiveFolderId(folder.id);
    setSearchQuery('');
  };

  const handleCreateSubfolderInSection = (sectionId: SectionId) => {
    setActiveSectionId(sectionId);
    setEditingFolder(null);
    setShowFolderModal(true);
  };

  const handleOpenFolder = (folder: FolderItem) => {
    setActiveSectionId(folder.sectionId);
    setActiveFolderId(folder.id);
    setSearchQuery('');
  };

  const handleNavigateToSectionRoot = () => {
    setActiveFolderId(null);
  };

  // Dynamic Category Management (Create / Rename / Delete with Recycle Bin)
  const handleOpenCreateCategory = () => {
    setEditingCategory(null);
    setCategoryNameInput('');
    setCategoryDescInput('');
    setShowCategoryModal(true);
  };

  const handleOpenRenameCategory = (cat: SectionConfig) => {
    const disp = getSectionText(cat);
    setEditingCategory(cat);
    setCategoryNameInput(disp.name);
    setCategoryDescInput(disp.description);
    setShowCategoryModal(true);
  };

  const handleSubmitCategoryModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = categoryNameInput.trim();
    if (!cleanName) return;
    setIsSavingCategory(true);
    try {
      if (editingCategory) {
        await renamePhysicalCategory(editingCategory.id, cleanName);
        await reloadData();
        showToast(t('toast.categoryRenamed', { name: cleanName }));
      } else {
        const created = await createPhysicalCategory(
          cleanName,
          categoryDescInput.trim() || undefined
        );
        await reloadData();
        if (created?.id) {
          setActiveSectionId(created.id);
          setActiveFolderId(null);
        }
        showToast(t('toast.categoryCreated', { name: cleanName }));
      }
      setShowCategoryModal(false);
      setEditingCategory(null);
    } catch (err: any) {
      showToast(err?.message || 'Error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!pendingDeleteCategory) return;
    const target = pendingDeleteCategory;
    const dispName = getSectionText(target).name;
    setPendingDeleteCategory(null);
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      await releaseVideoFileHandles();
      await deletePhysicalCategory(target.id);
      if (activeSectionId === target.id) {
        setActiveFolderId(null);
      }
      await reloadData(true);
      showToast(t('toast.categoryDeleted', { name: dispName }));
    } catch (err: any) {
      showToast(err?.message || 'Error');
    } finally {
      setBatchStatus(null);
    }
  };

  // Folder Operations (Node.js fs + .prism_meta.json)
  const handleSaveFolder = async (folder: FolderItem) => {
    const newFolderId = await savePhysicalFolder(folder, editingFolder?.id);
    await reloadData(true);
    if (activeFolderId && editingFolder && activeFolderId === editingFolder.id) {
      setActiveFolderId(newFolderId);
    }
    showToast(t('toast.folderSaved', { name: folder.name }));
  };

  const handleDeleteFolder = async (folderId: string) => {
    const f = folders.find((i) => i.id === folderId);
    if (!f) return;
    setPendingDeleteFolder(f);
  };

  const confirmDeleteFolderAction = async () => {
    if (!pendingDeleteFolder) return;
    const f = pendingDeleteFolder;
    const dispName = getFolderDisplay(f).name;
    setPendingDeleteFolder(null);
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      await releaseVideoFileHandles();
      setFolders((prev) => prev.filter((item) => item.id !== f.id));
      setAllMedia((prev) => prev.filter((m) => m.folderId !== f.id));
      if (activeFolderId === f.id) {
        setActiveFolderId(null);
      }
      await deletePhysicalFolder(f.id);
      await reloadData(true);
      showToast(t('toast.folderDeleted', { name: dispName }));
    } finally {
      setBatchStatus(null);
    }
  };

  // Media Operations (Zero-Memory Streaming Batch IPC + Recycle Bin shell.trashItem)
  const handleSaveUploadedItems = async (items: PhysicalImportPayload[]) => {
    if (!activeFolder) return;
    setBatchStatus(t('workspace.importingProgress', { current: 0, total: items.length }));
    try {
      await importPhysicalMediaItems(activeFolder.id, items);
      await reloadData(true);
      showToast(t('toast.mediaImported', { count: items.length }));
    } finally {
      setBatchStatus(null);
    }
  };

  // Direct Windows Desktop Drag-and-Drop into Application Viewport (Zero-Memory Path Streaming)
  const handleWindowDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsWindowDragging(true);
    }
  };

  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isWindowDragging) {
      setIsWindowDragging(true);
    }
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (!related || !e.currentTarget.contains(related)) {
      setIsWindowDragging(false);
    }
  };

  const handleWindowDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWindowDragging(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    setBatchStatus(t('workspace.importingProgress', { current: 0, total: files.length }));
    try {
      let targetFolderId = activeFolder?.id;
      let targetFolderName = activeFolderDisplay?.name || '';

      if (!targetFolderId) {
        if (sectionFolders.length > 0) {
          targetFolderId = sectionFolders[0].id;
          targetFolderName = getFolderDisplay(sectionFolders[0]).name;
          setActiveFolderId(targetFolderId);
        } else {
          const autoFolderName = `${currentSectionText.name}${t('workspace.defaultDropFolderSuffix')}`;
          const newId = await savePhysicalFolder({
            id: '',
            sectionId: activeSectionId,
            name: autoFolderName,
            description: t('workspace.defaultDropFolderDesc'),
            createdAt: Date.now(),
          });
          targetFolderId = newId;
          targetFolderName = autoFolderName;
          setActiveFolderId(newId);
        }
      }

      const payloads: PhysicalImportPayload[] = [];
      for (const file of Array.from(files)) {
        const nativePath = extractNativeFilePath(file);
        const fileName = file.name || (nativePath ? nativePath.split(/[\\/]/).pop() || '' : '');
        const check = isMediaFile(fileName);
        const isVideo = file.type.startsWith('video/') || (check.isMedia && check.type === 'video');
        const isImage = file.type.startsWith('image/') || (check.isMedia && check.type === 'image');
        if (!isVideo && !isImage) continue;

        let base64Data: string | undefined = undefined;
        // 严禁将有物理路径 (file.path) 的大视频传给 FileReader 或内存缓冲区
        if (!nativePath && file.size <= 35 * 1024 * 1024) {
          base64Data = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => resolve('');
            reader.readAsDataURL(file);
          });
        }

        payloads.push({
          name: fileName,
          type: isVideo ? 'video' : 'image',
          sourcePath: nativePath || undefined,
          base64Data,
          dimensions: '1920 × 1080',
          durationFormatted: isVideo ? '00:15' : undefined,
        });
      }

      if (payloads.length > 0 && targetFolderId) {
        await importPhysicalMediaItems(targetFolderId, payloads);
        await reloadData(true);
        showToast(t('toast.mediaDropped', { count: payloads.length, folder: targetFolderName }));
      }
    } finally {
      setBatchStatus(null);
    }
  };

  const handleDeleteMediaItem = async (id: string) => {
    const target = allMedia.find((m) => m.id === id);
    if (!target) return;
    if (lightboxItemId === id) {
      setLightboxItemId(null);
    }
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      // 1. 先从状态卸载对应的 MediaCard 并彻底释放所有 <video> 标签句柄
      setAllMedia((prev) => prev.filter((m) => m.id !== id));
      setSelectedMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await releaseVideoFileHandles();

      // 2. 调用主进程安全移入回收站（含 EBUSY 重试机制）
      await deletePhysicalMediaItems([target]);
      await reloadData(true);
      showToast(t('toast.mediaDeleted', { name: target.name }));
    } finally {
      setBatchStatus(null);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedMediaIds.size === 0) return;
    const targets = allMedia.filter((m) => selectedMediaIds.has(m.id));
    if (lightboxItemId && selectedMediaIds.has(lightboxItemId)) {
      setLightboxItemId(null);
    }
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      const deletedSet = new Set(selectedMediaIds);
      setAllMedia((prev) => prev.filter((m) => !deletedSet.has(m.id)));
      setSelectedMediaIds(new Set());
      await releaseVideoFileHandles();

      await deletePhysicalMediaItems(targets);
      await reloadData(true);
      showToast(t('toast.batchDeleted', { count: targets.length }));
    } finally {
      setBatchStatus(null);
    }
  };

  // Media Card Right-Click Context Menu Handlers
  const handleMediaContextMenu = (e: React.MouseEvent, item: MediaItem) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 210;
    const menuHeight = 200;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 12);
    setMediaCtxMenu({ x, y, item });
  };

  const handleOpenRenameMediaModal = (item: MediaItem) => {
    setMediaCtxMenu(null);
    setRenamingMediaItem(item);
    setRenameMediaInput(item.name);
  };

  const handleSubmitRenameMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingMediaItem || !renameMediaInput.trim()) return;
    setIsRenamingMedia(true);
    try {
      await releaseVideoFileHandles();
      await renamePhysicalMediaItem(renamingMediaItem, renameMediaInput.trim());
      await reloadData(true);
      showToast(t('toast.mediaRenamed', { name: renameMediaInput.trim() }));
      setRenamingMediaItem(null);
    } catch (err: any) {
      showToast(err?.message || 'Error');
    } finally {
      setIsRenamingMedia(false);
    }
  };

  const handleOpenMoveMediaModal = (item: MediaItem) => {
    setMediaCtxMenu(null);
    setMovingMediaItem(item);
    const defaultCatId = item.sectionId || activeSectionId;
    setTargetMoveCategoryId(defaultCatId);
    const catFolders = folders.filter((f) => f.sectionId === defaultCatId);
    const otherFolder = catFolders.find((f) => f.id !== item.folderId) || catFolders[0];
    setTargetMoveFolderId(otherFolder?.id || '');
  };

  const handleSelectMoveCategory = (catId: string) => {
    setTargetMoveCategoryId(catId);
    const catFolders = folders.filter((f) => f.sectionId === catId);
    setTargetMoveFolderId(catFolders[0]?.id || '');
  };

  const handleSubmitMoveMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingMediaItem || !targetMoveCategoryId) return;
    setIsMovingMedia(true);
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      let destFolderId = targetMoveFolderId;
      let destFolderName = '';

      if (!destFolderId) {
        const targetCat = categories.find((c) => c.id === targetMoveCategoryId);
        const catTitle = targetCat ? getSectionText(targetCat).name : targetMoveCategoryId;
        const autoName = `${catTitle}${t('workspace.defaultDropFolderSuffix')}`;
        destFolderId = await savePhysicalFolder({
          id: '',
          sectionId: targetMoveCategoryId,
          name: autoName,
          description: t('workspace.defaultDropFolderDesc'),
          createdAt: Date.now(),
        });
        destFolderName = autoName;
      } else {
        const found = folders.find((f) => f.id === destFolderId);
        destFolderName = found ? getFolderDisplay(found).name : destFolderId;
      }

      setAllMedia((prev) => prev.filter((m) => m.id !== movingMediaItem.id));
      await releaseVideoFileHandles();
      await movePhysicalMediaItems([movingMediaItem], destFolderId);
      await reloadData(true);
      showToast(t('toast.mediaMoved', { name: movingMediaItem.name, target: destFolderName }));
      setMovingMediaItem(null);
    } catch (err: any) {
      showToast(err?.message || 'Error');
    } finally {
      setIsMovingMedia(false);
      setBatchStatus(null);
    }
  };

  const handleToggleSelectMedia = (id: string) => {
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const currentList = isGlobalSearching ? globalMatchedMedia : displayMedia;
    if (selectedMediaIds.size === currentList.length) {
      setSelectedMediaIds(new Set());
    } else {
      setSelectedMediaIds(new Set(currentList.map((m) => m.id)));
    }
  };

  // System-Level Clipboard Copy & In-App Paste
  const handleCopySingleItem = async (item: MediaItem) => {
    setClipboard({
      action: 'copy',
      items: [item],
    });
    await copyMediaToSystemClipboard(item);
    showToast(t('toast.copiedToSystem', { path: item.filePath || item.name }));
  };

  const handlePasteClipboard = async () => {
    if (!clipboard || clipboard.items.length === 0 || !activeFolder) return;
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      await pastePhysicalMediaItems(activeFolder.id, clipboard.items);
      await reloadData();
      showToast(t('toast.pastedItems', { count: clipboard.items.length }));
    } finally {
      setBatchStatus(null);
    }
  };

  const handleClearClipboard = () => {
    setClipboard(null);
    showToast(t('toast.clipboardCleared'));
  };

  // Set Folder Cover permanently via .prism_meta.json
  const handleSetAsFolderCover = async (item: MediaItem) => {
    const targetFolder = folders.find((f) => f.id === item.folderId) || activeFolder;
    if (!targetFolder) return;
    const updatedFolder: FolderItem = {
      ...targetFolder,
      coverSourceFilePath: item.filePath,
      coverUrl: item.url,
    };
    await savePhysicalFolder(updatedFolder, targetFolder.id);
    await reloadData();
    showToast(t('toast.coverSet', { name: item.name }));
  };

  // Security & Password Handlers (No disable/reset backdoor)
  const handleSetPassword = async (newHash: string, hint: string) => {
    if (!newHash) return;
    const updated: SecurityConfig = {
      isPasswordSet: true,
      passwordHash: newHash,
      hint,
      isLocked: false,
    };
    await saveSecurityConfig(updated);
    setSecurityConfig(updated);
    setIsUnlockedThisSession(true);
    showToast(t('toast.pwdSet'));
  };

  const handleLockApp = async () => {
    setIsUnlockedThisSession(false);
  };

  const handleUnlockSuccess = () => {
    setIsUnlockedThisSession(true);
    showToast(t('toast.unlocked'));
  };

  const handleLoadDemoPack = async () => {
    setIsLoading(true);
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      await populatePhysicalDemoPack();
      await reloadData();
      showToast(t('toast.demoLoaded'));
    } finally {
      setIsLoading(false);
      setBatchStatus(null);
    }
  };

  const handleClearAllData = async () => {
    setBatchStatus(t('workspace.batchProcessing'));
    try {
      await clearAllPhysicalData();
      setActiveFolderId(null);
      await reloadData();
      showToast(t('toast.dataCleared'));
    } finally {
      setBatchStatus(null);
    }
  };

  // Grid sizing class based on viewMode
  const gridClasses = useMemo(() => {
    if (viewMode === 'compact') {
      return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3';
    }
    if (viewMode === 'spacious') {
      return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
    }
    return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4';
  }, [viewMode]);

  // Lock Screen Guard: Always locked on startup until unlocked with password (default 123456)
  if (!isUnlockedThisSession) {
    return (
      <LockScreen
        securityConfig={securityConfig}
        onUnlock={handleUnlockSuccess}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 select-none overflow-hidden font-sans transition-colors duration-200">
      {/* 1. Windows 11 Frameless Draggable Title Bar with Global Search, Theme Toggle & Language Switcher */}
      <TitleBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onLockApp={handleLockApp}
        onOpenSettings={() => setShowSettingsModal(true)}
        isPasswordSet={securityConfig.isPasswordSet}
        vaultRootPath={vaultRootPath}
        onOpenRootInExplorer={handleOpenRootInExplorer}
        onLanguageToggled={handleLanguageToggled}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main Workspace Frame (Sidebar Tree-View + Content Viewport) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 2. Left Sidebar (Tree-View Subfolder Stack + Dynamic Media Directories + Right-Click Menu) */}
        <Sidebar
          categories={categories}
          activeSectionId={activeSectionId}
          activeFolderId={activeFolderId}
          onSelectSection={handleSelectSection}
          onSelectSubfolder={handleSelectSubfolderFromSidebar}
          onCreateSubfolderInSection={handleCreateSubfolderInSection}
          folders={folders}
          allMedia={allMedia}
          vaultRootPath={vaultRootPath}
          onOpenRootInExplorer={handleOpenRootInExplorer}
          onOpenCreateCategory={handleOpenCreateCategory}
          onRequestRenameCategory={handleOpenRenameCategory}
          onRequestDeleteCategory={(cat) => setPendingDeleteCategory(cat)}
          onLockApp={handleLockApp}
          isPasswordSet={securityConfig.isPasswordSet}
        />

        {/* 3. Right Main Content Area with Native Desktop Drag-and-Drop Support */}
        <main
          onDragEnter={handleWindowDragEnter}
          onDragOver={handleWindowDragOver}
          onDragLeave={handleWindowDragLeave}
          onDrop={handleWindowDrop}
          className="flex-1 flex flex-col min-w-0 bg-slate-50/70 dark:bg-slate-950 overflow-hidden relative transition-colors duration-200"
        >
          {/* Non-blocking Batch Async Progress Banner */}
          {batchStatus && (
            <div className="bg-sky-500 text-white px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2 shadow-sm z-30 animate-in fade-in duration-150">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{batchStatus}</span>
            </div>
          )}

          {/* Full-Window Drag-and-Drop Overlay */}
          {isWindowDragging && (
            <div className="absolute inset-3 z-50 rounded-2xl bg-sky-500/10 dark:bg-sky-500/20 border-2 border-dashed border-sky-500 backdrop-blur-xs flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-sky-200 dark:border-sky-700 flex items-center justify-center text-sky-500 mb-3">
                <UploadCloud className="w-8 h-8 animate-bounce" />
              </div>
              <div className="text-base font-bold text-sky-900 dark:text-sky-200">
                {t('workspace.dragOverlayTitle')}
              </div>
              <div className="text-xs text-sky-700 dark:text-sky-300 mt-1 font-medium">
                {t('workspace.dragOverlayTarget', {
                  target: activeFolderDisplay
                    ? `${currentSectionText.name} / ${activeFolderDisplay.name}`
                    : `${currentSectionText.name} (${t('workspace.autoArchive')})`,
                })}
              </div>
            </div>
          )}

          {/* Breadcrumbs & Action Toolbar with Refresh Button, Sort Selector & Upper-Level Return Button */}
          <BreadcrumbBar
            currentSection={currentSection}
            currentFolder={activeFolder}
            onNavigateToSectionRoot={handleNavigateToSectionRoot}
            onOpenUploadModal={() => setShowUploadModal(true)}
            onOpenNewFolderModal={() => {
              setEditingFolder(null);
              setShowFolderModal(true);
            }}
            onRefresh={handleManualRefresh}
            isRefreshing={isRefreshing}
            clipboard={clipboard}
            onPasteClipboard={handlePasteClipboard}
            onClearClipboard={handleClearClipboard}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            sortOption={sortOption}
            onChangeSortOption={setSortOption}
            selectedCount={selectedMediaIds.size}
            totalMediaCount={isGlobalSearching ? globalMatchedMedia.length : displayMedia.length}
            onToggleSelectAll={handleToggleSelectAll}
            onBatchDelete={handleBatchDelete}
          />

          {/* Section / Global Search Banner Header */}
          {isGlobalSearching ? (
            <div className="px-6 py-3.5 bg-gradient-to-r from-sky-50/90 via-white to-sky-50/60 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-900 border-b border-sky-200/80 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-2xs transition-colors duration-200">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500 text-white text-xs font-semibold shadow-2xs">
                    <Search className="w-3.5 h-3.5" />
                    <span>{t('globalSearch.title', { query: searchQuery })}</span>
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  {t('globalSearch.subtitle', {
                    query: searchQuery,
                    folderCount: globalMatchedFolders.length,
                    mediaCount: globalMatchedMedia.length,
                  })}
                </div>
              </div>
              <button
                onClick={() => setSearchQuery('')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-300 border border-slate-200 dark:border-slate-700 transition-colors shadow-2xs font-medium shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t('globalSearch.clearBtn')}</span>
              </button>
            </div>
          ) : (
            <div className="px-6 py-3.5 bg-gradient-to-r from-white via-sky-50/40 to-white dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-900 border-b border-sky-100 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-2xs transition-colors duration-200">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                    {activeFolderDisplay ? activeFolderDisplay.name : currentSectionText.name}
                  </span>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {activeFolderDisplay ? activeFolderDisplay.description : currentSectionText.description}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 font-mono flex-wrap">
                  <span>
                    {activeFolder
                      ? t('workspace.folderItemCount', { count: displayMedia.length })
                      : t('workspace.sectionFolderCount', { count: sectionFolders.length })}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-sky-600 dark:text-sky-400 font-medium font-sans">
                    {t('workspace.hoverHint')}
                  </span>
                </div>
              </div>

              {activeFolder && (
                <button
                  onClick={handleNavigateToSectionRoot}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-300 border border-slate-200 dark:border-slate-700 hover:border-sky-300 transition-colors shadow-2xs font-medium whitespace-nowrap shrink-0"
                  title={t('breadcrumb.backUpperTitle')}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('breadcrumb.backUpper')}</span>
                </button>
              )}
            </div>
          )}

          {/* Scrollable Media/Folder Grid Viewport */}
          <div
            onDragEnter={handleWindowDragEnter}
            onDragOver={handleWindowDragOver}
            onDrop={handleWindowDrop}
            className="flex-1 overflow-y-auto p-6 scroll-smooth"
          >
            {/* VIEW G: GLOBAL SEARCH RESULTS PANEL across entire vault */}
            {isGlobalSearching ? (
              <div className="space-y-8">
                {globalMatchedFolders.length === 0 && globalMatchedMedia.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
                      <Search className="w-8 h-8 text-sky-500" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {t('globalSearch.emptyTitle', { query: searchQuery })}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-5">
                      {t('globalSearch.emptyDesc')}
                    </p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-xs font-medium text-white transition-colors shadow-sm"
                    >
                      {t('globalSearch.clearBtn')}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Matched Subfolders across all Categories */}
                    {globalMatchedFolders.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
                            <span>
                              {t('globalSearch.matchedFolders', { count: globalMatchedFolders.length })}
                            </span>
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                          {globalMatchedFolders.map((folder) => {
                            const folderMedia = mediaByFolderId.get(folder.id) || [];
                            const previewImages = folderMedia
                              .filter((m) => m.type === 'image')
                              .slice(0, 4)
                              .map((m) => m.url);

                            return (
                              <VirtualGridCell key={folder.id} estimatedHeight={240}>
                                <FolderCard
                                  folder={folder}
                                  itemCount={folderMedia.length}
                                  previewImages={previewImages}
                                  onOpenFolder={handleOpenFolder}
                                  onEditFolder={(f) => {
                                    setEditingFolder(f);
                                    setShowFolderModal(true);
                                  }}
                                  onDeleteFolder={handleDeleteFolder}
                                  onChangeCover={(f) => {
                                    setEditingFolder(f);
                                    setShowFolderModal(true);
                                  }}
                                />
                              </VirtualGridCell>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched Physical Media Items across all Categories & Subfolders */}
                    {globalMatchedMedia.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                            <span>
                              {t('globalSearch.matchedMedia', { count: globalMatchedMedia.length })}
                            </span>
                          </h4>
                        </div>
                        <div className={`grid ${gridClasses}`}>
                          {globalMatchedMedia.map((item) => {
                            const parentFolder = folders.find((f) => f.id === item.folderId);
                            const parentSec = categories.find((c) => c.id === item.sectionId);
                            const secName = parentSec ? getSectionText(parentSec).name : item.sectionId;
                            const folName = parentFolder ? getFolderDisplay(parentFolder).name : '';
                            const locationLabel = t('globalSearch.locateFolder', {
                              section: secName,
                              folder: folName,
                            });

                            return (
                              <VirtualGridCell key={item.id} estimatedHeight={240}>
                                <div className="flex flex-col gap-1">
                                  <MediaCard
                                    item={item}
                                    isSelected={selectedMediaIds.has(item.id)}
                                    onToggleSelect={handleToggleSelectMedia}
                                    onOpenLightbox={(m) => setLightboxItemId(m.id)}
                                    onCopyItem={handleCopySingleItem}
                                    onDeleteItem={handleDeleteMediaItem}
                                    onSetAsFolderCover={handleSetAsFolderCover}
                                    onContextMenuItem={handleMediaContextMenu}
                                  />
                                  {parentFolder && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenFolder(parentFolder)}
                                      className="px-2 py-1 rounded-md bg-white/80 dark:bg-slate-900/80 hover:bg-sky-50 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 flex items-center justify-between gap-1 truncate transition-colors cursor-pointer"
                                      title={locationLabel}
                                    >
                                      <span className="truncate font-mono">{locationLabel}</span>
                                      <span className="text-sky-500 font-sans shrink-0">→</span>
                                    </button>
                                  )}
                                </div>
                              </VirtualGridCell>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {/* VIEW A: Browsing Folders in Current Section (Virtualized Grid) */}
                {!activeFolder && (
                  <div className="space-y-4">
                    {sectionFolders.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
                          <FolderOpen className="w-8 h-8 text-sky-500" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {t('workspace.emptyFoldersTitle')}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-5">
                          {t('workspace.emptyFoldersDesc', { section: currentSectionText.name })}
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setEditingFolder(null);
                              setShowFolderModal(true);
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-xs font-medium text-white transition-colors shadow-sm shadow-sky-500/20"
                          >
                            <FolderPlus className="w-4 h-4" />
                            <span>{t('workspace.createFirstFolder')}</span>
                          </button>
                          <button
                            onClick={handleLoadDemoPack}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-sky-700 border border-slate-200 dark:border-slate-700 hover:border-sky-300 transition-colors shadow-2xs"
                          >
                            <Sparkles className="w-4 h-4 text-sky-500" />
                            <span>{t('workspace.loadDemoPackBtn')}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                        {sectionFolders.map((folder) => {
                          const folderMedia = mediaByFolderId.get(folder.id) || [];
                          const previewImages = folderMedia
                            .filter((m) => m.type === 'image')
                            .slice(0, 4)
                            .map((m) => m.url);

                          return (
                            <VirtualGridCell key={folder.id} estimatedHeight={240}>
                              <FolderCard
                                folder={folder}
                                itemCount={folderMedia.length}
                                previewImages={previewImages}
                                onOpenFolder={handleOpenFolder}
                                onEditFolder={(f) => {
                                  setEditingFolder(f);
                                  setShowFolderModal(true);
                                }}
                                onDeleteFolder={handleDeleteFolder}
                                onChangeCover={(f) => {
                                  setEditingFolder(f);
                                  setShowFolderModal(true);
                                }}
                              />
                            </VirtualGridCell>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW B: Browsing Media inside a Folder (Virtualized Grid + Hover-to-Mount Video) */}
                {activeFolder && (
                  <div className="space-y-4">
                    {displayMedia.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
                          <Upload className="w-8 h-8 text-sky-500" />
                        </div>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {t('workspace.emptyMediaTitle')}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-5">
                          {t('workspace.emptyMediaDesc')}
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setShowUploadModal(true)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-xs font-medium text-white transition-colors shadow-sm shadow-sky-500/20"
                          >
                            <Upload className="w-4 h-4" />
                            <span>{t('workspace.importNowBtn')}</span>
                          </button>
                          {clipboard && clipboard.items.length > 0 && (
                            <button
                              onClick={handlePasteClipboard}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-sky-50 dark:hover:bg-slate-800 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-slate-700 transition-colors shadow-2xs"
                            >
                              <span>{t('workspace.pasteClipboardBtn', { count: clipboard.items.length })}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={`grid ${gridClasses}`}>
                        {displayMedia.map((item) => (
                          <VirtualGridCell key={item.id} estimatedHeight={210}>
                            <MediaCard
                              item={item}
                              isSelected={selectedMediaIds.has(item.id)}
                              onToggleSelect={handleToggleSelectMedia}
                              onOpenLightbox={(m) => setLightboxItemId(m.id)}
                              onCopyItem={handleCopySingleItem}
                              onDeleteItem={handleDeleteMediaItem}
                              onSetAsFolderCover={handleSetAsFolderCover}
                              onContextMenuItem={handleMediaContextMenu}
                            />
                          </VirtualGridCell>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bottom Floating Toast Notification */}
          {toastMessage && (
            <div className="absolute bottom-4 right-6 z-40 bg-white/95 dark:bg-slate-900/95 border border-sky-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs px-3.5 py-2 rounded-lg shadow-xl backdrop-blur-md flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-150">
              <CheckCircle2 className="w-4 h-4 text-sky-500 shrink-0" />
              <span className="font-medium">{toastMessage}</span>
            </div>
          )}
        </main>
      </div>

      {/* Custom React Right-Click Context Menu for Media Cards */}
      {mediaCtxMenu && (
        <div
          style={{ top: mediaCtxMenu.y, left: mediaCtxMenu.x }}
          className="fixed z-50 w-52 bg-white/95 dark:bg-slate-900/95 border border-sky-100 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 text-xs text-slate-700 dark:text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {mediaCtxMenu.item.name}
            </div>
            <div className="text-[10px] text-slate-400 font-mono truncate">
              {mediaCtxMenu.item.dimensions || mediaCtxMenu.item.type.toUpperCase()}
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenRenameMediaModal(mediaCtxMenu.item)}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('mediaCtx.rename')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const target = mediaCtxMenu.item;
              setMediaCtxMenu(null);
              handleCopySingleItem(target);
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('mediaCtx.copy')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenMoveMediaModal(mediaCtxMenu.item)}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
          >
            <FolderInput className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('mediaCtx.moveTo')}</span>
          </button>

          {mediaCtxMenu.item.type === 'image' && (
            <button
              type="button"
              onClick={() => {
                const target = mediaCtxMenu.item;
                setMediaCtxMenu(null);
                handleSetAsFolderCover(target);
              }}
              className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-sky-500" />
              <span>{t('mediaCtx.setCover')}</span>
            </button>
          )}

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            onClick={() => {
              const targetId = mediaCtxMenu.item.id;
              setMediaCtxMenu(null);
              handleDeleteMediaItem(targetId);
            }}
            className="w-full px-3 py-2 text-left flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('mediaCtx.delete')}</span>
          </button>
        </div>
      )}

      {/* Create / Rename Media Directory Category Modal */}
      {showCategoryModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setShowCategoryModal(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  {editingCategory ? t('categoryModal.renameTitle') : t('categoryModal.createTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('categoryModal.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitCategoryModal} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('categoryModal.nameLabel')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={categoryNameInput}
                  onChange={(e) => setCategoryNameInput(e.target.value)}
                  placeholder={t('categoryModal.namePlaceholder')}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('categoryModal.descLabel')}
                </label>
                <input
                  type="text"
                  value={categoryDescInput}
                  onChange={(e) => setCategoryDescInput(e.target.value)}
                  placeholder={t('categoryModal.descPlaceholder')}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('categoryModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory || !categoryNameInput.trim()}
                  className="px-5 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors shadow-sm shadow-sky-500/20"
                >
                  {editingCategory ? t('categoryModal.confirmRename') : t('categoryModal.confirmCreate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Category Deletion Modal (Safe Recycle Bin) */}
      {pendingDeleteCategory && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none"
          onClick={() => setPendingDeleteCategory(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-500 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('deleteCategoryModal.title', { name: getSectionText(pendingDeleteCategory).name })}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('deleteCategoryModal.desc')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteCategory(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t('deleteCategoryModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCategory}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors shadow-sm"
              >
                {t('deleteCategoryModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Media Item Modal (fs.renameSync) */}
      {renamingMediaItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setRenamingMediaItem(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  {t('mediaRenameModal.title')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('mediaRenameModal.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRenamingMediaItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitRenameMedia} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('mediaRenameModal.label')}
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameMediaInput}
                  onChange={(e) => setRenameMediaInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingMediaItem(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('mediaRenameModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isRenamingMedia || !renameMediaInput.trim()}
                  className="px-5 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors shadow-sm shadow-sky-500/20"
                >
                  {t('mediaRenameModal.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move Media Item Modal (Select Target Media Directory & Subfolder) */}
      {movingMediaItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
          onClick={() => setMovingMediaItem(null)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                  {t('mediaMoveModal.title')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('mediaMoveModal.subtitle', { name: movingMediaItem.name })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingMediaItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitMoveMedia} className="p-6 space-y-4">
              {/* Step 1: Select Media Directory */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('mediaMoveModal.selectCategory')}
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                  {categories.map((cat) => {
                    const catText = getSectionText(cat);
                    const isSelected = targetMoveCategoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectMoveCategory(cat.id)}
                        className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-all truncate ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 shadow-2xs'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                        }`}
                      >
                        {catText.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Select Subfolder inside chosen Media Directory */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('mediaMoveModal.selectSubfolder')}
                </label>
                {moveTargetSubfolders.length === 0 ? (
                  <div className="p-3 rounded-lg bg-sky-50/50 dark:bg-slate-800/60 border border-sky-100 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                    {t('mediaMoveModal.autoCreateDefault')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {moveTargetSubfolders.map((sub) => {
                      const subDisp = getFolderDisplay(sub);
                      const isSelected = targetMoveFolderId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setTargetMoveFolderId(sub.id)}
                          className={`px-3 py-2 rounded-lg border text-left text-xs font-medium transition-all truncate ${
                            isSelected
                              ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 shadow-2xs'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                          }`}
                        >
                          {subDisp.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMovingMediaItem(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t('mediaMoveModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isMovingMedia || !targetMoveCategoryId}
                  className="px-5 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors shadow-sm shadow-sky-500/20"
                >
                  {t('mediaMoveModal.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* First-Launch Physical Vault Directory Setup Modal */}
      {showRootSetupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-sky-500 to-sky-400 text-white flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <HardDrive className="w-5 h-5 shrink-0" />
                <div>
                  <h3 className="font-bold text-base">{t('setupModal.title')}</h3>
                  <p className="text-xs text-sky-50 mt-0.5">
                    {t('setupModal.subtitle')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = toggleLang();
                  handleLanguageToggled(next);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-xs font-mono shrink-0"
                title={t('titlebar.langSwitchTitle')}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{lang === 'zh' ? '中/En' : 'En/中'}</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('setupModal.label')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={setupPathInput}
                    onChange={(e) => setSetupPathInput(e.target.value)}
                    placeholder={t('setupModal.placeholder')}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-sky-500 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
                  />
                  {isElectronEnv() && (
                    <button
                      type="button"
                      onClick={async () => {
                        const picked = await selectNativeDirectoryDialog();
                        if (picked) setSetupPathInput(picked);
                      }}
                      className="px-3 py-2 rounded-lg bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-slate-700 transition-colors flex items-center gap-1 shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
                      <span>{t('setupModal.browse')}</span>
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  {t('setupModal.descPrefix')}
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t('setupModal.descSections')}</span>
                  {t('setupModal.descSuffix')}
                </p>
              </div>
            </div>
            <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleConfirmFirstLaunchRoot}
                disabled={isInitializingVault || !setupPathInput.trim()}
                className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-xs font-semibold text-white transition-colors shadow-sm shadow-sky-500/20"
              >
                {isInitializingVault ? t('setupModal.creating') : t('setupModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Folder Deletion Modal (Safe Recycle Bin) */}
      {pendingDeleteFolder && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none"
          onClick={() => setPendingDeleteFolder(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-500 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {t('deleteFolderModal.title', { name: getFolderDisplay(pendingDeleteFolder).name })}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t('deleteFolderModal.desc')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteFolder(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t('deleteFolderModal.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDeleteFolderAction}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors shadow-sm"
              >
                {t('deleteFolderModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Fullscreen Immersive Lightbox Modal */}
      {lightboxItemId && (
        <LightboxModal
          items={activeLightboxList}
          currentItemId={lightboxItemId}
          onClose={() => setLightboxItemId(null)}
          onNavigate={(id) => setLightboxItemId(id)}
          onCopyItem={handleCopySingleItem}
        />
      )}

      {/* 5. Upload & Zero-Memory Streaming Batch Import Modal */}
      {showUploadModal && activeFolder && activeFolderDisplay && (
        <UploadModal
          folderId={activeFolder.id}
          folderName={activeFolderDisplay.name}
          sectionId={activeSectionId}
          onClose={() => setShowUploadModal(false)}
          onSaveItems={handleSaveUploadedItems}
        />
      )}

      {/* 6. Folder Create / Edit / Custom Cover Modal */}
      {showFolderModal && (
        <FolderModal
          sectionId={activeSectionId}
          sectionName={currentSectionText.name}
          existingFolder={editingFolder}
          availableMedia={allMedia}
          onClose={() => {
            setShowFolderModal(false);
            setEditingFolder(null);
          }}
          onSave={handleSaveFolder}
        />
      )}

      {/* 7. Settings & Password Management Modal */}
      {showSettingsModal && (
        <SettingsModal
          securityConfig={securityConfig}
          vaultRootPath={vaultRootPath}
          onChangeVaultRoot={handleChangeVaultRoot}
          onOpenRootInExplorer={handleOpenRootInExplorer}
          onClose={() => setShowSettingsModal(false)}
          onUpdateSecurity={handleSetPassword}
          onClearAllData={handleClearAllData}
          onLoadDemoPack={handleLoadDemoPack}
        />
      )}
    </div>
  );
}
