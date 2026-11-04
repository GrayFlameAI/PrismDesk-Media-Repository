import React, { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  Copy, 
  Check
} from 'lucide-react';
import { MediaItem } from '../types';
import { useI18n } from '../locales';

interface LightboxModalProps {
  items: MediaItem[];
  currentItemId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onCopyItem: (item: MediaItem) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  items,
  currentItemId,
  onClose,
  onNavigate,
  onCopyItem,
}) => {
  const { t } = useI18n();
  const currentIndex = items.findIndex((i) => i.id === currentItemId);
  const currentItem = items[currentIndex] || items[0];

  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [copied, setCopied] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const releaseVideoHandle = React.useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.removeAttribute('src');
      v.src = '';
      v.load();
    } catch {}
  }, []);

  const handleCloseModal = React.useCallback(() => {
    releaseVideoHandle();
    onClose();
  }, [releaseVideoHandle, onClose]);

  const handleNavigateItem = React.useCallback(
    (id: string) => {
      releaseVideoHandle();
      onNavigate(id);
    },
    [releaseVideoHandle, onNavigate]
  );

  // Reset zoom & rotation on item change and release video handle on unmount
  useEffect(() => {
    setZoomLevel(1);
    setRotation(0);
    return () => {
      releaseVideoHandle();
    };
  }, [currentItemId, releaseVideoHandle]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseModal();
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        handleNavigateItem(items[currentIndex - 1].id);
      }
      if (e.key === 'ArrowRight' && currentIndex < items.length - 1) {
        handleNavigateItem(items[currentIndex + 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items, handleCloseModal, handleNavigateItem]);

  if (!currentItem) return null;

  const handleCopy = () => {
    onCopyItem(currentItem);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentItem.url;
    a.download = currentItem.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col justify-between select-none animate-in fade-in duration-200"
      onClick={handleCloseModal}
    >
      {/* Top Header Bar */}
      <div 
        className="h-14 px-6 flex items-center justify-between border-b border-white/10 bg-black/40 text-white z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm tracking-tight truncate max-w-md">
            {currentItem.name}
          </span>
          <span className="text-xs text-white/50 font-mono tabular-nums">
            {currentIndex + 1} / {items.length}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Zoom controls for images */}
          {currentItem.type === 'image' && (
            <div className="flex items-center bg-white/10 rounded-lg p-0.5 border border-white/10 mr-2">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                className="p-1.5 hover:bg-white/15 rounded text-white/80 hover:text-white transition-colors"
                title={t('lightbox.zoomOut')}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-2 text-white/70 tabular-nums">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                className="p-1.5 hover:bg-white/15 rounded text-white/80 hover:text-white transition-colors"
                title={t('lightbox.zoomIn')}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1.5 hover:bg-white/15 rounded text-white/80 hover:text-white transition-colors"
                title={t('lightbox.rotate')}
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white border border-white/10 transition-colors"
            title={t('lightbox.copyTitle')}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('lightbox.copied') : t('lightbox.copy')}</span>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-xs text-white transition-colors shadow-sm"
            title={t('lightbox.downloadTitle')}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('lightbox.download')}</span>
          </button>

          {/* Close */}
          <button
            onClick={handleCloseModal}
            className="p-2 ml-2 rounded-lg bg-white/10 hover:bg-rose-600 text-white transition-colors"
            title={t('lightbox.closeTitle')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div 
        className="flex-1 relative flex items-center justify-center p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navigation Arrows */}
        {currentIndex > 0 && (
          <button
            onClick={() => handleNavigateItem(items[currentIndex - 1].id)}
            className="absolute left-6 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-sky-500 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 shadow-xl"
            title={t('lightbox.prevTitle')}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {currentIndex < items.length - 1 && (
          <button
            onClick={() => handleNavigateItem(items[currentIndex + 1].id)}
            className="absolute right-6 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-sky-500 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-105 shadow-xl"
            title={t('lightbox.nextTitle')}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Media Content */}
        <div 
          className="max-w-full max-h-full flex items-center justify-center transition-transform duration-200"
          style={{
            transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
          }}
        >
          {currentItem.type === 'video' ? (
            <video
              ref={videoRef}
              src={currentItem.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="max-h-[80vh] max-w-[85vw] rounded-lg shadow-2xl bg-black"
            />
          ) : (
            <img
              src={currentItem.url}
              alt={currentItem.name}
              className="max-h-[80vh] max-w-[85vw] object-contain rounded-lg shadow-2xl transition-all"
            />
          )}
        </div>
      </div>

      {/* Bottom Specs Bar */}
      <div 
        className="h-12 px-6 flex items-center justify-between border-t border-white/10 bg-black/40 text-xs text-white/60 font-mono tabular-nums"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span>{t('lightbox.resolution', { value: currentItem.dimensions || t('mediaCard.hdFormat') })}</span>
          <span>·</span>
          <span>{t('lightbox.size', { value: currentItem.sizeFormatted })}</span>
          <span>·</span>
          <span>{currentItem.type === 'video' ? t('lightbox.formatVideo') : t('lightbox.formatImage')}</span>
        </div>
        <div className="text-white/40 text-[11px] font-sans">
          {t('lightbox.shortcutHint')}
        </div>
      </div>
    </div>
  );
};
