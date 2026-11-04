import React from 'react';
import { 
  Folder, 
  FolderOpen, 
  MoreVertical, 
  Edit3, 
  Trash2, 
  Camera,
  Layers
} from 'lucide-react';
import { FolderItem } from '../types';
import { useI18n } from '../locales';

interface FolderCardProps {
  folder: FolderItem;
  itemCount: number;
  previewImages: string[];
  onOpenFolder: (f: FolderItem) => void;
  onEditFolder: (f: FolderItem) => void;
  onDeleteFolder: (folderId: string) => void;
  onChangeCover: (f: FolderItem) => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  itemCount,
  previewImages,
  onOpenFolder,
  onEditFolder,
  onDeleteFolder,
  onChangeCover,
}) => {
  const { lang, t, getFolderDisplay } = useI18n();
  const [showMenu, setShowMenu] = React.useState(false);

  const display = getFolderDisplay(folder);

  React.useEffect(() => {
    if (!showMenu) return;
    const handleClick = () => setShowMenu(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showMenu]);

  const effectiveCover = folder.coverUrl || (previewImages.length > 0 ? previewImages[0] : null);

  return (
    <div 
      className="group relative bg-white dark:bg-slate-900 hover:bg-sky-50/30 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-sky-500/10 flex flex-col cursor-pointer shadow-xs"
      onClick={() => onOpenFolder(folder)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowMenu(true);
      }}
    >
      {/* Folder Visual Header / Custom Cover Area */}
      <div className="relative aspect-video w-full bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-200/80 dark:border-slate-800">
        {effectiveCover ? (
          <img
            src={effectiveCover}
            alt={display.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100/60 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
            <div className="relative">
              <Folder className="w-14 h-14 text-sky-400 group-hover:text-sky-500 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Layers className="w-6 h-6 text-sky-600/60 dark:text-sky-400/60" />
              </div>
            </div>
            <span className="text-[11px] text-sky-700/70 dark:text-sky-400/70 mt-2 font-mono">{t('folderCard.noCover')}</span>
          </div>
        )}

        {/* Top Badges & Quick Cover Setting Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Top right menu button */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChangeCover(folder);
            }}
            className="p-1.5 rounded-md bg-white/95 dark:bg-slate-900/95 hover:bg-sky-500 dark:hover:bg-sky-500 text-slate-700 dark:text-slate-200 hover:text-white backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all text-xs flex items-center gap-1 shadow-sm border border-slate-200/60 dark:border-slate-700"
            title={t('folderCard.changeCoverTitle')}
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="text-[10px] pr-0.5">{t('folderCard.changeCoverBtn')}</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1.5 rounded-md bg-white/95 dark:bg-slate-900/95 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 backdrop-blur-md transition-colors border border-slate-200/60 dark:border-slate-700 shadow-xs"
            title={t('folderCard.moreActionsTitle')}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dropdown Menu */}
        {showMenu && (
          <div
            className="absolute top-9 right-2 w-44 bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-700 rounded-lg shadow-xl py-1 text-xs z-30 animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setShowMenu(false);
                onChangeCover(folder);
              }}
              className="w-full px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-700 dark:hover:text-sky-400 flex items-center gap-2"
            >
              <Camera className="w-3.5 h-3.5 text-sky-500" />
              <span>{t('folderCard.menuSetCover')}</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onEditFolder(folder);
              }}
              className="w-full px-3 py-1.5 text-left text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-700 dark:hover:text-sky-400 flex items-center gap-2"
            >
              <Edit3 className="w-3.5 h-3.5 text-sky-500" />
              <span>{t('folderCard.menuEdit')}</span>
            </button>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
            <button
              onClick={() => {
                setShowMenu(false);
                onDeleteFolder(folder.id);
              }}
              className="w-full px-3 py-1.5 text-left text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('folderCard.menuDelete')}</span>
            </button>
          </div>
        )}

        {/* Bottom Left: Item Count Badge */}
        <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-200 font-mono bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2 py-0.5 rounded border border-slate-200/80 dark:border-slate-700 shadow-xs">
          <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
          <span>{t('folderCard.itemCountBadge', { count: itemCount })}</span>
        </div>
      </div>

      {/* Folder Metadata Footer */}
      <div className="p-3.5 flex flex-col justify-between flex-1 bg-white dark:bg-slate-900 transition-colors">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm tracking-tight group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors truncate">
            {display.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
            {display.description || t('folderCard.noDescription')}
          </p>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 font-mono tabular-nums">
          <span>{new Date(folder.createdAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
          <span className="text-sky-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-sans font-medium">
            {t('folderCard.enterFolder')}
          </span>
        </div>
      </div>
    </div>
  );
};
