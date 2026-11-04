import React, { useState, useEffect } from 'react';
import { 
  Image as ImageIcon, 
  Sparkles, 
  Maximize2, 
  Activity, 
  Film, 
  Crown, 
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  ShieldCheck, 
  HardDrive,
  Lock,
  ExternalLink,
  Edit3,
  Trash2,
  Plus
} from 'lucide-react';
import { SectionId, SectionConfig, FolderItem, MediaItem } from '../types';
import { useI18n } from '../locales';

interface SidebarProps {
  categories: SectionConfig[];
  activeSectionId: SectionId;
  activeFolderId: string | null;
  onSelectSection: (id: SectionId) => void;
  onSelectSubfolder: (sectionId: SectionId, folder: FolderItem) => void;
  onCreateSubfolderInSection: (sectionId: SectionId) => void;
  folders: FolderItem[];
  allMedia: MediaItem[];
  onOpenCreateCategory: () => void;
  onRequestRenameCategory: (category: SectionConfig) => void;
  onRequestDeleteCategory: (category: SectionConfig) => void;
  onLockApp: () => void;
  isPasswordSet: boolean;
  vaultRootPath: string;
  onOpenRootInExplorer: () => void;
}

const ICONS: Record<string, React.FC<{ className?: string }>> = {
  Image: ImageIcon,
  Sparkles,
  Maximize2,
  Activity,
  Film,
  Crown,
  Folder,
};

