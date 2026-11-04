import React, { useState, useRef } from 'react';
import { 
  X, 
  Camera, 
  Image as ImageIcon, 
  Upload
} from 'lucide-react';
import { FolderItem, SectionId, MediaItem } from '../types';
import { useI18n } from '../locales';

interface FolderModalProps {
  sectionId: SectionId;
  sectionName: string;
  existingFolder?: FolderItem | null;
  availableMedia?: MediaItem[];
  onClose: () => void;
  onSave: (folder: FolderItem) => Promise<void>;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  sectionId,
  sectionName,
  existingFolder,
  availableMedia = [],
  onClose,
  onSave,
}) => {
  const { t, getFolderDisplay } = useI18n();
  const initialDisplay = existingFolder ? getFolderDisplay(existingFolder) : { name: '', description: '' };

  const [name, setName] = useState(initialDisplay.name);
  const [description, setDescription] = useState(initialDisplay.description);
  const [coverUrl, setCoverUrl] = useState(existingFolder?.coverUrl || '');
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(undefined);
  const [coverSourceFilePath, setCoverSourceFilePath] = useState<string | undefined>(undefined);
  const [clearCover, setClearCover] = useState(false);
  const [coverSourceTab, setCoverSourceTab] = useState<'upload' | 'select' | 'url'>('upload');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLocalCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setCoverUrl(base64);
        setCoverDataUrl(base64);
        setCoverSourceFilePath(undefined);
        setClearCover(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const folderToSave: FolderItem = {
        id: existingFolder?.id || `folder-${Date.now()}`,
        sectionId,
        name: name.trim(),
        description: description.trim() || undefined,
        coverUrl: coverUrl.trim() || undefined,
        coverDataUrl,
        coverSourceFilePath,
        clearCover,
        createdAt: existingFolder?.createdAt || Date.now(),
      };

      await onSave(folderToSave);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
              {existingFolder ? t('folderModal.editTitle') : t('folderModal.newTitle')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('folderModal.subtitle', { section: sectionName })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Folder Name */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('folderModal.nameLabel')} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={t('folderModal.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all shadow-inner focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
            />
          </div>

          {/* Folder Description */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('folderModal.descLabel')}
            </label>
            <input
              type="text"
              placeholder={t('folderModal.descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all shadow-inner focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
            />
          </div>

          {/* Custom Cover Art Section */}
          <div className="border border-sky-100 dark:border-slate-800 rounded-xl p-3 bg-sky-50/40 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-sky-500" />
                <span>{t('folderModal.coverLabel')}</span>
              </label>
              {coverUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setCoverUrl('');
                    setCoverDataUrl(undefined);
                    setCoverSourceFilePath(undefined);
                    setClearCover(true);
                  }}
                  className="text-[11px] text-rose-500 hover:text-rose-600 font-medium"
                >
                  {t('folderModal.clearCover')}
                </button>
              )}
            </div>

            {/* Live Cover Preview */}
            <div className="relative aspect-video w-full rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt="Cover preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-slate-400 dark:text-slate-500 text-xs px-4">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 text-slate-300 dark:text-slate-600" />
                  <span>{t('folderModal.noCoverSpecified')}</span>
                </div>
              )}
            </div>

            {/* Source switch */}
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setCoverSourceTab('upload')}
                className={`flex-1 py-1.5 px-2 rounded-md border text-center transition-all ${
                  coverSourceTab === 'upload'
                    ? 'border-sky-500 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {t('folderModal.tabUpload')}
              </button>
              <button
                type="button"
                onClick={() => setCoverSourceTab('select')}
                className={`flex-1 py-1.5 px-2 rounded-md border text-center transition-all ${
                  coverSourceTab === 'select'
                    ? 'border-sky-500 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {t('folderModal.tabSelect')}
              </button>
              <button
                type="button"
                onClick={() => setCoverSourceTab('url')}
                className={`flex-1 py-1.5 px-2 rounded-md border text-center transition-all ${
                  coverSourceTab === 'url'
                    ? 'border-sky-500 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                {t('folderModal.tabUrl')}
              </button>
            </div>

            {/* Tab Inputs */}
            {coverSourceTab === 'upload' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLocalCoverUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-xs text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors shadow-2xs font-medium"
                >
                  <Upload className="w-3.5 h-3.5 text-sky-500" />
                  <span>{t('folderModal.uploadBtn')}</span>
                </button>
              </div>
            )}

            {coverSourceTab === 'select' && (
              <div className="space-y-1">
                {availableMedia.filter((m) => m.type === 'image').length === 0 ? (
                  <div className="text-center py-3 text-xs text-slate-400 dark:text-slate-500">
                    {t('folderModal.noMediaToSelect')}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5 max-h-28 overflow-y-auto pr-1">
                    {availableMedia
                      .filter((m) => m.type === 'image')
                      .slice(0, 12)
                      .map((media) => (
                        <div
                          key={media.id}
                          onClick={() => {
                            setCoverUrl(media.url);
                            setCoverSourceFilePath(media.filePath);
                            setCoverDataUrl(undefined);
                            setClearCover(false);
                          }}
                          className={`aspect-video rounded overflow-hidden cursor-pointer border relative ${
                            coverUrl === media.url ? 'border-sky-500 ring-2 ring-sky-500/40' : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <img src={media.url} alt="" className="w-full h-full object-cover" />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {coverSourceTab === 'url' && (
              <input
                type="url"
                placeholder="https://example.com/cover.jpg"
                value={coverUrl}
                onChange={(e) => {
                  setCoverUrl(e.target.value);
                  setCoverDataUrl(undefined);
                  setCoverSourceFilePath(undefined);
                  setClearCover(false);
                }}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
              />
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {t('folderModal.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-5 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors shadow-sm shadow-sky-500/20"
            >
              {isSaving ? t('folderModal.saving') : t('folderModal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
