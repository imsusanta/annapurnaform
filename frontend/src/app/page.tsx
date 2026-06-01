'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from './LanguageContext';
import { Sun, Moon, PlusCircle, Search, FileText, CheckCircle2, AlertCircle, Eye, Printer, Download, Languages, Trash2 } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

interface LocalApplication {
  id: string; // E.g. local-1717200000000
  application_id: string; // E.g. APN-20260601-XXXX
  status: string; // draft, submitted
  family: {
    hofName: string;
    hofAadhaar: string;
    hofMobile: string;
  };
  updated_at: string;
  formData: any; // Entire JSON state
}

export default function LocalDashboardPage() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  
  // Theme state
  const [darkMode, setDarkMode] = useState(false);
  
  // Applications lists & stats
  const [applications, setApplications] = useState<LocalApplication[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Initialize and load applications from localStorage
  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'));
    loadLocalApplications();
  }, []);

  const loadLocalApplications = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem('annapurna_applications');
      if (stored) {
        setApplications(JSON.parse(stored));
      } else {
        setApplications([]);
      }
    } catch (err) {
      console.error('Failed to read localStorage applications:', err);
    } finally {
      setLoading(false);
    }
  };

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

  // Create new local application draft
  const handleNewApplication = () => {
    setActionLoading('new');
    try {
      const timestamp = Date.now();
      const localId = `local-${timestamp}`;
      
      // Generate formatted readable application ID: APN-YYYYMMDD-XXXX
      const d = new Date();
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const randStr = String(Math.floor(1000 + Math.random() * 9000));
      const readableId = `APN-${dateStr}-${randStr}`;

      const newAppTemplate = {
        id: localId,
        application_id: readableId,
        status: 'draft',
        family: {
          hofName: '',
          hofAadhaar: '',
          hofMobile: ''
        },
        updated_at: new Date().toISOString(),
        formData: {
          application_id: readableId,
          status: 'draft',
          current_step: 1,
          ocr_confidence: 0,
          family: {
            hofName: '',
            hofDob: '',
            hofGender: '',
            hofAadhaar: '',
            hofMobile: '',
            hofAddress: '',
            hofCategory: '',
            householdId: '',
            aadhaarFrontPath: '',
            aadhaarBackPath: '',
            rationCardPath: '',
            casteCertificatePath: ''
          },
          members: [],
          bankDetails: [],
          epicDetails: {
            epicNumber: '',
            acPartNumber: '',
            voterCardPath: ''
          },
          panDetails: {
            panNumber: '',
            panHolderName: '',
            panCardPath: ''
          },
          assets: {
            familySize: '',
            puccaRooms: false,
            landOwnership: false,
            landSize: '',
            vehicleOwnership: false,
            vehicleNumber: '',
            vehicleModel: '',
            healthInsuranceType: '',
            premium: '',
            sumAssured: '',
            annualIncome: '',
            incomeTax_Yes: false, incomeTax_No: false,
            hofEmp_Govt: false, hofEmp_Private: false, hofEmp_FormalSelf: false, hofEmp_PartTime: false, hofEmp_InformalSelf: false, hofEmp_Migrant: false, hofEmp_Unemployed: false, hofEmp_Others: false,
            m1Emp_Govt: false, m1Emp_Private: false, m1Emp_FormalSelf: false, m1Emp_PartTime: false, m1Emp_InformalSelf: false, m1Emp_Migrant: false, m1Emp_Unemployed: false, m1Emp_Others: false,
            m2Emp_Govt: false, m2Emp_Private: false, m2Emp_FormalSelf: false, m2Emp_PartTime: false, m2Emp_InformalSelf: false, m2Emp_Migrant: false, m2Emp_Unemployed: false, m2Emp_Others: false,
            m3Emp_Govt: false, m3Emp_Private: false, m3Emp_FormalSelf: false, m3Emp_PartTime: false, m3Emp_InformalSelf: false, m3Emp_Migrant: false, m3Emp_Unemployed: false, m3Emp_Others: false,
            m4Emp_Govt: false, m4Emp_Private: false, m4Emp_FormalSelf: false, m4Emp_PartTime: false, m4Emp_InformalSelf: false, m4Emp_Migrant: false, m4Emp_Unemployed: false, m4Emp_Others: false,
            m5Emp_Govt: false, m5Emp_Private: false, m5Emp_FormalSelf: false, m5Emp_PartTime: false, m5Emp_InformalSelf: false, m5Emp_Migrant: false, m5Emp_Unemployed: false, m5Emp_Others: false,
          },
          education: [],
          children: [],
          governmentSchemes: {
            schemesList: [],
            dbtReceiving: false,
            agreeTerms: false
          },
          signature: {
            signatureData: '',
            signatureType: 'drawn'
          }
        }
      };

      const stored = localStorage.getItem('annapurna_applications');
      const appsList = stored ? JSON.parse(stored) : [];
      appsList.unshift(newAppTemplate);
      localStorage.setItem('annapurna_applications', JSON.stringify(appsList));

      router.push(`/apply?id=${localId}`);
    } catch (err) {
      console.error(err);
      alert('Failed to initialize a new local application.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete a local draft
  const handleDeleteLocalApp = (id: string) => {
    if (!confirm(language === 'en' ? 'Are you sure you want to delete this draft?' : 'আপনি কি নিশ্চিত যে এই খসড়াটি মুছে ফেলতে চান?')) return;
    try {
      const stored = localStorage.getItem('annapurna_applications');
      if (stored) {
        const appsList = JSON.parse(stored) as LocalApplication[];
        const filtered = appsList.filter(a => a.id !== id);
        localStorage.setItem('annapurna_applications', JSON.stringify(filtered));
        setApplications(filtered);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Dynamic Stateless PDF compilation and download
  const handleDownloadPdf = async (app: LocalApplication) => {
    setActionLoading(`pdf-${app.id}`);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/pdf/generate`, app.formData, {
        responseType: 'blob'
      });
      
      const file = new Blob([response.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      
      const link = document.createElement('a');
      link.href = fileURL;
      link.setAttribute('download', `Annapurna_${app.application_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      console.error(err);
      alert('Failed to generate PDF. Make sure all Head of Family details are filled.');
    } finally {
      setActionLoading(null);
    }
  };

  // Dynamic Stateless PDF print preview
  const handlePrintPdf = async (app: LocalApplication) => {
    setActionLoading(`print-${app.id}`);
    try {
      const response = await axios.post(`${BACKEND_URL}/api/pdf/generate`, app.formData, {
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
    } catch (err: any) {
      console.error(err);
      alert('Failed to trigger print dialog.');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats
  const totalCount = applications.length;
  const draftCount = applications.filter(a => a.status === 'draft').length;
  const submittedCount = applications.filter(a => a.status === 'submitted').length;

  // Search Filter
  const filteredApps = applications.filter(a => {
    const q = searchQuery.toLowerCase();
    return (
      a.application_id.toLowerCase().includes(q) ||
      (a.family?.hofName || '').toLowerCase().includes(q) ||
      (a.family?.hofAadhaar || '').includes(q) ||
      (a.family?.hofMobile || '').includes(q)
    );
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      
      {/* Premium Sticky Header */}
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
            <p className="text-[10px] text-slate-400 font-semibold">{language === 'en' ? 'Private Local Storage Storage Mode' : 'ব্যক্তিগত লোকাল স্টোরেজ মোড'}</p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-3">
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
        </div>
      </header>

      {/* Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-8 animate-slide-up">
        
        {/* Statistics Blocks */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{language === 'en' ? 'Total Applications' : 'মোট আবেদনপত্র'}</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{totalCount}</span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{language === 'en' ? 'Drafts (In-Progress)' : 'অসম্পূর্ণ ড্রাফট'}</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{draftCount}</span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-500 rounded-lg">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">{language === 'en' ? 'Completed & Submitted' : 'সম্পূর্ণ ও সাবমিট করা'}</span>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{submittedCount}</span>
            </div>
            <div className="p-3 bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </section>

        {/* Large touch-friendly Action blocks */}
        <section className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Create New Local Application Card */}
            <button
              onClick={handleNewApplication}
              disabled={actionLoading === 'new'}
              className="flex flex-col items-center justify-center p-6 text-center rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-all group min-h-[160px] cursor-pointer"
            >
              <PlusCircle className="w-10 h-10 text-emerald-600 dark:text-emerald-500 group-hover:scale-110 transition-transform mb-3" />
              <span className="text-base font-extrabold text-slate-800 dark:text-slate-200 block">{t('newApplication')}</span>
              <span className="text-xs text-slate-400 mt-1">{language === 'en' ? 'Start a fresh 5-stage sequential local application' : 'নতুন ৫-ধাপ বিশিষ্ট ব্যক্তিগত অন্নপূর্ণা ফর্ম পূরণ শুরু করুন'}</span>
            </button>

            {/* Quick Local Search Box */}
            <div className="flex flex-col justify-between p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
              <div>
                <span className="text-base font-extrabold text-slate-800 dark:text-slate-200 block mb-2">{t('searchApplication')}</span>
                <span className="text-xs text-slate-400 block mb-4">{language === 'en' ? 'Search locally by HOF name, Aadhaar or mobile' : 'প্রধানের নাম, আধার বা মোবাইল দিয়ে খুঁজুন'}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === 'en' ? 'Search records...' : 'তথ্য খুঁজুন...'}
                  className="flex-1 px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-semibold focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

          </div>
        </section>

        {/* Local Applications Table */}
        <section className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-900 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{language === 'en' ? 'My Saved Applications' : 'আমার সংরক্ষিত আবেদনসমূহ'}</h3>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')} 
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                Clear Search
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs font-semibold text-slate-400">Loading local records...</div>
          ) : filteredApps.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400 dark:text-slate-500">
              {searchQuery ? (language === 'en' ? 'No matching records found.' : 'কোনো তথ্য মিলছে না।') : (language === 'en' ? 'No applications created yet. Click New Application above to start.' : 'এখনও কোনো আবেদন তৈরি করা হয়নি।')}
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
                    <th className="px-6 py-4">{language === 'en' ? 'Saved Time' : 'সংরক্ষণের সময়'}</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                  {filteredApps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 text-slate-700 dark:text-slate-300 font-medium transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100">{app.application_id}</td>
                      <td className="px-6 py-4 font-bold">{app.family.hofName || <span className="text-slate-400 italic">Not set</span>}</td>
                      <td className="px-6 py-4 font-mono">{app.family.hofAadhaar || '—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          app.status === 'submitted' 
                            ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-900' 
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-500 border border-amber-200 dark:border-amber-900'
                        }`}>
                          {app.status === 'submitted' ? (language === 'en' ? 'Submitted' : 'সম্পন্ন') : (language === 'en' ? 'Draft' : 'খসড়া')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{new Date(app.updated_at).toLocaleString()}</td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        
                        {/* Edit or View Draft */}
                        <button
                          onClick={() => router.push(`/apply?id=${app.id}`)}
                          className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-900 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{app.status === 'submitted' ? t('viewDetails') : t('editDraft')}</span>
                        </button>
                        
                        {/* Download PDF button */}
                        <button
                          onClick={() => handleDownloadPdf(app)}
                          disabled={actionLoading === `pdf-${app.id}`}
                          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title={language === 'en' ? 'Download PDF' : 'পিডিএফ ডাউনলোড'}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        
                        {/* Print PDF button */}
                        <button
                          onClick={() => handlePrintPdf(app)}
                          disabled={actionLoading === `print-${app.id}`}
                          className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title={language === 'en' ? 'Print Hardcopy' : 'ফর্ম প্রিন্ট'}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Draft */}
                        <button
                          onClick={() => handleDeleteLocalApp(app.id)}
                          className="p-2 border border-red-200 dark:border-red-950/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg cursor-pointer"
                          title={language === 'en' ? 'Delete Record' : 'রেকর্ড মুছুন'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
