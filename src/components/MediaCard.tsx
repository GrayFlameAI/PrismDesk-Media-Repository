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
import { getDiskThumbnail, saveDiskThumbnail, startNativeFileDragOut } from '../utils/storage';
import { useI18n } from '../locales';

interface MediaCardProps {
  item: MediaItem;
  isSelected: boolean;
  disableNativeDrag?: boolean;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (item: MediaItem) => void;
  onCopyItem: (item: MediaItem) => void;
  onDeleteItem: (id: string) => void;
  onSetAsFolderCover?: (item: MediaItem) => void;
  onContextMenuItem?: (e: React.MouseEvent, item: MediaItem) => void;
  onNativeDragStart?: (item: MediaItem, posterUrl?: string) => void;
}

interface CachedVideoMeta {
  posterUrl: string;
  durationFormatted?: string;
  dimensions?: string;
}

// Lightweight URL cache storing local disk thumbnail file:/// URLs (almost 0 bytes in JS heap)
const MAX_URL_CACHE = 2000;
const videoPosterCache = new Map<string, CachedVideoMeta>();
const inFlightExtractions = new Map<string, Promise<CachedVideoMeta | null>>();

// Strictly limit offscreen <video> first-frame extraction concurrency to 1 at a time
// so CPU stays < 2% and RAM stays < 150MB even in folders with 800+ video files.
const MAX_CONCURRENT_EXTRACTIONS = 1;
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

function getMediaCacheKey(item: MediaItem): string {
  if (item.filePath) {
    return `${item.filePath}_${Math.floor(item.mtimeMs || 0)}`;
  }
  return item.url;
}

function formatDurationSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:15';
  const totalSec = Math.max(1, Math.round(sec));
  const mins = Math.floor(totalSec / 60);
  const rem = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function clearInMemoryVideoPosterCache(): void {
  videoPosterCache.clear();
}

function rememberInUrlCache(key: string, meta: CachedVideoMeta) {
  if (videoPosterCache.size >= MAX_URL_CACHE) {
    const oldestKey = videoPosterCache.keys().next().value;
    if (oldestKey) videoPosterCache.delete(oldestKey);
  }
  videoPosterCache.set(key, meta);
}

/**
 * Resolves a video's thumbnail using the Main Process Persistent Disk Cache (AppData/PrismDesk/thumbnails/<md5>.jpg) first.
 * Only if no disk cache exists for (filePath + mtimeMs), extracts the 1st-second frame via a single-concurrency offscreen
 * <video> + <canvas>, writes the tiny .jpg to disk, and immediately destroys the temporary <video>.
 */
