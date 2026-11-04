import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  Trash2, 
  Database, 
  HardDrive, 
  Check, 
  FolderOpen,
  ExternalLink
} from 'lucide-react';
import { SecurityConfig } from '../types';
import { hashPassword, isElectronEnv, selectNativeDirectoryDialog } from '../utils/storage';
import { useI18n } from '../locales';

interface SettingsModalProps {
  securityConfig: SecurityConfig;
  vaultRootPath: string;
  onChangeVaultRoot: (newPath: string) => Promise<void>;
  onOpenRootInExplorer: () => Promise<void>;
  onClose: () => void;
  onUpdateSecurity: (newHash: string, hint: string) => Promise<void>;
  onClearAllData: () => Promise<void>;
  onLoadDemoPack: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  securityConfig,
  vaultRootPath,
  onChangeVaultRoot,
  onOpenRootInExplorer,
  onClose,
  onUpdateSecurity,
  onClearAllData,
  onLoadDemoPack,
}) => {
  const { t } = useI18n();
  const [rootInput, setRootInput] = useState(vaultRootPath);
  const [isUpdatingRoot, setIsUpdatingRoot] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newHint, setNewHint] = useState(securityConfig.hint || '初始密码 123456');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmClear, setConfirmClear] = useState(false);

  const handleBrowseNativeFolder = async () => {
    const picked = await selectNativeDirectoryDialog();
    if (picked) {
      setRootInput(picked);
    }
  };

  const handleApplyRootPath = async () => {
    if (!rootInput.trim()) return;
    setIsUpdatingRoot(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await onChangeVaultRoot(rootInput.trim());
      setSuccessMsg(t('settings.rootUpdateSuccess'));
    } catch (err: any) {
      setErrorMsg(err?.message || t('settings.rootUpdateError'));
    } finally {
      setIsUpdatingRoot(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const oldHash = await hashPassword(oldPassword);
    const defaultHash = await hashPassword('123456');
    const currentHash = securityConfig.passwordHash || defaultHash;

    if (oldHash !== currentHash) {
      setErrorMsg(t('settings.errWrongOldPwd'));
      return;
    }

    if (!newPassword.trim()) {
      setErrorMsg(t('settings.errEmptyNewPwd'));
      return;
    }

    setIsSubmitting(true);
    try {
      const newHash = await hashPassword(newPassword.trim());
      await onUpdateSecurity(newHash, newHint.trim());
      setSuccessMsg(t('settings.pwdUpdatedSuccess'));
      setOldPassword('');
      setNewPassword('');
    } catch {
      setErrorMsg(t('settings.pwdUpdateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-sky-100 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-sky-500" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
              {t('settings.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* 1. Physical Vault Root Directory Configuration */}
          <div className="space-y-2.5 p-4 rounded-xl bg-sky-50/50 dark:bg-slate-800/50 border border-sky-100 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900 dark:text-sky-300">
                <HardDrive className="w-4 h-4 text-sky-500 shrink-0" />
                <span>{t('settings.rootSectionTitle')}</span>
              </div>
              <button
                type="button"
                onClick={onOpenRootInExplorer}
                className="flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors shrink-0 cursor-pointer"
              >
                <span>{t('settings.openInExplorer')}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('settings.rootDesc')}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                value={rootInput}
                onChange={(e) => setRootInput(e.target.value)}
                placeholder={t('setupModal.placeholder')}
                className="flex-1 bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 focus:border-sky-500 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
              />
              {isElectronEnv() && (
                <button
                  type="button"
                  onClick={handleBrowseNativeFolder}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-slate-700 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-sky-500" />
                  <span>{t('settings.browse')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleApplyRootPath}
                disabled={isUpdatingRoot || !rootInput.trim() || rootInput.trim() === vaultRootPath}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-xs font-medium text-white transition-colors shrink-0 shadow-2xs cursor-pointer"
              >
                {isUpdatingRoot ? t('settings.applying') : t('settings.applyRoot')}
              </button>
            </div>
          </div>

          {/* 2. Password Modification Form (Requires Old Password Verification, No Disable Backdoor) */}
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {t('settings.changePwdTitle')}
              </h4>
              <span className="text-[11px] font-mono text-sky-600 dark:text-sky-400">
                {t('lock.initialPwdHint')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('settings.oldPwdLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                placeholder={t('settings.oldPwdPlaceholder')}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-sky-500 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('settings.newPwdLabel')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                required
                placeholder={t('settings.newPwdPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-sky-500 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t('settings.hintLabel')}
              </label>
              <input
                type="text"
                placeholder={t('settings.hintPlaceholder')}
                value={newHint}
                onChange={(e) => setNewHint(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:border-sky-500 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
              />
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-500 font-medium">{errorMsg}</div>
            )}
            {successMsg && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !oldPassword || !newPassword}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-xs font-medium text-white transition-colors shadow-sm shadow-sky-500/20 cursor-pointer"
              >
                {isSubmitting ? t('settings.savingPwd') : t('settings.savePwd')}
              </button>
            </div>
          </form>

          {/* 3. Database & Demo Pack Options */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-5 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {t('settings.dataManagementTitle')}
            </h4>

            <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50/40 dark:bg-slate-800/40 border border-sky-100 dark:border-slate-700 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {t('settings.demoPackTitle')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('settings.demoPackDesc')}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onLoadDemoPack();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-slate-700 text-xs text-sky-700 dark:text-sky-300 font-medium border border-sky-200 dark:border-slate-600 transition-colors flex items-center gap-1.5 shadow-2xs shrink-0 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5 text-sky-500" />
                <span>{t('settings.demoPackBtn')}</span>
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50/40 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 gap-3">
              <div>
                <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {t('settings.clearDataTitle')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('settings.clearDataDesc')}
                </div>
              </div>
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-xs text-rose-600 dark:text-rose-400 font-medium border border-rose-200 dark:border-rose-800 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('settings.clearDataBtn')}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
                  >
                    {t('settings.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await onClearAllData();
                      setConfirmClear(false);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs text-white font-semibold transition-colors cursor-pointer"
                  >
                    {t('settings.confirmClearBtn')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
