import React from 'react';
import { 
  ArrowLeft, 
  ChevronRight, 
  FolderPlus, 
  Upload, 
  ClipboardPaste, 
  Trash2, 
  ArrowUpDown,
  FolderOpen,
  CheckSquare,
  Square,
  RefreshCw
} from 'lucide-react';
import { SectionConfig, FolderItem, ClipboardState, ViewMode, SortOption } from '../types';
import { useI18n } from '../locales';

interface BreadcrumbBarProps {
  currentSection: SectionConfig;
  currentFolder: FolderItem | null;
  onNavigateToSectionRoot: () => void;
  onOpenUploadModal: () => void;
  onOpenNewFolderModal: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  clipboard: ClipboardState | null;
  onPasteClipboard: () => void;
  onClearClipboard: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  sortOption: SortOption;
  onChangeSortOption: (sort: SortOption) => void;
  selectedCount: number;
  totalMediaCount: number;
  onToggleSelectAll: () => void;
  onBatchDelete: () => void;
}

export const BreadcrumbBar: React.FC<BreadcrumbBarProps> = ({
  currentSection,
  currentFolder,
  onNavigateToSectionRoot,
  onOpenUploadModal,
  onOpenNewFolderModal,
  onRefresh,
  isRefreshing = false,
  clipboard,
  onPasteClipboard,
  onClearClipboard,
  viewMode,
  onChangeViewMode,
  sortOption,
  onChangeSortOption,
  selectedCount,
  totalMediaCount,
  onToggleSelectAll,
  onBatchDelete,
}) => {
  const { t, getSectionText, getFolderDisplay } = useI18n();
  const secText = getSectionText(currentSection);
  const folderDisplay = currentFolder ? getFolderDisplay(currentFolder) : null;

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 border-b border-sky-100 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs select-none backdrop-blur-sm shadow-2xs transition-colors duration-200">
      {/* Left: Breadcrumb Path */}
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={onNavigateToSectionRoot}
          className={`flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap cursor-pointer ${
            !currentFolder
              ? 'text-slate-900 dark:text-slate-100 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'
          }`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentSection.accentColor }} />
          <span>{secText.name}</span>
        </button>

        {currentFolder && folderDisplay && (
          <>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
            <div className="flex items-center gap-1.5 text-sky-950 dark:text-sky-200 font-semibold truncate bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded border border-sky-200/80 dark:border-sky-500/30 shadow-2xs">
              <FolderOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span className="truncate max-w-[200px]">{folderDisplay.name}</span>
            </div>
          </>
        )}
      </div>

      {/* Middle & Right: Operations, Refresh, Sorting & Returning to Upper Level */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Clipboard Notice Bar if there are copied items */}
        {clipboard && clipboard.items.length > 0 && currentFolder && (
          <div className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-500/40 px-2.5 py-1 rounded-md text-[11px] animate-fadeIn shadow-xs whitespace-nowrap">
            <ClipboardPaste className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('breadcrumb.clipboardPending', { count: clipboard.items.length })}</span>
            <button
              onClick={onPasteClipboard}
              className="ml-1 px-2 py-0.5 bg-sky-500 hover:bg-sky-600 text-white rounded font-medium transition-colors shadow-2xs cursor-pointer"
            >
              {t('breadcrumb.pasteCopy')}
            </button>
            <button
              onClick={onClearClipboard}
              className="ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1 cursor-pointer"
              title={t('breadcrumb.clearClipboardTitle')}
            >
              {t('breadcrumb.cancel')}
            </button>
          </div>
        )}

        {/* Batch Selection Action */}
        {currentFolder && totalMediaCount > 0 && (
          <div className="flex items-center gap-1 border-r border-slate-200 dark:border-slate-700 pr-2 whitespace-nowrap">
            <button
              onClick={onToggleSelectAll}
              className="flex items-center gap-1 px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-[11px] transition-colors cursor-pointer"
              title={selectedCount === totalMediaCount ? t('breadcrumb.deselectAllTitle') : t('breadcrumb.selectAllTitle')}
            >
              {selectedCount === totalMediaCount && totalMediaCount > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-sky-500" />
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>
                {selectedCount > 0
                  ? t('breadcrumb.selectedCount', { count: selectedCount })
                  : t('breadcrumb.selectAll')}
              </span>
            </button>

            {selectedCount > 0 && (
              <button
                onClick={onBatchDelete}
                className="flex items-center gap-1 px-2 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded text-[11px] transition-colors font-medium cursor-pointer"
                title={t('breadcrumb.batchDeleteTitle')}
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('breadcrumb.batchDelete')}</span>
              </button>
            )}
          </div>
        )}

        {/* Sort Options Control (Visible when inside a folder view) */}
        {currentFolder && (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-md px-2 py-0.5 border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
            <ArrowUpDown className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">{t('breadcrumb.sortLabel')}</span>
            <select
              value={sortOption}
              onChange={(e) => onChangeSortOption(e.target.value as SortOption)}
              className="bg-transparent dark:bg-slate-800 text-[11px] font-semibold text-sky-800 dark:text-sky-300 outline-none cursor-pointer py-0.5 pr-1"
              title={t('breadcrumb.sortTitle')}
            >
              <option value="date-desc">{t('breadcrumb.sort.dateDesc')}</option>
              <option value="date-asc">{t('breadcrumb.sort.dateAsc')}</option>
              <option value="name-asc">{t('breadcrumb.sort.nameAsc')}</option>
              <option value="name-desc">{t('breadcrumb.sort.nameDesc')}</option>
              <option value="size-desc">{t('breadcrumb.sort.sizeDesc')}</option>
              <option value="size-asc">{t('breadcrumb.sort.sizeAsc')}</option>
            </select>
          </div>
        )}

        {/* View Density Switch */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-md p-0.5 border border-slate-200/80 dark:border-slate-700 whitespace-nowrap">
          <button
            onClick={() => onChangeViewMode('compact')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
              viewMode === 'compact'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={t('breadcrumb.view.compactTitle')}
          >
            {t('breadcrumb.view.compact')}
          </button>
          <button
            onClick={() => onChangeViewMode('normal')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
              viewMode === 'normal'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={t('breadcrumb.view.normalTitle')}
          >
            {t('breadcrumb.view.normal')}
          </button>
          <button
            onClick={() => onChangeViewMode('spacious')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all cursor-pointer ${
              viewMode === 'spacious'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
            title={t('breadcrumb.view.spaciousTitle')}
          >
            {t('breadcrumb.view.spacious')}
          </button>
        </div>

        {/* Action: Manual Refresh Physical Directory Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-300 border border-slate-200 dark:border-slate-700 hover:border-sky-300 transition-colors shadow-2xs font-medium whitespace-nowrap cursor-pointer"
          title={t('breadcrumb.refreshTitle')}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{t('breadcrumb.refresh')}</span>
        </button>

        {/* Action: New Subfolder */}
        <button
          onClick={onOpenNewFolderModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-sky-300 border border-slate-200 dark:border-slate-700 hover:border-sky-300 transition-colors shadow-2xs font-medium whitespace-nowrap cursor-pointer"
          title={t('breadcrumb.newFolderTitle')}
        >
          <FolderPlus className="w-3.5 h-3.5 text-sky-500" />
          <span>{t('breadcrumb.newFolder')}</span>
        </button>

        {/* Action: Import / Upload Media */}
        {currentFolder && (
          <button
            onClick={onOpenUploadModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-600 text-white font-medium shadow-sm shadow-sky-500/20 transition-colors whitespace-nowrap cursor-pointer"
            title={t('breadcrumb.importMediaTitle')}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t('breadcrumb.importMedia')}</span>
          </button>
        )}

        {/* Top-Right Up One Level Button */}
        {currentFolder && (
          <button
            onClick={onNavigateToSectionRoot}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-medium shadow-sm shadow-sky-500/20 transition-all whitespace-nowrap cursor-pointer"
            title={t('breadcrumb.backUpperTitle')}
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{t('breadcrumb.backUpper')}</span>
          </button>
        )}
      </div>
    </div>
  );
};
