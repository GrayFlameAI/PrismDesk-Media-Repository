import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Play, 
  Film, 
  Maximize2, 
  Copy, 
  Trash2, 
  Check, 
  Camera
} from 'lucide-react';
import { MediaItem } from '../types';
import { useI18n } from '../locales';

interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (item: MediaItem) => void;
  onCopyItem: (item: MediaItem) => void;
  onDeleteItem: (id: string) => void;
  onSetAsFolderCover?: (item: MediaItem) => void;
  onContextMenuItem?: (e: React.MouseEvent, item: MediaItem) => void;
}

interface ExtractedVideoMeta {
  posterDataUrl: string;
  durationFormatted?: string;
  dimensions?: string;
}

// Persistent in-memory cache of lightweight static JPEG Base64 thumbnails (~12KB each)
const MAX_POSTER_CACHE = 300;
const videoPosterCache = new Map<string, ExtractedVideoMeta>();
const inFlightExtractions = new Map<string, Promise<ExtractedVideoMeta | null>>();

// Concurrency-controlled queue (max 2 offscreen <video> extractors at a time)
// Ensures 30+ videos never spike memory while generating 1s first-frame thumbnails,
// and immediately destroys each temporary <video> right after canvas snapshot.
const MAX_CONCURRENT_EXTRACTIONS = 2;
let activeExtractions = 0;
const extractionQueue: Array<() => void> = [];

function runNextExtraction() {
  while (activeExtractions < MAX_CONCURRENT_EXTRACTIONS && extractionQueue.length > 0) {
    const nextJob = extractionQueue.shift();
    if (nextJob) {
      activeExtractions += 1;
      nextJob();
    }
  }
}

function formatDurationSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:15';
  const totalSec = Math.max(1, Math.round(sec));
  const mins = Math.floor(totalSec / 60);
  const rem = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function extractVideoFirstFrameThumbnail(
  cacheKey: string,
  videoUrl: string
): Promise<ExtractedVideoMeta | null> {
  const existing = videoPosterCache.get(cacheKey);
  if (existing) return Promise.resolve(existing);

  const pending = inFlightExtractions.get(cacheKey);
  if (pending) return pending;

  const jobPromise = new Promise<ExtractedVideoMeta | null>((resolve) => {
    const task = () => {
      let tempVideo: HTMLVideoElement | null = document.createElement('video');
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanupAndRelease = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (tempVideo) {
          try {
            tempVideo.onloadedmetadata = null;
            tempVideo.onseeked = null;
            tempVideo.onloadeddata = null;
            tempVideo.onerror = null;
            tempVideo.pause();
            tempVideo.removeAttribute('src');
            tempVideo.src = '';
            tempVideo.load();
          } catch {}
          tempVideo = null;
        }
      };

      const finish = (result: ExtractedVideoMeta | null) => {
        if (settled) return;
        settled = true;
        cleanupAndRelease();
        inFlightExtractions.delete(cacheKey);
        activeExtractions = Math.max(0, activeExtractions - 1);
        runNextExtraction();
        resolve(result);
      };

      const captureCanvasSnapshot = () => {
        if (!tempVideo || settled) return;
        try {
          const vw = tempVideo.videoWidth || 640;
          const vh = tempVideo.videoHeight || 360;
          const targetW = 384;
          const targetH = Math.max(180, Math.round((targetW * vh) / vw));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(null);
            return;
          }
          ctx.drawImage(tempVideo, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.74);
          if (dataUrl && dataUrl.startsWith('data:image/jpeg')) {
            const meta: ExtractedVideoMeta = {
              posterDataUrl: dataUrl,
              durationFormatted: tempVideo.duration
                ? formatDurationSeconds(tempVideo.duration)
                : undefined,
              dimensions:
                tempVideo.videoWidth && tempVideo.videoHeight
                  ? `${tempVideo.videoWidth} × ${tempVideo.videoHeight}`
                  : undefined,
            };
            if (videoPosterCache.size >= MAX_POSTER_CACHE) {
              const oldestKey = videoPosterCache.keys().next().value;
              if (oldestKey) videoPosterCache.delete(oldestKey);
            }
            videoPosterCache.set(cacheKey, meta);
            finish(meta);
            return;
          }
        } catch {}
        finish(null);
      };

      timeoutId = setTimeout(() => {
        if (!settled && tempVideo && tempVideo.readyState >= 2) {
          captureCanvasSnapshot();
        } else {
          finish(null);
        }
      }, 4000);

      try {
        tempVideo.muted = true;
        tempVideo.playsInline = true;
        tempVideo.preload = 'metadata';
        tempVideo.crossOrigin = 'anonymous';

        tempVideo.onloadedmetadata = () => {
          if (!tempVideo || settled) return;
          try {
            // Seek to 1.0 second (or 25% of duration if clip is shorter than 1.2s)
            const dur = Number.isFinite(tempVideo.duration) ? tempVideo.duration : 0;
            const targetTime = dur > 1.2 ? 1.0 : dur > 0.1 ? dur * 0.25 : 0.1;
            tempVideo.currentTime = targetTime;
          } catch {
            captureCanvasSnapshot();
          }
        };

        tempVideo.onseeked = () => {
          captureCanvasSnapshot();
        };

        tempVideo.onerror = () => {
          finish(null);
        };

        tempVideo.src = videoUrl;
      } catch {
        finish(null);
      }
    };

    extractionQueue.push(task);
    runNextExtraction();
  });

  inFlightExtractions.set(cacheKey, jobPromise);
  return jobPromise;
}

