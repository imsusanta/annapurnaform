'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../LanguageContext';
import { Sun, Moon, LogOut, PlusCircle, Search, FileText, UserCheck, CheckCircle2, AlertCircle, Eye, Printer, Download, Languages } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

interface ApplicationSummary {
  id: number;
  application_id: string;
  hof_name: string;
  hof_aadhaar: string;
  hof_mobile: string;
  status: string;
  updated_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  
  // Theme & Session
  const [darkMode, setDarkMode] = useState(false);
  const [user, setUser] = useState<{ id: number; mobileNumber: string; role: string } | null>(null);
  
  // Applications Lists & Stats
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Authenticate user session on mount
  useEffect(() => {
    const token = localStorage.getItem('annapurna_token');
    const savedUser = localStorage.getItem('annapurna_user');
    
    if (!token || !savedUser) {
      router.push('/');
      return;
    }

    setUser(JSON.parse(savedUser));
    setDarkMode(document.documentElement.classList.contains('dark'));
    
    fetchApplications(token);
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

  const handleLogout = () => {
    localStorage.removeItem('annapurna_token');
    localStorage.removeItem('annapurna_user');
    router.push('/');
  };

  const fetchApplications = async (token: string, search = '') => {
    setLoading(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/applications`, {
        headers: { Authorization: `Bearer ${token}` },
        params: search ? { query: search } : {}
      });
      setApplications(response.data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch applications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('annapurna_token');
    if (token) fetchApplications(token, searchQuery);
  };

  // Create New Application and redirect to Wizard page
  const handleNewApplication = async () => {
    const token = localStorage.getItem('annapurna_token');
    if (!token) return;

    setActionLoading('new');
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/applications`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Redirect to wizard starting at step 1
      router.push(`/apply?id=${response.data.id}`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to create new application draft.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async (appId: number, applicationNum: string) => {
    const token = localStorage.getItem('annapurna_token');
    if (!token) return;

    setActionLoading(`pdf-${appId}`);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/applications/${appId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const file = new Blob([response.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      
      const link = document.createElement('a');
      link.href = fileURL;
      link.setAttribute('download', `Annapurna_${applicationNum}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      console.error(err);
      alert('Failed to generate PDF. Make sure all fields and HOF name are filled.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPdf = async (appId: number) => {
    const token = localStorage.getItem('annapurna_token');
    if (!token) return;

    setActionLoading(`print-${appId}`);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/applications/${appId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const file = new Blob([response.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      
      // Open PDF in new tab and auto-trigger browser print dialog
      const newWindow = window.open(fileURL);
      if (newWindow) {
        newWindow.addEventListener('load', () => {
          newWindow.print();
        });
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to open print dialog.');
    } finally {
      setActionLoading(null);
    }
  };

  // Summary statistics counters
  const totalCount = applications.length;
  const draftCount = applications.filter(a => a.status === 'draft').length;
  const submittedCount = applications.filter(a => a.status === 'submitted').length;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* Top Navbar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors duration-300 shadow-sm sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-full border border-emerald-200 dark:border-emerald-800">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <span className="hidden md:inline-block text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-400 rounded-full">
            Operator: {user?.mobileNumber}
          </span>
          
          <button 
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-all cursor-pointer"
          >
            <Languages className="w-4 h-4 text-slate-400" />
            <span>{language === 'en' ? 'বাংলা' : 'English'}</span>
          </button>

          <button 
            onClick={toggleDarkMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
          </button>

          <button 
            onClick={handleLogout}
            className="p-2 rounded-lg border border-red-200 dark:border-red-950 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 transition-all cursor-pointer"
            title={t('logout')}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8 animate-slide-up">
        
        {/* Alerts & Errors */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 rounded text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Operational Statistics Row */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total Managed</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{totalCount}</span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Drafts (Incomplete)</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{draftCount}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500 rounded-lg">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Submitted to Block Office</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{submittedCount}</span>
            </div>
            <div className="p-3 bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </section>

        {/* Large touch-friendly Actions Grid */}
        <section className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Create New Application Card */}
            <button
              onClick={handleNewApplication}
              disabled={actionLoading === 'new'}
              className="flex flex-col items-center justify-center p-6 text-center rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-all group min-h-[160px] cursor-pointer"
            >
              <PlusCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-500 group-hover:scale-110 transition-transform mb-3" />
              <span className="text-base font-extrabold text-slate-800 dark:text-slate-200 block">{t('newApplication')}</span>
              <span className="text-xs text-slate-400 mt-1">Start a fresh 12-stage family data collection form</span>
            </button>

            {/* Quick Search Card */}
            <div className="flex flex-col justify-between p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <div>
                <span className="text-base font-extrabold text-slate-800 dark:text-slate-200 block mb-2">{t('searchApplication')}</span>
                <span className="text-xs text-slate-400 block mb-4">Query database instantly by Aadhaar, Mobile, or ID</span>
              </div>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter details..."
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold"
                />
                <button type="submit" className="p-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg cursor-pointer">
                  <Search className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Admin Panel Card */}
            <button
              onClick={() => router.push('/admin')}
              className="flex flex-col items-center justify-center p-6 text-center rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-all min-h-[160px] group cursor-pointer"
            >
              <UserCheck className="w-10 h-10 text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform mb-3" />
              <span className="text-base font-extrabold text-slate-800 dark:text-slate-200 block">{t('adminPanel')}</span>
              <span className="text-xs text-slate-400 mt-1">Access advanced metrics, filters, and Excel exports</span>
            </button>

          </div>
        </section>

        {/* Recent Applications Listing */}
        <section className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-900 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{t('recentApplications')}</h3>
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); const token = localStorage.getItem('annapurna_token'); if (token) fetchApplications(token); }} 
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                Clear Search
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs font-semibold text-slate-400">Loading applications...</div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
              {t('noRecentApps')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-900">
                    <th className="px-6 py-4">Application ID</th>
                    <th className="px-6 py-4">HOF Name</th>
                    <th className="px-6 py-4">Aadhaar Card</th>
                    <th className="px-6 py-4">{t('status')}</th>
                    <th className="px-6 py-4">{t('lastUpdated')}</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 text-slate-700 dark:text-slate-300 font-medium transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100">{app.application_id}</td>
                      <td className="px-6 py-4">{app.hof_name}</td>
                      <td className="px-6 py-4 font-mono">{app.hof_aadhaar}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          app.status === 'submitted' 
                            ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900' 
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-900'
                        }`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{new Date(app.updated_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        {app.status === 'draft' ? (
                          <button
                            onClick={() => router.push(`/apply?id=${app.id}`)}
                            className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-900 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>{t('editDraft')}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => router.push(`/apply?id=${app.id}&view=true`)}
                            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{t('viewDetails')}</span>
                          </button>
                        )}
                        
                        <button
                          onClick={() => handlePrintPdf(app.id)}
                          disabled={actionLoading === `print-${app.id}`}
                          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title={t('printPdf')}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        
                        <button
                          onClick={() => handleDownloadPdf(app.id, app.application_id)}
                          disabled={actionLoading === `pdf-${app.id}`}
                          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title={t('downloadPdf')}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-[10px] text-slate-400 dark:text-slate-600 tracking-wide border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors duration-300 mt-auto">
        © 2026 Department of Food & Supplies, Government of West Bengal. All rights reserved.
      </footer>
    </div>
  );
}
