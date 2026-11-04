import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Sparkles,
  Globe,
  ShieldAlert,
  KeyRound
} from 'lucide-react';
import { SecurityConfig } from '../types';
import { hashPassword } from '../utils/storage';
import { useI18n } from '../locales';

interface LockScreenProps {
  securityConfig: SecurityConfig;
  onUnlock: () => void;
}

const LOCKOUT_UNTIL_KEY = 'prismdesk_lockout_until';
const FAILED_ATTEMPTS_KEY = 'prismdesk_failed_attempts';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 1000;

export const LockScreen: React.FC<LockScreenProps> = ({
  securityConfig,
  onUnlock,
}) => {
  const { lang, toggleLang, t } = useI18n();
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  // Brute-force protection: 5 failed attempts -> 30s lockout
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '0', 10) || 0;
    } catch {
      return 0;
    }
  });

  const [lockoutUntil, setLockoutUntil] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem(LOCKOUT_UNTIL_KEY) || '0', 10) || 0;
    } catch {
      return 0;
    }
  });

  const [remainingLockSeconds, setRemainingLockSeconds] = useState<number>(0);

  // Clock & Lockout Countdown Timer
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const updateTimers = () => {
      const now = Date.now();
      setCurrentTime(new Date(now));

      if (lockoutUntil > now) {
        setRemainingLockSeconds(Math.ceil((lockoutUntil - now) / 1000));
      } else if (lockoutUntil > 0 && lockoutUntil <= now) {
        setRemainingLockSeconds(0);
        setLockoutUntil(0);
        setFailedAttempts(0);
        setErrorMessage('');
        try {
          localStorage.removeItem(LOCKOUT_UNTIL_KEY);
          localStorage.removeItem(FAILED_ATTEMPTS_KEY);
        } catch {}
      }
    };

    updateTimers();
    const timer = setInterval(updateTimers, 500);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const isLockedOut = remainingLockSeconds > 0;
  const localeCode = lang === 'zh' ? 'zh-CN' : 'en-US';

  const timeString = currentTime.toLocaleTimeString(localeCode, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateString = currentTime.toLocaleDateString(localeCode, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const handleVerifyUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLockedOut || !passwordInput) return;

    const inputHash = await hashPassword(passwordInput);
    const defaultHash = await hashPassword('123456');
    const targetHash = securityConfig.passwordHash || defaultHash;

    if (inputHash === targetHash) {
      setErrorMessage('');
      setFailedAttempts(0);
      setLockoutUntil(0);
      try {
        localStorage.removeItem(LOCKOUT_UNTIL_KEY);
        localStorage.removeItem(FAILED_ATTEMPTS_KEY);
      } catch {}
      onUnlock();
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      setPasswordInput('');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      try {
        localStorage.setItem(FAILED_ATTEMPTS_KEY, String(nextAttempts));
      } catch {}

      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_DURATION_MS;
        setLockoutUntil(until);
        setRemainingLockSeconds(30);
        setErrorMessage('');
        try {
          localStorage.setItem(LOCKOUT_UNTIL_KEY, String(until));
        } catch {}
      } else {
        const left = MAX_FAILED_ATTEMPTS - nextAttempts;
        setErrorMessage(t('lock.errAttemptsLeft', { left }));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between items-center text-slate-800 dark:text-slate-100 select-none overflow-hidden bg-white dark:bg-slate-950 transition-colors">
      {/* Top-Right Language Switcher on Lock Screen */}
      <div className="absolute top-4 right-5 z-20">
        <button
          type="button"
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/80 dark:bg-slate-900/80 hover:bg-sky-500 text-sky-700 dark:text-sky-300 hover:text-white border border-sky-200 dark:border-slate-700 hover:border-sky-500 backdrop-blur-md transition-all shadow-xs text-xs font-medium cursor-pointer"
          title={t('titlebar.langSwitchTitle')}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px]">
            <span className={lang === 'zh' ? 'font-bold' : 'opacity-70'}>中</span>
            <span className="mx-0.5 opacity-50">/</span>
            <span className={lang === 'en' ? 'font-bold' : 'opacity-70'}>En</span>
          </span>
        </button>
      </div>

      {/* Dynamic Windows 11 Sky & Cloud Wallpaper Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-100/70 via-sky-50/40 to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950 pointer-events-none scale-105">
        <div className="absolute inset-0 bg-white/40 dark:bg-slate-950/60 backdrop-blur-3xl" />
        <div className="absolute -top-32 left-1/4 w-96 h-96 bg-sky-200/50 dark:bg-sky-900/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 right-1/4 w-96 h-96 bg-sky-100/60 dark:bg-sky-950/30 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Top Windows 11 Clock & Date Display */}
      <div className="relative z-10 pt-16 text-center">
        <div className="text-7xl sm:text-8xl font-extralight tracking-tight text-slate-900 dark:text-white font-sans drop-shadow-xs tabular-nums">
          {timeString}
        </div>
        <div className="text-sm sm:text-base font-normal text-sky-800/80 dark:text-sky-300/80 mt-2 tracking-wide font-medium">
          {dateString}
        </div>
      </div>

      {/* Middle: High-Strength Windows Hello / Vault Unlock Card (NO Forgot Password Backdoor) */}
      <div className="relative z-10 w-full max-w-sm px-6 pb-20 flex flex-col items-center">
        {/* Avatar */}
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 p-1 shadow-xl shadow-sky-500/20 ring-4 ring-sky-100 dark:ring-slate-800 flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-sky-500 shadow-inner">
              <Sparkles className="w-10 h-10 text-sky-500" />
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-sky-500 border-2 border-white dark:border-slate-900 flex items-center justify-center shadow">
            <Lock className="w-3 h-3 text-white" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-1">
          {t('lock.brandTitle')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 text-center">
          {t('lock.unlockSub')}
        </p>

        {/* 30-Second Security Lockout Banner after 5 Failed Attempts */}
        {isLockedOut && (
          <div className="w-full mb-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-xs flex items-start gap-2.5 shadow-sm animate-in fade-in duration-150">
            <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">{t('lock.lockoutTitle')}</div>
              <div className="text-[11px] font-mono tabular-nums">
                {t('lock.lockoutDesc', { seconds: remainingLockSeconds })}
              </div>
            </div>
          </div>
        )}

        {/* Password Verification Form */}
        <form 
          onSubmit={handleVerifyUnlock} 
          className={`w-full space-y-3 ${isShaking ? 'animate-shake' : ''}`}
        >
          <div className="relative flex items-center">
            <input
              type={showPassword ? 'text' : 'password'}
              autoFocus
              disabled={isLockedOut}
              placeholder={t('lock.enterPwdPlaceholder')}
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setErrorMessage('');
              }}
              className="w-full bg-white/95 dark:bg-slate-900/95 hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 disabled:opacity-50 border border-sky-200 dark:border-slate-700 focus:border-sky-500 rounded-lg py-2.5 pl-3.5 pr-16 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none backdrop-blur-md transition-all shadow-sm focus:ring-2 focus:ring-sky-100 dark:focus:ring-sky-900/50"
            />

            <div className="absolute right-1.5 flex items-center gap-0.5">
              <button
                type="button"
                disabled={isLockedOut}
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                title={showPassword ? t('lock.hidePwd') : t('lock.showPwd')}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="submit"
                disabled={isLockedOut || !passwordInput}
                className="p-1.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 rounded text-white transition-colors shadow-xs cursor-pointer"
                title={t('lock.unlockBtnTitle')}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {errorMessage && !isLockedOut && (
            <div className="text-xs text-rose-500 text-center font-medium">
              {errorMessage}
            </div>
          )}

          {/* Subtle Initial Password Hint ("初始密码 123456") — ZERO Forgot Password Backdoor */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 px-1">
            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium font-mono">
              <KeyRound className="w-3 h-3" />
              <span>{t('lock.initialPwdHint')}</span>
            </span>

            {securityConfig.hint && securityConfig.hint !== '初始密码 123456' ? (
              <span className="text-slate-400 dark:text-slate-500 truncate max-w-[160px]" title={securityConfig.hint}>
                {t('lock.hintPrefix', { hint: securityConfig.hint })}
              </span>
            ) : (
              <span className="text-slate-400 dark:text-slate-500">{t('lock.protectionEnabled')}</span>
            )}
          </div>
        </form>
      </div>

      {/* Bottom Footer Info */}
      <div className="relative z-10 pb-6 text-center text-slate-400 dark:text-slate-500 text-xs font-mono">
        {t('lock.footer')}
      </div>
    </div>
  );
};