/**
 * Fallback placeholder SVG shown only during the brief moment while the 1st-second frame is being extracted
 */
function buildStaticVideoPlaceholderSvg(name: string, dimensions?: string): string {
  const safeTitle = (name || 'Video')
    .replace(/\.[^/.]+$/, '')
    .slice(0, 22)
    .replace(/[&<>"']/g, '');
  const safeDim = (dimensions || '1920 × 1080').replace(/[&<>"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="55%" stop-color="#0c4a6e"/>
        <stop offset="100%" stop-color="#0284c7"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#bg)"/>
    <text x="36" y="302" fill="rgba(255,255,255,0.85)" font-family="sans-serif" font-size="20" font-weight="600">${safeTitle}</text>
    <text x="36" y="328" fill="rgba(56,189,248,0.85)" font-family="monospace" font-size="14">${safeDim}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  isSelected,
  onToggleSelect,
  onOpenLightbox,
  onCopyItem,
  onDeleteItem,
  onSetAsFolderCover,
  onContextMenuItem,
}) => {
  const { t } = useI18n();
  const [isHovered, setIsHovered] = useState(false);
  // Hover-to-Mount state: <video> is ONLY mounted in DOM when hovered, and immediately destroyed on mouse leave
  const [isVideoMounted, setIsVideoMounted] = useState(false);
  const [extractedMeta, setExtractedMeta] = useState<ExtractedVideoMeta | null>(
    () => videoPosterCache.get(item.url) || null
  );
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staticFallbackPoster = useMemo(() => {
    if (item.type !== 'video') return '';
    return buildStaticVideoPlaceholderSvg(item.name, item.dimensions);
  }, [item.type, item.name, item.dimensions]);

  // Smart First-Frame Thumbnail Extraction on mount (seeks to 1s, captures small Base64 JPEG, and immediately destroys hidden <video>)
  useEffect(() => {
    if (item.type !== 'video' || !item.url) return;
    const cached = videoPosterCache.get(item.url);
    if (cached) {
      setExtractedMeta(cached);
      return;
    }

    let cancelled = false;
    extractVideoFirstFrameThumbnail(item.url, item.url).then((meta) => {
      if (!cancelled && meta) {
        setExtractedMeta(meta);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [item.type, item.url]);

  /**
   * Immediately flushes Chromium's video decoder buffer, clears src="", calls load(),
   * and unmounts the <video> element from the DOM.
   */
  const destroyAndUnmountVideo = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.removeAttribute('src');
        v.src = '';
        v.load();
      } catch {}
      videoRef.current = null;
    }
    setIsVideoMounted(false);
  }, []);

  useEffect(() => {
    return () => {
      destroyAndUnmountVideo();
    };
  }, [destroyAndUnmountVideo]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (item.type === 'video') {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        setIsVideoMounted(true);
      }, 45);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (item.type === 'video') {
      destroyAndUnmountVideo();
    }
  };

  const handleVideoLoadedData = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    v.play().catch(() => {});
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyItem(item);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 1500);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.type === 'video') {
      destroyAndUnmountVideo();
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    setConfirmDelete(false);
    destroyAndUnmountVideo();
    onDeleteItem(item.id);
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.type === 'video') {
      destroyAndUnmountVideo();
    }
    if (onContextMenuItem) {
      onContextMenuItem(e, item);
    }
  };

  const posterImageSrc = extractedMeta?.posterDataUrl || staticFallbackPoster;
  const displayDuration = extractedMeta?.durationFormatted || item.durationFormatted || '00:15';
  const displayDimensions = extractedMeta?.dimensions || item.dimensions || t('mediaCard.hdFormat');

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={() => {
        if (item.type === 'video') destroyAndUnmountVideo();
        onOpenLightbox(item);
      }}
      onContextMenu={handleRightClick}
      className={`group relative rounded-xl bg-white dark:bg-slate-900 border transition-all duration-300 ease-out select-none cursor-pointer flex flex-col shadow-xs ${
        isSelected
          ? 'border-sky-500 ring-2 ring-sky-500/35 bg-sky-50/30 dark:bg-sky-950/30 shadow-md shadow-sky-500/10'
          : 'border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500'
      } ${
        isHovered
          ? 'z-30 scale-115 shadow-2xl shadow-sky-500/25 ring-1 ring-sky-400/50'
          : 'z-10'
      }`}
      style={{
        transformOrigin: 'center center',
      }}
    >
      {/* Media Thumbnail Container: Static 1s First-Frame Thumbnail + Hover-to-Play <video> */}
      <div className="relative aspect-video w-full rounded-t-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        {item.type === 'video' ? (
          <div className="w-full h-full relative">
            {/* Default State (Unhovered): Pure static <img> displaying the extracted 1st-second frame thumbnail */}
            <img
              src={posterImageSrc}
              alt={item.name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />

            {/* Hover State ONLY: Dynamically mount <video> with poster for seamless zero-flash playback */}
            {isVideoMounted && (
              <video
                ref={videoRef}
                src={item.url}
                poster={posterImageSrc}
                muted
                loop
                playsInline
                preload="metadata"
                onLoadedData={handleVideoLoadedData}
                className="absolute inset-0 w-full h-full object-cover z-10"
              />
            )}

            {!isHovered && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/15 pointer-events-none transition-opacity z-20">
                <div className="w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md flex items-center justify-center text-slate-800 dark:text-slate-100 border border-white/60 dark:border-slate-700 shadow-lg">
                  <Play className="w-4 h-4 ml-0.5 fill-sky-600 text-sky-600 dark:fill-sky-400 dark:text-sky-400" />
                </div>
              </div>
            )}
            <div className="absolute bottom-2 right-2 z-20 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-[10px] font-mono text-white border border-white/10 flex items-center gap-1">
              <Film className="w-2.5 h-2.5 text-sky-400" />
              <span>{displayDuration}</span>
            </div>
          </div>
        ) : (
          <div className="w-full h-full relative overflow-hidden">
            <img
              src={item.url}
              alt={item.name}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>
        )}

        {/* Top-Left Selection Checkbox */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(item.id);
          }}
          className={`absolute top-2 left-2 z-30 w-5 h-5 rounded border flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-sky-500 border-sky-500 text-white shadow-sm'
              : 'bg-white/95 dark:bg-slate-900/95 border-slate-300 dark:border-slate-600 text-transparent hover:border-sky-500 shadow-xs'
          } ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}`}
          title={t('mediaCard.selectTitle')}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </div>

        {/* Hover Quick Action Buttons Bar */}
        <div
          className={`absolute top-2 right-2 z-30 flex items-center gap-1 transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (item.type === 'video') destroyAndUnmountVideo();
              onOpenLightbox(item);
            }}
            className="p-1.5 rounded-md bg-white/95 dark:bg-slate-900/95 hover:bg-sky-500 dark:hover:bg-sky-500 text-slate-700 dark:text-slate-200 hover:text-white backdrop-blur-md transition-colors shadow-md border border-slate-200/60 dark:border-slate-700"
            title={t('mediaCard.lightboxTitle')}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-md backdrop-blur-md transition-colors shadow-md border border-slate-200/60 dark:border-slate-700 ${
              copiedFeedback 
                ? 'bg-emerald-500 text-white' 
                : 'bg-white/95 dark:bg-slate-900/95 hover:bg-sky-500 dark:hover:bg-sky-500 text-slate-700 dark:text-slate-200 hover:text-white'
            }`}
            title={t('mediaCard.copyTitle')}
          >
            {copiedFeedback ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {onSetAsFolderCover && item.type === 'image' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSetAsFolderCover(item);
              }}
              className="p-1.5 rounded-md bg-white/95 dark:bg-slate-900/95 hover:bg-sky-600 text-slate-700 dark:text-slate-200 hover:text-white backdrop-blur-md transition-colors shadow-md border border-slate-200/60 dark:border-slate-700"
              title={t('mediaCard.setCoverTitle')}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleDelete}
            className={`p-1.5 rounded-md backdrop-blur-md transition-colors shadow-md border border-slate-200/60 dark:border-slate-700 flex items-center gap-0.5 ${
              confirmDelete
                ? 'bg-rose-600 text-white px-2'
                : 'bg-white/95 dark:bg-slate-900/95 hover:bg-rose-500 text-slate-700 dark:text-slate-200 hover:text-white'
            }`}
            title={confirmDelete ? t('mediaCard.deleteConfirmTitle') : t('mediaCard.deleteTitle')}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {confirmDelete && <span className="text-[10px] font-bold">{t('mediaCard.deleteConfirmText')}</span>}
          </button>
        </div>

        {/* Video Hover Live Playing Banner */}
        {item.type === 'video' && isHovered && (
          <div className="absolute top-2 left-8 z-30 bg-sky-500 text-white text-[10px] font-medium px-2 py-0.5 rounded shadow-sm backdrop-blur-md flex items-center gap-1 animate-fadeIn">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>{t('mediaCard.mutedPreviewBadge')}</span>
          </div>
        )}
      </div>

      {/* Media Details Footer */}
      <div className="p-2.5 flex flex-col justify-between bg-white dark:bg-slate-900 rounded-b-xl border-t border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex items-start justify-between gap-1">
          <div 
            className="text-xs font-medium text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors truncate"
            title={item.name}
          >
            {item.name}
          </div>
        </div>

        {/* Clean Typographic Metadata */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-mono tabular-nums">
          <span>{displayDimensions}</span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>{item.sizeFormatted}</span>
          {item.type === 'video' && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-sky-600 dark:text-sky-400 font-medium">{t('mediaCard.videoBadge')}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
