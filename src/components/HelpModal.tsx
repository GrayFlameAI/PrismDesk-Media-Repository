import React from 'react';
import { 
  X, 
  HelpCircle, 
  MousePointer, 
  Copy, 
  HardDrive, 
  UploadCloud,
  Terminal
} from 'lucide-react';
import { useI18n } from '../locales';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const { t } = useI18n();

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-white border border-sky-100 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-sky-500" />
            <h3 className="font-bold text-slate-900 text-base">
              {t('help.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3.5 text-xs text-slate-700 max-h-[70vh] overflow-y-auto">
          {/* Feature 1 */}
          <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-100/90 space-y-1">
            <div className="font-semibold text-sky-800 flex items-center gap-1.5 text-sm">
              <HardDrive className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{t('help.f1Title')}</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {t('help.f1Desc')}
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-100/90 space-y-1">
            <div className="font-semibold text-sky-800 flex items-center gap-1.5 text-sm">
              <UploadCloud className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{t('help.f2Title')}</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {t('help.f2Desc')}
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-100/90 space-y-1">
            <div className="font-semibold text-sky-800 flex items-center gap-1.5 text-sm">
              <Copy className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{t('help.f3Title')}</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {t('help.f3Desc')}
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-100/90 space-y-1">
            <div className="font-semibold text-sky-800 flex items-center gap-1.5 text-sm">
              <MousePointer className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{t('help.f4Title')}</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {t('help.f4Desc')}
            </p>
          </div>

          {/* Feature 5 */}
          <div className="p-3.5 rounded-xl bg-sky-50/50 border border-sky-100/90 space-y-1">
            <div className="font-semibold text-sky-800 flex items-center gap-1.5 text-sm">
              <Terminal className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{t('help.f5Title')}</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              {t('help.f5Desc')}
            </p>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-xs font-medium text-white transition-colors shadow-sm shadow-sky-500/20"
          >
            {t('help.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
};