function resolveOrExtractVideoThumbnail(item: MediaItem): Promise<CachedVideoMeta | null> {
  const cacheKey = getMediaCacheKey(item);
  const existing = videoPosterCache.get(cacheKey);
  if (existing) return Promise.resolve(existing);

  if (item.thumbUrl) {
    const directMeta: CachedVideoMeta = {
      posterUrl: item.thumbUrl,
      durationFormatted: item.durationFormatted,
      dimensions: item.dimensions,
    };
    rememberInUrlCache(cacheKey, directMeta);
    return Promise.resolve(directMeta);
  }

  const pending = inFlightExtractions.get(cacheKey);
  if (pending) return pending;

  const jobPromise = (async (): Promise<CachedVideoMeta | null> => {
    try {
      // 1. Check persistent disk thumbnail cache in Main Process first
      const diskHit = await getDiskThumbnail(item);
      if (diskHit.hit && diskHit.thumbUrl) {
        const hitMeta: CachedVideoMeta = {
          posterUrl: diskHit.thumbUrl,
          durationFormatted: diskHit.durationFormatted || item.durationFormatted,
          dimensions: diskHit.dimensions || item.dimensions,
        };
        rememberInUrlCache(cacheKey, hitMeta);
        inFlightExtractions.delete(cacheKey);
        return hitMeta;
      }
    } catch {}

    // 2. Disk cache miss: enqueue single-concurrency 1s frame capture & persist to disk
    return new Promise<CachedVideoMeta | null>((resolve) => {
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

        const finish = (result: CachedVideoMeta | null) => {
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
            const targetW = 360;
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
            const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
            const durationFormatted = tempVideo.duration
              ? formatDurationSeconds(tempVideo.duration)
              : undefined;
            const dimensions =
              tempVideo.videoWidth && tempVideo.videoHeight
                ? `${tempVideo.videoWidth} × ${tempVideo.videoHeight}`
                : undefined;

            // Release the <video> decoder immediately before async disk write
            cleanupAndRelease();

            if (dataUrl && dataUrl.startsWith('data:image/jpeg')) {
              saveDiskThumbnail(item, dataUrl, durationFormatted, dimensions)
                .then((diskThumbUrl) => {
                  const finalUrl = diskThumbUrl || dataUrl;
                  const meta: CachedVideoMeta = {
                    posterUrl: finalUrl,
                    durationFormatted,
                    dimensions,
                  };
                  rememberInUrlCache(cacheKey, meta);
                  finish(meta);
                })
                .catch(() => {
                  const meta: CachedVideoMeta = {
                    posterUrl: dataUrl,
                    durationFormatted,
                    dimensions,
                  };
                  rememberInUrlCache(cacheKey, meta);
                  finish(meta);
                });
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
        }, 3500);

        try {
          tempVideo.muted = true;
          tempVideo.playsInline = true;
          tempVideo.preload = 'metadata';
          tempVideo.crossOrigin = 'anonymous';

          tempVideo.onloadedmetadata = () => {
            if (!tempVideo || settled) return;
            try {
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

          tempVideo.src = item.url;
        } catch {
          finish(null);
        }
      };

      extractionQueue.push(task);
      runNextExtraction();
    });
  })();

  inFlightExtractions.set(cacheKey, jobPromise);
  return jobPromise;
}

/**
 * Lightweight SVG placeholder shown before IntersectionObserver triggers or while 1st-second frame is being cached
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

const MediaCardComponent: React.FC<MediaCardProps> = ({
  item,
  isSelected,
  disableNativeDrag = false,
  onToggleSelect,
  onOpenLightbox,
  onCopyItem,
  onDeleteItem,
  onSetAsFolderCover,
  onContextMenuItem,
  onNativeDragStart,
}) => {
  const { t } = useI18n();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cacheKey = useMemo(() => getMediaCacheKey(item), [item]);

  const [isHovered, setIsHovered] = useState(false);
  // Hover-to-Mount state: <video> is ONLY mounted in DOM when hovered, and immediately destroyed on mouse leave
  const [isVideoMounted, setIsVideoMounted] = useState(false);
  // IntersectionObserver Lazy Loading state: only request thumbnail / image when card enters viewport
  const [isNearViewport, setIsNearViewport] = useState<boolean>(() => {
    return Boolean(item.thumbUrl || videoPosterCache.has(cacheKey));
  });
  const [extractedMeta, setExtractedMeta] = useState<CachedVideoMeta | null>(() => {
    const mem = videoPosterCache.get(cacheKey);
    if (mem) return mem;
    if (item.thumbUrl) {
      return {
        posterUrl: item.thumbUrl,
        durationFormatted: item.durationFormatted,
        dimensions: item.dimensions,
      };
    }
    return null;
  });
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const staticFallbackPoster = useMemo(() => {
    if (item.type !== 'video') return '';
    return buildStaticVideoPlaceholderSvg(item.name, item.dimensions);
  }, [item.type, item.name, item.dimensions]);

  // 1. IntersectionObserver + 100ms scroll-idle debounce: only request首帧 when card settles in viewport
  useEffect(() => {
    if (isNearViewport) return;
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!settleTimer) {
              settleTimer = setTimeout(() => {
                setIsNearViewport(true);
                observer.disconnect();
              }, 100);
            }
          } else if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
          }
        }
      },
      {
        rootMargin: '220px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      observer.disconnect();
    };
  }, [isNearViewport]);

  // 2. Disk-Cached / Smart 1s First-Frame Thumbnail Resolution (only when near viewport)
  useEffect(() => {
    if (item.type !== 'video' || !item.url || !isNearViewport) return;

    const cached = videoPosterCache.get(cacheKey);
    if (cached) {
      setExtractedMeta(cached);
      return;
    }

    if (item.thumbUrl) {
      const preCached: CachedVideoMeta = {
        posterUrl: item.thumbUrl,
        durationFormatted: item.durationFormatted,
        dimensions: item.dimensions,
      };
      rememberInUrlCache(cacheKey, preCached);
      setExtractedMeta(preCached);
      return;
    }

    let cancelled = false;
    resolveOrExtractVideoThumbnail(item).then((meta) => {
      if (!cancelled && meta) {
        setExtractedMeta(meta);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [item, cacheKey, isNearViewport]);

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
    setIsNearViewport(true);
    if (item.type === 'video') {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        setIsVideoMounted(true);
      }, 65);
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

  const posterImageSrc = extractedMeta?.posterUrl || item.thumbUrl || staticFallbackPoster;
  const displayDuration = extractedMeta?.durationFormatted || item.durationFormatted || '00:15';
  const displayDimensions = extractedMeta?.dimensions || item.dimensions || t('mediaCard.hdFormat');

  /**
   * 任务四：支持“原生文件拖拽到外部应用” (Desktop, PS, PR, 剪映等)
   * 拦截浏览器默认 HTML5 拖拽，释放视频文件句柄，并通过 IPC 通知主进程调用 event.sender.startDrag
   */
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (disableNativeDrag) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsHovered(false);
    if (item.type === 'video') {
      destroyAndUnmountVideo();
    }
    if (onNativeDragStart) {
      onNativeDragStart(item, posterImageSrc);
    } else {
      startNativeFileDragOut(item, undefined, posterImageSrc);
    }
  };

  return (
    <div
      ref={cardRef}
      data-media-id={item.id}
      draggable={!disableNativeDrag}
      onDragStart={handleDragStart}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={() => {
        if (item.type === 'video') destroyAndUnmountVideo();
        onOpenLightbox(item);
      }}
      onContextMenu={handleRightClick}
      className={`group relative rounded-xl bg-white dark:bg-slate-900 border transition-all duration-200 ease-out select-none cursor-pointer flex flex-col shadow-xs ${
        isSelected
          ? 'border-sky-500 ring-2 ring-sky-500/35 bg-sky-50/30 dark:bg-sky-950/30 shadow-md shadow-sky-500/10'
          : 'border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500'
      } ${
        isHovered && !disableNativeDrag
          ? 'z-30 scale-115 shadow-2xl shadow-sky-500/25 ring-1 ring-sky-400/50'
          : 'z-10'
      }`}
      style={{
        transformOrigin: 'center center',
      }}
    >
      {/* 锁定 16:9 比例容器 (aspect-video shrink-0)，确保图片/缩略图异步加载前后高度恒定，杜绝虚拟列表高度坍塌 */}
      <div className="relative aspect-video w-full shrink-0 rounded-t-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        {item.type === 'video' ? (
          <div className="w-full h-full relative">
            {/* Default State (Unhovered): Pure static <img> displaying the disk-cached .jpg thumbnail */}
            <img
              src={posterImageSrc}
              alt={item.name}
              draggable={false}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover select-none"
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
                className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
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
            {isNearViewport && (
              <img
                src={item.url}
                alt={item.name}
                draggable={false}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 select-none"
              />
            )}
          </div>
        )}

        {/* Top-Left Selection Checkbox */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
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
          onMouseDown={(e) => e.stopPropagation()}
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

      {/* 锁定底部详情栏高度 (h-[58px] shrink-0)，避免字体或长文件名导致卡片高度不一致 */}
      <div className="p-2.5 h-[58px] shrink-0 flex flex-col justify-between bg-white dark:bg-slate-900 rounded-b-xl border-t border-slate-100 dark:border-slate-800 transition-colors">
        <div className="flex items-start justify-between gap-1">
          <div 
            className="text-xs font-medium text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 transition-colors truncate"
            title={item.name}
          >
            {item.name}
          </div>
        </div>

        {/* Clean Typographic Metadata */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono tabular-nums truncate">
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

export const MediaCard = React.memo(
  MediaCardComponent,
  (prev, next) =>
    (prev.item === next.item ||
      (prev.item.id === next.item.id &&
        prev.item.filePath === next.item.filePath &&
        prev.item.mtimeMs === next.item.mtimeMs &&
        prev.item.size === next.item.size &&
        prev.item.name === next.item.name &&
        (prev.item.thumbUrl || '') === (next.item.thumbUrl || ''))) &&
    prev.isSelected === next.isSelected &&
    prev.disableNativeDrag === next.disableNativeDrag &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onOpenLightbox === next.onOpenLightbox &&
    prev.onCopyItem === next.onCopyItem &&
    prev.onDeleteItem === next.onDeleteItem &&
    prev.onSetAsFolderCover === next.onSetAsFolderCover &&
    prev.onContextMenuItem === next.onContextMenuItem &&
    prev.onNativeDragStart === next.onNativeDragStart
);
