import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  Image as ImageIcon, 
  Film, 
  FolderSync,
  AlertCircle,
  HardDrive
} from 'lucide-react';
import { SectionId } from '../types';
import { 
  PhysicalImportPayload, 
  isElectronEnv, 
  selectNativeMediaFilesDialog, 
  formatFileSize,
  extractNativeFilePath,
  isMediaFile
} from '../utils/storage';
import { useI18n } from '../locales';

interface UploadModalProps {
  folderId: string;
  folderName: string;
  sectionId: SectionId;
  onClose: () => void;
  onSaveItems: (items: PhysicalImportPayload[]) => Promise<void>;
}

interface PendingImportEntry {
  name: string;
  size: number;
  type: 'image' | 'video';
  sourcePath?: string;
  file?: File;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  folderName,
  onClose,
  onSaveItems,
}) => {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingImportEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleNativePicker = async () => {
    setErrorMsg('');
    try {
      const picked = await selectNativeMediaFilesDialog();
      if (picked.length > 0) {
        setPendingFiles((prev) => [
          ...prev,
          ...picked.map((p) => ({
            name: p.name,
            size: p.size,
            type: p.type,
            sourcePath: p.sourcePath,
          })),
        ]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('uploadModal.errorDefault'));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg('');
    const newItems: PendingImportEntry[] = [];

    Array.from(files).forEach((file) => {
      const check = isMediaFile(file.name);
      const isVideo = file.type.startsWith('video/') || check.type === 'video' && check.isMedia;
      const isImage = file.type.startsWith('image/') || check.type === 'image' && check.isMedia;

      if (isVideo || isImage) {
        const nativePath = extractNativeFilePath(file);
        newItems.push({
          name: file.name,
          size: file.size || 0,
          type: isVideo ? 'video' : 'image',
          sourcePath: nativePath || undefined,
          // Never load into FileReader when nativePath exists
          file: nativePath ? undefined : file,
        });
      }
    });

    if (newItems.length > 0) {
      setPendingFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleRemovePending = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleCommitLocalUpload = async () => {
    if (pendingFiles.length === 0) return;
    setIsProcessing(true);
    setErrorMsg('');

    try {
      const payloads: PhysicalImportPayload[] = [];

      for (const pf of pendingFiles) {
        // ZERO-MEMORY FAST PATH: When sourcePath exists (Electron native path),
        // never read file into memory or create ArrayBuffer/DataURL.
        // Main process streams directly from pf.sourcePath via fs.createReadStream -> fs.createWriteStream.
        if (pf.sourcePath) {
          payloads.push({
            name: pf.name,
            type: pf.type,
            sourcePath: pf.sourcePath,
            dimensions: pf.type === 'video' ? '1920 × 1080' : '高清原图',
            durationFormatted: pf.type === 'video' ? '00:15' : undefined,
          });
          continue;
        }

        // Browser preview fallback (only for small files when running in web browser without Electron file.path)
        let base64Data: string | undefined = undefined;
        if (pf.file && pf.size <= 35 * 1024 * 1024) {
          base64Data = await fileToDataUrl(pf.file);
        }

        payloads.push({
          name: pf.name,
          type: pf.type,
          base64Data,
          dimensions: '1920 × 1080',
          durationFormatted: pf.type === 'video' ? '00:15' : undefined,
        });
      }

      await onSaveItems(payloads);
      onClose();
    } catch (err: any) {
      console.error('Upload failed:', err);
      setErrorMsg(err?.message || t('uploadModal.errorDefault'));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div 
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <FolderSync className="w-4 h-4 text-sky-500" />
              <span>{t('uploadModal.title', { name: folderName })}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('uploadModal.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Native System File Picker Button in Electron */}
          {isElectronEnv() && (
            <button
              type="button"
              onClick={handleNativePicker}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-800 text-xs font-semibold text-sky-700 dark:text-sky-300 flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
            >
              <HardDrive className="w-4 h-4 text-sky-500" />
              <span>{t('uploadModal.nativePickerBtn')}</span>
            </button>
          )}

          {/* Drag Drop Area */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (isElectronEnv()) {
                handleNativePicker();
              } else {
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
              isDragging
                ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 scale-[0.99]'
                : 'border-slate-300 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-sky-50/30 dark:hover:bg-sky-950/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.mkv,.mov,.avi,.webm,.mp4"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/50 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400 mb-3 shadow-inner">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 text-center">
              {t('uploadModal.dropTitle')}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">
              {t('uploadModal.dropSubtitle')}
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-600 dark:text-rose-400 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pending Files List */}
          {pendingFiles.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 font-mono">
                <span>{t('uploadModal.pendingCount', { count: pendingFiles.length })}</span>
                <button
                  onClick={() => setPendingFiles([])}
                  className="text-rose-500 hover:text-rose-600 font-medium font-sans cursor-pointer"
                >
                  {t('uploadModal.clearList')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {pendingFiles.map((pf, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs shadow-2xs"
                  >
                    <div className="flex items-center gap-2 truncate mr-2">
                      {pf.type === 'video' ? (
                        <Film className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="truncate text-slate-700 dark:text-slate-200 font-mono text-[11px] font-medium" title={pf.sourcePath || pf.name}>
                          {pf.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                          {formatFileSize(pf.size)} · {t('uploadModal.streamingBadge')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemovePending(idx)}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50/80 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            {t('uploadModal.cancel')}
          </button>
          <button
            onClick={handleCommitLocalUpload}
            disabled={isProcessing || pendingFiles.length === 0}
            className="px-5 py-2 rounded-lg text-xs font-medium bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white transition-colors shadow-sm shadow-sky-500/20 flex items-center gap-1.5 cursor-pointer"
          >
            {isProcessing ? t('uploadModal.processing') : t('uploadModal.confirm', { count: pendingFiles.length })}
          </button>
        </div>
      </div>
    </div>
  );
};
