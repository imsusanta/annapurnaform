'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, Language, TranslationsType, TranslationKey } from './i18n';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');

  // Load language preference from localStorage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('annapurna_lang') as Language;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'bn')) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('annapurna_lang', lang);
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dictionary = translations[language];
    let text = dictionary[key] as string;

    if (!text) {
      // Fallback to English if key is missing in active language
      text = translations['en'][key] as string || String(key);
    }

    if (params) {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        text = text.replace(`{${paramKey}}`, String(paramVal));
      });
    }

    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
