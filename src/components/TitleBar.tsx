import React from 'react';
import { 
  Sparkles, 
  Lock, 
  Search, 
  Minus, 
  Square, 
  X, 
  Settings, 
  FolderOpen,
  Globe,
  Sun,
  Moon
} from 'lucide-react';
import { 
  isElectronEnv, 
  minimizeAppWindow, 
  toggleMaximizeAppWindow, 
  closeAppWindow 
} from '../utils/storage';
import { ThemeMode } from '../types';
import { useI18n } from '../locales';

interface TitleBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onLockApp: () => void;
  onOpenSettings: () => void;
  isPasswordSet: boolean;
  theme: ThemeMode;
  onToggleTheme: () => void;
  vaultRootPath?: string;
  onOpenRootInExplorer?: () => void;
  onLanguageToggled?: (nextLang: 'zh' | 'en') => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  searchQuery,
  onSearchChange,
  onLockApp,
  onOpenSettings,
  isPasswordSet,
  theme,
  onToggleTheme,
  vaultRootPath,
  onOpenRootInExplorer,
  onLanguageToggled,
}) => {
  const { lang, toggleLang, t } = useI18n();
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;
  const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  const handleToggleLanguage = () => {
    const next = toggleLang();
    if (onLanguageToggled) {
      onLanguageToggled(next);
    }
  };

  return (
    <header 
      style={dragStyle}
      className="app-region-drag h-10 bg-white/95 dark:bg-slate-900/95 border-b border-sky-100 dark:border-slate-800 select-none flex items-center justify-between px-3 text-xs text-slate-600 dark:text-slate-300 shrink-0 z-40 backdrop-blur-md shadow-xs transition-colors duration-200"
    >
      {/* Left: Window Icon & Title */}
      <div className="flex items-center gap-2.5 min-w-[200px] shrink-0">
        <div className="w-5 h-5 rounded bg-gradient-to-tr from-sky-500 to-sky-400 flex items-center justify-center text-white shadow-sm shadow-sky-500/20">
          <Sparkles className="w-3 h-3" />
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{t('app.name')}</span>
          <span className="text-slate-400 dark:text-slate-600">·</span>
          <span className="text-sky-600 dark:text-sky-400 font-medium text-[11px]">{t('app.editionBadge')}</span>
        </div>
      </div>

      {/* Middle: Quick Search Input & Windows Command Bar (no-drag) */}
      <div style={noDragStyle} className="app-region-no-drag flex-1 max-w-md mx-4">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('titlebar.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-sky-500 dark:focus:border-sky-400 rounded-md py-1 pl-8 pr-3 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all shadow-inner focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-500/20"
          />
          {searchQuery && (
            <button 
              onClick={() => onSearchChange('')}
              className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title={t('titlebar.clearSearch')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Quick Actions (Theme Toggle, Language, Lock, Settings) & Window Controls (no-drag) */}
      <div style={noDragStyle} className="app-region-no-drag flex items-center gap-1 shrink-0 whitespace-nowrap">
        {/* Quick Open Root Folder */}
        {vaultRootPath && onOpenRootInExplorer && (
          <button
            onClick={onOpenRootInExplorer}
            className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
            title={t('titlebar.localFolderTitle', { path: vaultRootPath })}
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
            <span className="text-[11px] font-medium">{t('titlebar.localFolder')}</span>
          </button>
        )}

        {/* Prominent Bilingual Language Switcher (中/En) */}
        <button
          onClick={handleToggleLanguage}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-sky-50 dark:bg-slate-800 hover:bg-sky-500 dark:hover:bg-sky-500 text-sky-700 dark:text-sky-400 hover:text-white dark:hover:text-white border border-sky-200/90 dark:border-slate-700 hover:border-sky-500 transition-all shadow-2xs font-medium mx-0.5 cursor-pointer"
          title={t('titlebar.langSwitchTitle')}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="text-[11px] font-mono tracking-tight">
            <span className={lang === 'zh' ? 'font-bold' : 'opacity-70'}>中</span>
            <span className="mx-0.5 opacity-50">/</span>
            <span className={lang === 'en' ? 'font-bold' : 'opacity-70'}>En</span>
          </span>
        </button>

        {/* Sun / Moon Day-Night Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-md text-slate-600 dark:text-amber-400 hover:text-sky-600 dark:hover:text-amber-300 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title={theme === 'light' ? t('titlebar.themeLightTitle') : t('titlebar.themeDarkTitle')}
        >
          {theme === 'light' ? (
            <Moon className="w-3.5 h-3.5 text-sky-600" />
          ) : (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          )}
        </button>

        {/* Lock Screen */}
        <button
          onClick={onLockApp}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors"
          title={isPasswordSet ? t('titlebar.lockTitleSet') : t('titlebar.lockTitleUnset')}
        >
          <Lock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span className="hidden sm:inline text-[11px] font-medium">{t('titlebar.lock')}</span>
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 transition-colors mr-1.5"
          title={t('titlebar.settingsTitle')}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Windows 11 Native Look Window Controls */}
        <div className="flex items-center -mr-1 border-l border-slate-200/80 dark:border-slate-800 pl-1">
          <button 
            onClick={() => minimizeAppWindow()}
            className="w-10 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 transition-colors rounded-none"
            title={t('titlebar.minimize')}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => toggleMaximizeAppWindow()}
            className="w-10 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100 transition-colors rounded-none"
            title={t('titlebar.maximize')}
          >
            <Square className="w-3 h-3" />
          </button>
          <button 
            onClick={() => {
              if (isElectronEnv()) {
                closeAppWindow();
              } else {
                onLockApp();
              }
            }}
            className="w-10 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-rose-500 hover:text-white transition-colors rounded-none"
            title={t('titlebar.close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
