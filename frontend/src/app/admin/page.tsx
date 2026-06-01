'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../LanguageContext';
import { Sun, Moon, ArrowLeft, Search, Filter, FileSpreadsheet, Eye, Edit2, CheckCircle2, XCircle, Printer, Download, Languages, BarChart2 } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

interface ApplicationRow {
  id: number;
  application_id: string;
  hof_name: string;
  hof_aadhaar: string;
  hof_mobile: string;
  status: string;
  updated_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();

  // Session & Theme
  const [token, setToken] = useState('');
  const [darkMode, setDarkMode] = useState(false);

  // Lists & Filters
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('annapurna_token');
    const savedUser = localStorage.getItem('annapurna_user');
    
    if (!savedToken || !savedUser) {
      router.push('/');
      return;
    }
    
    // Check if role is admin (for strict routing, though we let operators view/test too)
    const userObj = JSON.parse(savedUser);
    
    setToken(savedToken);
    setDarkMode(document.documentElement.classList.contains('dark'));
    fetchApplications(savedToken);
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

  const fetchApplications = async (authToken: string, search = '', status = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${BACKEND_URL}/api/applications`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          query: search || undefined,
          status: status || undefined
        }
      });
      setApplications(response.data);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch admin application rosters.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    fetchApplications(token, searchQuery, e.target.value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchApplications(token, searchQuery, statusFilter);
  };

  // Status updates: Approve / Reject application directly
  const handleUpdateStatus = async (appId: number, nextStatus: 'approved' | 'rejected') => {
    setActionLoading(`status-${appId}`);
    try {
      // Fetch current app details first
      const getRes = await axios.get(`${BACKEND_URL}/api/applications/${appId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Send PUT update with modified status
      await axios.put(
        `${BACKEND_URL}/api/applications/${appId}`,
        {
          ...getRes.data,
          status: nextStatus
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Refresh list
      fetchApplications(token, searchQuery, statusFilter);
    } catch (err: any) {
      console.error(err);
      alert('Failed to update application review status.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async (appId: number, applicationNum: string) => {
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
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrintPdf = async (appId: number) => {
    setActionLoading(`print-${appId}`);
    try {
      const response = await axios.get(`${BACKEND_URL}/api/applications/${appId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const file = new Blob([response.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      
      const newWindow = window.open(fileURL);
      if (newWindow) {
        newWindow.addEventListener('load', () => {
          newWindow.print();
        });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to print PDF.');
    } finally {
      setActionLoading(null);
    }
  };

  // Export Excel triggers API route download
  const handleExportExcel = async () => {
    setActionLoading('excel');
    try {
      const response = await axios.get(`${BACKEND_URL}/api/applications/export-excel`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const file = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileURL = URL.createObjectURL(file);
      
      const link = document.createElement('a');
      link.href = fileURL;
      link.setAttribute('download', 'Annapurna_Applications_Report.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      alert('Failed to export Excel report.');
    } finally {
      setActionLoading(null);
    }
  };

  // Metrics Calculations
  const totalCount = applications.length;
  const pendingCount = applications.filter(a => a.status === 'submitted').length;
  const approvedCount = applications.filter(a => a.status === 'approved').length;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* Top Navbar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-40 transition-colors shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/dashboard')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xs font-bold text-slate-400 uppercase leading-none">{t('title')}</h1>
            <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 tracking-tight mt-1">
              Admin Control Panel
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{language === 'en' ? 'বাংলা' : 'English'}</span>
          </button>

          <button 
            onClick={toggleDarkMode}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* Admin Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6 animate-slide-up">
        
        {/* Status Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Admin Analytical Statistics */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{t('totalApplications')}</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{totalCount}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/30 text-slate-500 dark:text-slate-400 rounded-lg">
              <BarChart2 className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{t('pendingReviews')}</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{pendingCount}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500 rounded-lg">
              <Filter className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{t('approvedApps')}</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{approvedCount}</span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </section>

        {/* Search & Export Toolbar */}
        <section className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>
            
            {/* Status Dropdown */}
            <div className="w-full sm:w-48">
              <select
                value={statusFilter}
                onChange={handleFilterChange}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="">{t('allStatuses')}</option>
                <option value="draft">{t('draft')}</option>
                <option value="submitted">{t('submitted')}</option>
                <option value="approved">{t('approved')}</option>
                <option value="rejected">{t('rejected')}</option>
              </select>
            </div>
            
            <button type="submit" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold tracking-wider uppercase cursor-pointer">
              Apply Filter
            </button>
          </form>

          {/* Export to Excel sheet */}
          <button
            onClick={handleExportExcel}
            disabled={actionLoading === 'excel'}
            className="flex items-center gap-2 px-4 py-2 border border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 text-emerald-800 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{t('exportExcel')}</span>
          </button>
        </section>

        {/* Application Roster Table */}
        <section className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading operators data...</div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">No applications matched the criteria.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-900">
                    <th className="px-6 py-4">Application ID</th>
                    <th className="px-6 py-4">HOF Name</th>
                    <th className="px-6 py-4">Aadhaar Card</th>
                    <th className="px-6 py-4">Mobile</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Submitted Date</th>
                    <th className="px-6 py-4 text-right">Verification Review</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 text-slate-700 dark:text-slate-300 font-medium transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100">{app.application_id}</td>
                      <td className="px-6 py-4">{app.hof_name}</td>
                      <td className="px-6 py-4 font-mono">{app.hof_aadhaar}</td>
                      <td className="px-6 py-4 font-mono">{app.hof_mobile}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          app.status === 'approved'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                            : app.status === 'rejected'
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900'
                            : app.status === 'submitted'
                            ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-900'
                        }`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{new Date(app.updated_at).toLocaleDateString()}</td>
                      
                      {/* Approve / Reject buttons */}
                      <td className="px-6 py-4 text-right">
                        {app.status === 'submitted' ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleUpdateStatus(app.id, 'approved')}
                              disabled={actionLoading === `status-${app.id}`}
                              className="p-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 text-emerald-600 rounded-md cursor-pointer"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(app.id, 'rejected')}
                              disabled={actionLoading === `status-${app.id}`}
                              className="p-1 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 text-red-600 rounded-md cursor-pointer"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Decision Logged</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => router.push(`/apply?id=${app.id}&view=true`)}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          title={t('viewDetails')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        
                        {app.status === 'draft' && (
                          <button
                            onClick={() => router.push(`/apply?id=${app.id}`)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            title="Edit Draft"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => handlePrintPdf(app.id)}
                          disabled={actionLoading === `print-${app.id}`}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                          title={t('printPdf')}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        
                        <button
                          onClick={() => handleDownloadPdf(app.id, app.application_id)}
                          disabled={actionLoading === `pdf-${app.id}`}
                          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
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
      <footer className="w-full py-6 text-center text-[10px] text-slate-400 dark:text-slate-600 tracking-wide border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors mt-auto">
        © 2026 Department of Food & Supplies, Government of West Bengal. All rights reserved.
      </footer>
    </div>
  );
}
