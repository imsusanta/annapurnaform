'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from './LanguageContext';
import { Sun, Moon, Phone, Key, ShieldCheck, Languages } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

export default function LoginPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [darkMode, setDarkMode] = useState(false);
  
  // Auth state
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile'); // 'mobile' or 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Dev assistance
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);

  // Initialize Dark Mode state from document class
  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setDarkMode(true);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!/^\d{10}$/.test(mobileNumber)) {
      setError(t('invalidMobile'));
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/send-otp`, { mobileNumber });
      setSimulatedOtp(response.data.otp);
      setStep('otp');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^\d{6}$/.test(otp)) {
      setError(t('invalidOtp'));
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/auth/verify-otp`, {
        mobileNumber,
        otp
      });

      // Save token & user in localStorage
      localStorage.setItem('annapurna_token', response.data.token);
      localStorage.setItem('annapurna_user', JSON.stringify(response.data.user));

      // Redirect to Dashboard
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* Top Header Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors duration-300 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Custom Government Seal SVG */}
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-full border border-emerald-200 dark:border-emerald-800">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 6L16 10M12 6L8 10M12 6V18" stroke="#059669" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 tracking-tight">{t('title')}</p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-3">
          {/* Language Toggle Button */}
          <button 
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-all"
            aria-label="Toggle language"
          >
            <Languages className="w-4 h-4 text-slate-400" />
            <span>{language === 'en' ? 'বাংলা' : 'English'}</span>
          </button>

          {/* Dark Mode Toggle Button */}
          <button 
            onClick={toggleDarkMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-6 animate-slide-up">
        <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8 relative overflow-hidden transition-all duration-300">
          
          {/* Premium Ambient Background Glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="text-center mb-8 relative z-10">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('loginTitle')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('loginSubtitle')}</p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 rounded text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Simulated OTP Notification Banner (Dev mode) */}
          {step === 'otp' && simulatedOtp && (
            <div className="mb-6 p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl">
              <span className="text-xs font-bold text-sky-800 dark:text-sky-400 block mb-1">💬 Simulated SMS Notification:</span>
              <p className="text-xs text-sky-700 dark:text-sky-300 leading-normal">
                Your Annapurna verification code is <strong className="text-sm font-extrabold select-all tracking-wider text-sky-900 dark:text-sky-200 bg-sky-100 dark:bg-sky-900/60 px-2 py-0.5 rounded">{simulatedOtp}</strong>. It will expire in 5 minutes.
              </p>
            </div>
          )}

          {/* Step 1: Mobile Form */}
          {step === 'mobile' && (
            <div className="space-y-6 relative z-10">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block uppercase tracking-wider">
                  {t('mobileNumber')}
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    autoComplete="off"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('mobilePlaceholder')}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold transition-all hover:bg-slate-100/50 dark:hover:bg-slate-900/50 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              
              <button
                type="button"
                onClick={(e) => handleSendOtp(e as any)}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm tracking-wider uppercase rounded-xl transition-all shadow-md shadow-emerald-500/10 active:scale-[0.98] cursor-pointer"
              >
                {loading ? t('verifying') : t('sendOtp')}
              </button>
            </div>
          )}

          {/* Step 2: OTP Form */}
          {step === 'otp' && (
            <div className="space-y-6 relative z-10">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block uppercase tracking-wider">
                    {t('enterOtp')}
                  </label>
                  <button 
                    type="button" 
                    onClick={() => { setStep('mobile'); setError(''); }} 
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    Edit Number
                  </button>
                </div>
                <div className="relative">
                  <Key className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoComplete="off"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('otpPlaceholder')}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold tracking-widest transition-all text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => handleVerifyOtp(e as any)}
                disabled={loading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm tracking-wider uppercase rounded-xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
              >
                {loading ? t('loggingIn') : t('verifyOtp')}
              </button>
            </div>
          )}

          {/* System Security Notice */}
          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-900 flex items-center justify-center gap-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">Secure Government Network Gateway</span>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-[10px] text-slate-400 dark:text-slate-600 tracking-wide border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors duration-300">
        © 2026 Department of Food & Supplies, Government of West Bengal. All rights reserved.
      </footer>
    </div>
  );
}