export const Sidebar: React.FC<SidebarProps> = ({
  categories,
  activeSectionId,
  activeFolderId,
  onSelectSection,
  onSelectSubfolder,
  onCreateSubfolderInSection,
  folders,
  allMedia,
  onOpenCreateCategory,
  onRequestRenameCategory,
  onRequestDeleteCategory,
  onLockApp,
  isPasswordSet,
  vaultRootPath,
  onOpenRootInExplorer,
}) => {
  const { t, getSectionText, getFolderDisplay } = useI18n();

  // Track which main categories have their tree-view subfolder list expanded
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => ({
    [activeSectionId]: true,
  }));

  // Automatically ensure the active section is expanded when navigating into it
  useEffect(() => {
    if (activeSectionId) {
      setExpandedSections((prev) => ({
        ...prev,
        [activeSectionId]: true,
      }));
    }
  }, [activeSectionId]);

  const toggleExpandSection = (secId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedSections((prev) => ({
      ...prev,
      [secId]: !prev[secId],
    }));
  };

  // Context menu state for right-clicking a category
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    category: SectionConfig;
  } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const handleClose = () => setCtxMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
    };
  }, [ctxMenu]);

  // Compute counts per section & per folder
  const sectionCounts = categories.reduce((acc, sec) => {
    const secFolders = folders.filter((f) => f.sectionId === sec.id);
    const secMedia = allMedia.filter((m) => m.sectionId === sec.id);
    acc[sec.id] = {
      folders: secFolders.length,
      items: secMedia.length,
    };
    return acc;
  }, {} as Record<SectionId, { folders: number; items: number }>);

  const folderItemCounts = folders.reduce((acc, f) => {
    acc[f.id] = allMedia.filter((m) => m.folderId === f.id).length;
    return acc;
  }, {} as Record<string, number>);

  // Approximate storage calculation
  const totalBytes = allMedia.reduce((sum, item) => sum + (item.size || 0), 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

  return (
    <aside className="w-68 bg-white/95 dark:bg-slate-900/95 border-r border-sky-100 dark:border-slate-800 flex flex-col justify-between select-none shrink-0 backdrop-blur-sm transition-colors duration-200 relative">
      {/* Top: Dynamic Media Directory Tree-View Switcher */}
      <div className="p-3 space-y-2.5 flex-1 min-h-0 flex flex-col">
        {/* Navigation Group Header: "媒体目录" + "+ 新建" */}
        <div className="flex items-center justify-between px-2 pt-1 gap-2 shrink-0">
          <span className="text-xs font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400 truncate">
            {t('sidebar.sectionsHeader')}
          </span>
          <button
            onClick={onOpenCreateCategory}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 dark:bg-slate-800 hover:bg-sky-500 dark:hover:bg-sky-500 text-sky-600 dark:text-sky-400 hover:text-white dark:hover:text-white border border-sky-200/80 dark:border-slate-700 text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
            title={t('sidebar.addCategoryTitle')}
          >
            <span>{t('sidebar.addCategoryBtn')}</span>
          </button>
        </div>

        {/* Scrollable Dynamic Categories + Stacked Subfolder Tree-View */}
        <nav className="space-y-1 overflow-y-auto flex-1 pr-0.5">
          {categories.map((sec) => {
            const Icon = ICONS[sec.iconName] || Folder;
            const isSectionActive = activeSectionId === sec.id && !activeFolderId;
            const isSectionCurrentGroup = activeSectionId === sec.id;
            const isExpanded = !!expandedSections[sec.id];
            const counts = sectionCounts[sec.id] || { folders: 0, items: 0 };
            const secText = getSectionText(sec);
            const secSubfolders = folders.filter((f) => f.sectionId === sec.id);

            return (
              <div key={sec.id} className="space-y-0.5">
                {/* Main Category Row */}
                <div
                  onClick={() => {
                    if (activeSectionId === sec.id && !activeFolderId) {
                      toggleExpandSection(sec.id);
                    } else {
                      onSelectSection(sec.id);
                      setExpandedSections((prev) => ({ ...prev, [sec.id]: true }));
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCtxMenu({
                      x: Math.min(e.clientX, 180),
                      y: Math.min(e.clientY, window.innerHeight - 110),
                      category: sec,
                    });
                  }}
                  title={t('sidebar.rightClickHint')}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-all flex items-center justify-between group relative cursor-pointer ${
                    isSectionActive
                      ? 'bg-sky-50/95 dark:bg-sky-950/60 text-sky-950 dark:text-sky-100 font-semibold border border-sky-200/90 dark:border-sky-500/40 shadow-xs'
                      : isSectionCurrentGroup
                      ? 'bg-sky-50/50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-medium border border-sky-100/80 dark:border-slate-700/70'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-sky-50/40 dark:hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  {/* Active Indicator Bar */}
                  {isSectionCurrentGroup && (
                    <span className="absolute left-0 top-2 bottom-2 w-1 bg-sky-500 rounded-r-full shadow-sm shadow-sky-400" />
                  )}

                  <div className="flex items-center gap-1.5 min-w-0 pr-1.5">
                    {/* Expand / Collapse Chevron Button */}
                    <button
                      type="button"
                      onClick={(e) => toggleExpandSection(sec.id, e)}
                      className="p-0.5 rounded hover:bg-sky-100/80 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors shrink-0"
                      title={isExpanded ? t('sidebar.treeCollapse') : t('sidebar.treeExpand')}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-sky-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                        isSectionCurrentGroup
                          ? 'bg-sky-500 text-white shadow-xs shadow-sky-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 group-hover:bg-sky-50 dark:group-hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs truncate font-medium text-slate-800 dark:text-slate-100">
                        {secText.name}
                      </div>
                    </div>
                  </div>

                  {/* Counts */}
                  <div className="flex items-center gap-1 shrink-0 text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums whitespace-nowrap">
                    <span title={t('sidebar.folderCountTitle', { count: counts.folders })}>
                      {t('sidebar.folderCountUnit', { count: counts.folders })}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span title={t('sidebar.itemCountTitle', { count: counts.items })}>
                      {t('sidebar.itemCountUnit', { count: counts.items })}
                    </span>
                  </div>
                </div>

                {/* Stacked Subfolder Tree-View List underneath Expanded Category */}
                {isExpanded && (
                  <div className="ml-4 pl-2.5 border-l border-sky-200/70 dark:border-slate-800 space-y-0.5 py-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {secSubfolders.length === 0 ? (
                      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                        <span>{t('sidebar.noSubfolders')}</span>
                        <button
                          type="button"
                          onClick={() => onCreateSubfolderInSection(sec.id)}
                          className="text-sky-600 dark:text-sky-400 hover:underline font-medium flex items-center gap-0.5"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{t('sidebar.addCategoryBtn').replace('+ ', '')}</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        {secSubfolders.map((sub) => {
                          const isSubActive = activeFolderId === sub.id;
                          const subDisp = getFolderDisplay(sub);
                          const subCount = folderItemCounts[sub.id] || 0;

                          return (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => onSelectSubfolder(sec.id, sub)}
                              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center justify-between gap-2 transition-all cursor-pointer group/sub ${
                                isSubActive
                                  ? 'bg-sky-500 text-white font-semibold shadow-xs shadow-sky-500/20'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50/70 dark:hover:bg-slate-800/80'
                              }`}
                              title={`${secText.name} / ${subDisp.name}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isSubActive ? (
                                  <FolderOpen className="w-3.5 h-3.5 text-white shrink-0" />
                                ) : (
                                  <Folder className="w-3.5 h-3.5 text-sky-500/80 dark:text-sky-400/80 group-hover/sub:text-sky-600 shrink-0" />
                                )}
                                <span className="truncate text-[11px]">{subDisp.name}</span>
                              </div>
                              <span
                                className={`text-[10px] font-mono tabular-nums shrink-0 ${
                                  isSubActive
                                    ? 'text-sky-100'
                                    : 'text-slate-400 dark:text-slate-500 group-hover/sub:text-sky-600 dark:group-hover/sub:text-sky-400'
                                }`}
                              >
                                {subCount}
                              </span>
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => onCreateSubfolderInSection(sec.id)}
                          className="w-full text-left px-2.5 py-1 rounded-md text-[11px] text-slate-400 dark:text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50/40 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>{t('sidebar.newSubfolderHere')}</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Category Right-Click Context Menu */}
      {ctxMenu && (
        <div
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-40 bg-white/95 dark:bg-slate-900/95 border border-sky-100 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 text-xs backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1 text-[10px] font-mono text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 truncate">
            {getSectionText(ctxMenu.category).name}
          </div>
          <button
            type="button"
            onClick={() => {
              const target = ctxMenu.category;
              setCtxMenu(null);
              onRequestRenameCategory(target);
            }}
            className="w-full px-3 py-2 text-left text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-2 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('sidebar.ctxRename')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const target = ctxMenu.category;
              setCtxMenu(null);
              onRequestDeleteCategory(target);
            }}
            className="w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('sidebar.ctxDelete')}</span>
          </button>
        </div>
      )}

      {/* Bottom: Clickable Local Physical Storage Area & Lock */}
      <div className="p-3 border-t border-sky-100 dark:border-slate-800 space-y-3 bg-sky-50/30 dark:bg-slate-900/60 shrink-0">
        <button
          type="button"
          onClick={onOpenRootInExplorer}
          className="group w-full text-left px-2.5 py-2 rounded-lg bg-white dark:bg-slate-800/90 hover:bg-sky-50/80 dark:hover:bg-slate-800 border border-sky-100 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500 text-xs text-slate-500 dark:text-slate-400 space-y-1.5 shadow-xs hover:shadow-md hover:shadow-sky-500/10 transition-all cursor-pointer"
          title={t('sidebar.storageTitle', { path: vaultRootPath || t('sidebar.storageUnset') })}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300 group-hover:text-sky-700 dark:group-hover:text-sky-400 font-medium transition-colors">
              <HardDrive className="w-3.5 h-3.5 text-sky-500 group-hover:scale-110 transition-transform" />
              <span>{t('sidebar.storageLabel')}</span>
            </span>
            <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-sky-400 font-medium tabular-nums">
              <span>{totalMB} MB</span>
              <ExternalLink className="w-3 h-3 text-sky-500 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-sky-500 group-hover:bg-sky-600 rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.max(8, Number(totalMB) * 1.5))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-sky-600 dark:group-hover:text-sky-400 font-mono truncate pt-0.5">
            <span className="truncate max-w-[140px]">{vaultRootPath || t('sidebar.storageUnset')}</span>
            <span className="shrink-0 font-sans font-medium">{t('sidebar.openExplorer')}</span>
          </div>
        </button>

        {/* Security Quick Lock Status */}
        <div className="flex items-center justify-between px-2 pt-0.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 truncate">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-[11px] truncate">
              {isPasswordSet ? t('sidebar.passwordEnabled') : t('sidebar.passwordDisabled')}
            </span>
          </div>
          <button
            onClick={onLockApp}
            className="text-[11px] text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Lock className="w-3 h-3" />
            <span>{t('sidebar.lockNow')}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
