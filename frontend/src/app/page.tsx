'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from './LanguageContext';
import { Sun, Moon, ArrowLeft, ArrowRight, Save, Eye, CheckCircle2, UploadCloud, Trash2, Printer, Download, Sparkles, Languages, RefreshCw, FileText, Camera, RotateCw, X, Wallet, Check, Plus } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

interface FamilyMember {
  name: string;
  dob: string;
  gender: string;
  relation: string;
  aadhaar: string;
  aadhaarPath?: string;
  epicNumber?: string;
  acPartNumber?: string;
  voterCardPath?: string;
  voterCardBackPath?: string;
  panNumber?: string;
  panCardPath?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  passbookPath?: string;
  isLiterate?: boolean;
  highestQualification?: string;
  employmentStatus?: string;
  caaStatus?: string;
  caaNumber?: string;
  otherCardType?: string;
  otherCardNumber?: string;
  otherCardIssueDate?: string;
  tribunalStatus?: string;
  tribunalDetails?: string;
  dbtReceiving?: boolean;
  dbtSchemes?: string;
}

interface BankInfo {
  memberAadhaar: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  passbookPath?: string;
}

interface ChildRecord {
  name: string;
  className: string;
  schoolName: string;
  schoolType: string;
  isVaccinated: boolean;
  vaccinationCardId: string;
}

interface EducationRecord {
  memberAadhaar: string;
  isLiterate: boolean;
  highestQualification: string;
}

interface OverlayField {
  id: string; // formData dot path, e.g., 'family.hofName'
  type: 'text' | 'checkbox' | 'date' | 'select';
  left: string; // CSS percentage, e.g., '37%'
  top: string;  // CSS percentage, e.g., '20%'
  width?: string;
  height?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  docUploadType?: string; // OCR document type associated with this field group
}

// PDF.js renderer component
interface PdfPageRendererProps {
  pdfUrl: string;
  pageNumber: number;
  scale?: number;
  onRenderSuccess?: (width: number, height: number) => void;
  children?: React.ReactNode;
}

function PdfPageRenderer({ pdfUrl, pageNumber, scale = 1.3, onRenderSuccess, children }: PdfPageRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const render = async () => {
      try {
        if (!(window as any).pdfjsLib) {
          await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
            script.onload = () => {
              (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
              resolve(true);
            };
            document.body.appendChild(script);
          });
        }

        const pdfjs = (window as any).pdfjsLib;
        const pdf = await pdfjs.getDocument(pdfUrl).promise;
        const page = await pdf.getPage(pageNumber);

        if (!active) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        if (active) {
          setLoading(false);
          if (onRenderSuccess) {
            onRenderSuccess(viewport.width, viewport.height);
          }
        }
      } catch (err) {
        console.error('PDF.js rendering error:', err);
      }
    };

    render();

    return () => {
      active = false;
    };
  }, [pdfUrl, pageNumber, scale]);

  return (
    <div className="relative flex justify-center bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl overflow-hidden shadow-md">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-950/80 z-10 text-xs font-semibold text-slate-500">
          Rendering Form Page {pageNumber}...
        </div>
      )}
      <div className="relative mx-auto">
        <canvas ref={canvasRef} className="max-w-full h-auto block" />
        {!loading && children}
      </div>
    </div>
  );
}

// Core Apply Wizard Component
function ApplyWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appId = searchParams.get('id');
  const isViewOnly = searchParams.get('view') === 'true';
  const { t, language, setLanguage } = useLanguage();

  // Theme state
  const [darkMode, setDarkMode] = useState(false);
  const [token, setToken] = useState('');

  // Active PDF Page number (1 to 11)
  const [step, setStep] = useState(1);
  const [wizardStage, setWizardStage] = useState<'scan' | 'form' | 'preview' | 'payment' | 'download'>('scan');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'verifying' | 'success'>('pending');
  const [formTab, setFormTab] = useState<'hof' | 'members' | 'bank' | 'schemes'>('hof');
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  
  // Preview mode: 'edit' shows template overlay, 'preview' shows compiled filled PDF
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // OCR processing state
  const [ocrLoading, setOcrLoading] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number>(0);
  const [ocrFeedback, setOcrFeedback] = useState<string | null>(null);

  // Camera scanning state
  const [cameraActive, setCameraActive] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Pad arrays utility to ensure nested indices always exist
  const padArrays = (data: any) => {
    const members = [...(data.members || [])];
    while (members.length < 5) {
      members.push({ name: '', dob: '', gender: '', relation: '', aadhaar: '' });
    }

    const bankDetails = [...(data.bankDetails || [])];
    while (bankDetails.length < 6) {
      bankDetails.push({ memberAadhaar: '', bankName: '', accountNumber: '', ifsc: '' });
    }

    const education = [...(data.education || [])];
    while (education.length < 6) {
      education.push({ memberAadhaar: '', isLiterate: true, highestQualification: '' });
    }

    const children = [...(data.children || [])];
    while (children.length < 4) {
      children.push({ name: '', className: '', schoolName: '', schoolType: '', isVaccinated: false, vaccinationCardId: '' });
    }

    return { ...data, members, bankDetails, education, children };
  };

  // State model matching DB
  const [formData, setFormData] = useState({
    application_id: undefined as number | undefined,
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
    members: [] as FamilyMember[],
    bankDetails: [] as BankInfo[],
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
      constitutionalPost_Yes: false, constitutionalPost_No: false, constitutionalPost_Member: '',
      govPensioner_Yes: false, govPensioner_No: false, govPensioner_Member: '',
      gstRegistered_Yes: false, gstRegistered_No: false, gstin: '',
      // Mapped checkboxes for UI
      hofEmp_Govt: false, hofEmp_Private: false, hofEmp_FormalSelf: false, hofEmp_PartTime: false, hofEmp_InformalSelf: false, hofEmp_Migrant: false, hofEmp_Unemployed: false, hofEmp_Others: false,
      m1Emp_Govt: false, m1Emp_Private: false, m1Emp_FormalSelf: false, m1Emp_PartTime: false, m1Emp_InformalSelf: false, m1Emp_Migrant: false, m1Emp_Unemployed: false, m1Emp_Others: false,
      m2Emp_Govt: false, m2Emp_Private: false, m2Emp_FormalSelf: false, m2Emp_PartTime: false, m2Emp_InformalSelf: false, m2Emp_Migrant: false, m2Emp_Unemployed: false, m2Emp_Others: false,
      m3Emp_Govt: false, m3Emp_Private: false, m3Emp_FormalSelf: false, m3Emp_PartTime: false, m3Emp_InformalSelf: false, m3Emp_Migrant: false, m3Emp_Unemployed: false, m3Emp_Others: false,
      m4Emp_Govt: false, m4Emp_Private: false, m4Emp_FormalSelf: false, m4Emp_PartTime: false, m4Emp_InformalSelf: false, m4Emp_Migrant: false, m4Emp_Unemployed: false, m4Emp_Others: false,
      m5Emp_Govt: false, m5Emp_Private: false, m5Emp_FormalSelf: false, m5Emp_PartTime: false, m5Emp_InformalSelf: false, m5Emp_Migrant: false, m5Emp_Unemployed: false, m5Emp_Others: false,
    },
    education: [] as EducationRecord[],
    children: [] as ChildRecord[],
    governmentSchemes: {
      schemesList: [] as string[],
      dbtReceiving: false,
      agreeTerms: false
    },
    signature: {
      signatureData: '',
      signatureType: 'drawn'
    }
  });

  // HTML5 Canvas for Signature Box Page 10
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Dot-notation field accessors for generic binding
  const getFieldValue = (path: string): any => {
    const parts = path.split('.');
    let val: any = formData;
    for (const part of parts) {
      if (val === undefined || val === null) return '';
      val = val[part];
    }
    return val === undefined ? '' : val;
  };

  const setFieldValue = (path: string, val: any) => {
    setFormData(prev => {
      const next = JSON.parse(JSON.stringify(prev)); // Deep clone
      const parts = path.split('.');
      let current = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined) {
          current[part] = isNaN(Number(parts[i+1])) ? {} : [];
        }
        current = current[part];
      }
      current[parts[parts.length - 1]] = val;
      return next;
    });
  };

  // Helper to resolve custom checkboxes (e.g. SC, ST, Male, Female, Yes/No checks)
  const getFieldChecked = (fieldId: string): boolean => {
    if (fieldId === 'family.hofCategory_SC') return formData.family.hofCategory === 'SC';
    if (fieldId === 'family.hofCategory_ST') return formData.family.hofCategory === 'ST';
    if (fieldId === 'family.hofCategory_OBC') return formData.family.hofCategory === 'OBC';
    if (fieldId === 'family.hofCategory_General') return formData.family.hofCategory === 'General' || formData.family.hofCategory === 'General / OBC';
    
    if (fieldId === 'family.hofGender_Male') return formData.family.hofGender === 'Male';
    if (fieldId === 'family.hofGender_Female') return formData.family.hofGender === 'Female';
    if (fieldId === 'family.hofGender_Other') return formData.family.hofGender === 'Other';
    
    if (fieldId === 'family.hasRation_Yes') return !!formData.family.householdId;
    if (fieldId === 'family.hasRation_No') return !formData.family.householdId;
    
    if (fieldId === 'family.rationType_SPHH') return formData.family.householdId ? true : false; // Bind standard ration types
    
    if (fieldId === 'assets.healthInsurance_No') return formData.assets.healthInsuranceType === 'None' || !formData.assets.healthInsuranceType;
    if (fieldId === 'assets.healthInsurance_Yes') return formData.assets.healthInsuranceType !== 'None' && !!formData.assets.healthInsuranceType;
    if (fieldId === 'assets.healthInsuranceGovt') return formData.assets.healthInsuranceType === 'Govt';
    if (fieldId === 'assets.healthInsurancePrivate') return formData.assets.healthInsuranceType === 'Private';

    if (fieldId.endsWith('_Yes')) {
      const mainId = fieldId.substring(0, fieldId.length - 4);
      return getFieldValue(mainId) === true;
    }
    if (fieldId.endsWith('_No')) {
      const mainId = fieldId.substring(0, fieldId.length - 3);
      return getFieldValue(mainId) === false;
    }

    if (fieldId.startsWith('children.')) {
      const parts = fieldId.split('.');
      const idx = parseInt(parts[1], 10);
      const sub = parts[2];
      if (sub === 'schoolType_Govt') return formData.children[idx]?.schoolType === 'Govt';
      if (sub === 'schoolType_Private') return formData.children[idx]?.schoolType === 'Private';
    }
    
    return !!getFieldValue(fieldId);
  };

  const handleCheckboxToggle = (fieldId: string) => {
    if (isViewOnly) return;
    
    if (fieldId === 'family.hofCategory_SC') setFieldValue('family.hofCategory', 'SC');
    else if (fieldId === 'family.hofCategory_ST') setFieldValue('family.hofCategory', 'ST');
    else if (fieldId === 'family.hofCategory_OBC') setFieldValue('family.hofCategory', 'OBC');
    else if (fieldId === 'family.hofCategory_General') setFieldValue('family.hofCategory', 'General');
    
    else if (fieldId === 'family.hofGender_Male') setFieldValue('family.hofGender', 'Male');
    else if (fieldId === 'family.hofGender_Female') setFieldValue('family.hofGender', 'Female');
    else if (fieldId === 'family.hofGender_Other') setFieldValue('family.hofGender', 'Other');
    
    else if (fieldId === 'family.hasRation_Yes') setFieldValue('family.householdId', 'WBRC-PENDING');
    else if (fieldId === 'family.hasRation_No') setFieldValue('family.householdId', '');

    else if (fieldId === 'assets.healthInsurance_No') {
      setFieldValue('assets.healthInsuranceType', 'None');
      setFieldValue('assets.premium', '');
      setFieldValue('assets.sumAssured', '');
    } else if (fieldId === 'assets.healthInsurance_Yes') {
      setFieldValue('assets.healthInsuranceType', 'Govt');
    } else if (fieldId === 'assets.healthInsuranceGovt') {
      setFieldValue('assets.healthInsuranceType', 'Govt');
    } else if (fieldId === 'assets.healthInsurancePrivate') {
      setFieldValue('assets.healthInsuranceType', 'Private');
    }
    
    else if (fieldId.startsWith('children.')) {
      const parts = fieldId.split('.');
      const idx = parseInt(parts[1], 10);
      const sub = parts[2];
      if (sub === 'schoolType_Govt') setFieldValue(`children.${idx}.schoolType`, 'Govt');
      else if (sub === 'schoolType_Private') setFieldValue(`children.${idx}.schoolType`, 'Private');
    }
    
    else if (fieldId.endsWith('_Yes')) {
      const mainId = fieldId.substring(0, fieldId.length - 4);
      setFieldValue(mainId, true);
    }
    else if (fieldId.endsWith('_No')) {
      const mainId = fieldId.substring(0, fieldId.length - 3);
      setFieldValue(mainId, false);
    }
    else {
      // Toggle standard boolean field
      setFieldValue(fieldId, !getFieldValue(fieldId));
    }
  };

  const getFieldLabel = (fieldId: string): string => {
    const isEn = language === 'en';
    
    // Member matching (e.g. members.0.name)
    const memberMatch = fieldId.match(/^members\.(\d+)\.(.+)$/);
    if (memberMatch) {
      const index = parseInt(memberMatch[1], 10) + 1;
      const subField = memberMatch[2];
      if (subField === 'name') return isEn ? `Member ${index} Full Name` : `সদস্য ${index}-এর সম্পূর্ণ নাম`;
      if (subField === 'dob') return isEn ? `Member ${index} DOB` : `সদস্য ${index}-এর জন্ম তারিখ`;
      if (subField === 'gender') return isEn ? `Member ${index} Gender` : `সদস্য ${index}-এর লিঙ্গ`;
      if (subField === 'relation') return isEn ? `Member ${index} Relation with Head of Family` : `সদস্য ${index}-এর পরিবারের প্রধানের সাথে সম্পর্ক`;
      if (subField === 'aadhaar') return isEn ? `Member ${index} Aadhaar Number` : `সদস্য ${index}-এর আধার নম্বর`;
    }

    // Bank Details matching (bankDetails.0.bankName etc.)
    const bankMatch = fieldId.match(/^bankDetails\.(\d+)\.(.+)$/);
    if (bankMatch) {
      const index = parseInt(bankMatch[1], 10);
      const personLabel = index === 0 
        ? (isEn ? 'HOF (Head of Family)' : 'প্রধান (HOF)') 
        : (isEn ? `Member ${index}` : `সদস্য ${index}`);
      const subField = bankMatch[2];
      if (subField === 'bankName') return isEn ? `${personLabel} Bank Name` : `${personLabel}-এর ব্যাংকের নাম`;
      if (subField === 'accountNumber') return isEn ? `${personLabel} Account Number` : `${personLabel}-এর অ্যাকাউন্ট নম্বর`;
      if (subField === 'ifsc') return isEn ? `${personLabel} IFSC Code` : `${personLabel}-এর IFSC কোড`;
    }

    // Education Record matching (education.0.highestQualification etc.)
    const eduMatch = fieldId.match(/^education\.(\d+)\.(.+)$/);
    if (eduMatch) {
      const index = parseInt(eduMatch[1], 10);
      const personLabel = index === 0 
        ? (isEn ? 'HOF (Head of Family)' : 'প্রধান (HOF)') 
        : (isEn ? `Member ${index}` : `সদস্য ${index}`);
      const subField = eduMatch[2];
      if (subField === 'isLiterate_Yes') return isEn ? `${personLabel} Literate: Yes` : `${personLabel} শিক্ষিত: হ্যাঁ`;
      if (subField === 'isLiterate_No') return isEn ? `${personLabel} Literate: No` : `${personLabel} শিক্ষিত: না`;
      if (subField === 'highestQualification') return isEn ? `${personLabel} Highest Qualification` : `${personLabel}-এর সর্বোচ্চ শিক্ষাগত যোগ্যতা`;
    }

    // Children matching (children.0.name etc.)
    const childMatch = fieldId.match(/^children\.(\d+)\.(.+)$/);
    if (childMatch) {
      const index = parseInt(childMatch[1], 10) + 1;
      const subField = childMatch[2];
      if (subField === 'name') return isEn ? `Child ${index} Name` : `শিশু ${index}-এর নাম`;
      if (subField === 'className') return isEn ? `Child ${index} Class` : `শিশু ${index}-এর শ্রেণী`;
      if (subField === 'schoolName') return isEn ? `Child ${index} School Name` : `শিশু ${index}-এর বিদ্যালয়ের নাম`;
      if (subField === 'schoolType_Govt') return isEn ? `Child ${index} School Type: Govt` : `শিশু ${index}-এর বিদ্যালয়: সরকারি`;
      if (subField === 'schoolType_Private') return isEn ? `Child ${index} School Type: Private` : `শিশু ${index}-এর বিদ্যালয়: বেসরকারি`;
    }

    // Employment matching (assets.hofEmp_Govt, assets.m1Emp_Govt etc.)
    const empMatch = fieldId.match(/^assets\.(hof|m1|m2|m3|m4|m5)Emp_(.+)$/);
    if (empMatch) {
      const who = empMatch[1];
      const category = empMatch[2];
      const personLabel = who === 'hof' 
        ? (isEn ? 'HOF (Head of Family)' : 'প্রধান (HOF)') 
        : (isEn ? `Member ${who.substring(1)}` : `সদস্য ${who.substring(1)}`);
      
      const categoryLabels: Record<string, {en: string, bn: string}> = {
        Govt: { en: 'Govt. Job', bn: 'সরকারি চাকরি' },
        Private: { en: 'Private Job', bn: 'বেসরকারি চাকরি' },
        FormalSelf: { en: 'Formal Self-Employed', bn: 'স্বনির্ভর (আনুষ্ঠানিক)' },
        PartTime: { en: 'Part-Time / Casual', bn: 'পার্ট-টাইম / দৈনিক মজুরি' },
        InformalSelf: { en: 'Informal Self-Employed', bn: 'স্বনির্ভর (অনানুষ্ঠানিক)' },
        Migrant: { en: 'Migrant Worker', bn: 'পরিযায়ী শ্রমিক' },
        Unemployed: { en: 'Unemployed', bn: 'বেকার / কাজ নেই' },
        Others: { en: 'Other Occupation', bn: 'অন্যান্য জীবিকা' }
      };

      const label = categoryLabels[category] || { en: category, bn: category };
      return isEn ? `${personLabel} - ${label.en}` : `${personLabel} - ${label.bn}`;
    }

    // Static Dictionary for other fields
    const dict: Record<string, { en: string; bn: string }> = {
      'family.hofName': { en: 'HOF Full Name', bn: 'প্রধানের নাম (আধার অনুযায়ী)' },
      'family.hofDob': { en: 'HOF Date of Birth', bn: 'প্রধানের জন্ম তারিখ' },
      'family.hofGender_Male': { en: 'HOF Gender: Male', bn: 'প্রধানের লিঙ্গ: পুরুষ' },
      'family.hofGender_Female': { en: 'HOF Gender: Female', bn: 'প্রধানের লিঙ্গ: মহিলা' },
      'family.hofGender_Other': { en: 'HOF Gender: Other', bn: 'প্রধানের লিঙ্গ: অন্যান্য' },
      'family.hofAadhaar': { en: 'HOF Aadhaar Number', bn: 'প্রধানের আধার নম্বর' },
      'family.householdId': { en: 'Digital Ration Card ID', bn: 'রেশন কার্ড নম্বর' },
      'family.hofAddress': { en: 'HOF Residential Address', bn: 'প্রধানের আবাসিক ঠিকানা' },
      'family.hofMobile': { en: 'HOF Mobile Number', bn: 'প্রধানের মোবাইল নম্বর' },
      
      'epicDetails.epicNumber': { en: 'HOF Voter Card (EPIC)', bn: 'প্রধানের ভোটার কার্ড (EPIC)' },
      'epicDetails.acPartNumber': { en: 'Voter List Part No.', bn: 'ভোটার তালিকার পার্ট নম্বর' },

      'family.hofCategory_SC': { en: 'Category: SC', bn: 'তপশিলি জাতি (SC)' },
      'family.hofCategory_ST': { en: 'Category: ST', bn: 'তপশিলি উপজাতি (ST)' },
      'family.hofCategory_OBC': { en: 'Category: OBC', bn: 'ওবিসি (OBC)' },
      'family.hofCategory_General': { en: 'Category: General', bn: 'সাধারণ (General)' },

      'family.hasRation_Yes': { en: 'Has Ration Card: Yes', bn: 'রেশন কার্ড আছে: হ্যাঁ' },
      'family.hasRation_No': { en: 'Has Ration Card: No', bn: 'রেশন কার্ড আছে: না' },
      'family.rationType_SPHH': { en: 'Ration Type (SPHH/AAY)', bn: 'রেশন কার্ডের ধরণ' },

      'assets.incomeTax_Yes': { en: 'Income Tax Payer: Yes', bn: 'আয়কর দাতা: হ্যাঁ' },
      'assets.incomeTax_No': { en: 'Income Tax Payer: No', bn: 'আয়কর দাতা: না' },
      'panDetails.panHolderName': { en: 'PAN Holder Name', bn: 'প্যান কার্ড ধারকের নাম' },
      'panDetails.panNumber': { en: 'PAN Card Number', bn: 'প্যান কার্ড নম্বর' },

      'assets.puccaRooms_Yes': { en: 'Pucca Rooms: Yes', bn: 'পাকা ঘর আছে: হ্যাঁ' },
      'assets.puccaRooms_No': { en: 'Pucca Rooms: No', bn: 'পাকা ঘর আছে: না' },
      'assets.landOwnership_Yes': { en: 'Land Ownership: Yes', bn: 'কৃষি জমি আছে: হ্যাঁ' },
      'assets.landOwnership_No': { en: 'Land Ownership: No', bn: 'কৃষি জমি আছে: না' },
      'assets.landSize': { en: 'Land Size (Decimals)', bn: 'জমির পরিমাণ (শতক)' },

      'assets.vehicleOwnership_Yes': { en: 'Vehicle: Yes', bn: 'যানবাহন আছে: হ্যাঁ' },
      'assets.vehicleOwnership_No': { en: 'Vehicle: No', bn: 'যানবাহন আছে: না' },
      'assets.vehicleNumberCount': { en: 'Number of Vehicles', bn: 'যানবাহনের সংখ্যা' },
      'assets.vehicleModel': { en: 'Vehicle Model', bn: 'যানবাহনের মডেল' },
      'assets.vehicleNumber': { en: 'Vehicle Registration No.', bn: 'যানবাহনের নম্বর' },

      'assets.healthInsurance_No': { en: 'Health Insurance: No', bn: 'স্বাস্থ্য বীমা আছে: না' },
      'assets.healthInsurance_Yes': { en: 'Health Insurance: Yes', bn: 'স্বাস্থ্য বীমা আছে: হ্যাঁ' },
      'assets.healthInsuranceGovt': { en: 'Insurance: Govt (Swasthya Sathi)', bn: 'সরকারি স্বাস্থ্য বীমা' },
      'assets.healthInsurancePrivate': { en: 'Insurance: Private', bn: 'বেসরকারি স্বাস্থ্য বীমা' },
      'assets.premium': { en: 'Annual Premium Paid', bn: 'বার্ষিক প্রিমিয়াম' },
      'assets.sumAssured': { en: 'Sum Assured', bn: 'বীমাকৃত অর্থ' },
      'family.literateCount': { en: 'Total Literate Members', bn: 'মোট শিক্ষিত সদস্য সংখ্যা' },
      'family.illiterateCount': { en: 'Total Illiterate Members', bn: 'মোট অশিক্ষিত সদস্য সংখ্যা' },
      
      'assets.familySize': { en: 'Number of Family Members', bn: 'পরিবারের সদস্য সংখ্যা' },
      'assets.annualIncome': { en: 'Annual Family Income', bn: 'পরিবারের বার্ষিক মোট আয়' },
      'governmentSchemes.agreeTerms': { en: 'Accept Terms & Conditions', bn: 'শর্তাবলী মেনে নিচ্ছি' }
    };

    const item = dict[fieldId];
    if (item) return isEn ? item.en : item.bn;

    return fieldId;
  };

  // Auth & Load state
  useEffect(() => {
    const savedToken = localStorage.getItem('annapurna_token') || 'mock_local_token';
    setToken(savedToken);
    setDarkMode(document.documentElement.classList.contains('dark'));

    if (appId) {
      if (String(appId).startsWith('local-')) {
        loadApplicationDataFromLocalStorage(String(appId));
      } else {
        loadApplicationData(savedToken, parseInt(appId));
      }
    } else {
      // Auto generate a new local ID
      const timestamp = Date.now();
      const localId = `local-${timestamp}`;
      
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

      try {
        const stored = localStorage.getItem('annapurna_applications');
        const appsList = stored ? JSON.parse(stored) : [];
        appsList.unshift(newAppTemplate);
        localStorage.setItem('annapurna_applications', JSON.stringify(appsList));
      } catch (e) {
        console.error(e);
      }

      router.replace(`/?id=${localId}`);
    }
  }, [appId]);

  const loadApplicationDataFromLocalStorage = (id: string) => {
    setLoading(true);
    try {
      const stored = localStorage.getItem('annapurna_applications');
      if (stored) {
        const appsList = JSON.parse(stored);
        const found = appsList.find((a: any) => a.id === id);
        if (found) {
          const padded = padArrays(found.formData);
          setFormData(prev => ({
            ...prev,
            ...padded,
            family: { ...prev.family, ...padded.family },
            epicDetails: { ...prev.epicDetails, ...padded.epicDetails },
            panDetails: { ...prev.panDetails, ...padded.panDetails },
            assets: { ...prev.assets, ...padded.assets },
            governmentSchemes: { ...prev.governmentSchemes, ...padded.governmentSchemes },
            signature: { ...prev.signature, ...padded.signature }
          }));
          if (found.status === 'submitted') {
            setWizardStage('download');
            setPaymentStatus('success');
          } else {
            setWizardStage('scan');
          }
        }
      }
    } catch (err) {
      console.error('Failed to load application data from localStorage:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load PDF Preview automatically when Entering Step 3 (Preview)
  useEffect(() => {
    if (wizardStage === 'preview' && appId && token) {
      const compilePdf = async () => {
        setPreviewLoading(true);
        try {
          await saveDraftToServer(false);
          const res = await axios.post(`${BACKEND_URL}/api/pdf/generate`, formData, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob'
          });
          const blob = new Blob([res.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
        } catch (err) {
          console.error("Error pre-loading PDF preview:", err);
        } finally {
          setPreviewLoading(false);
        }
      };
      compilePdf();
    }
  }, [wizardStage, appId, token]);

  // Periodic autosave
  useEffect(() => {
    if (isViewOnly || !appId) return;

    const timer = setInterval(() => {
      saveDraftToServer(false);
    }, 30000);

    return () => clearInterval(timer);
  }, [formData, appId]);

  const loadApplicationData = async (authToken: string, id: number) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/applications/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      // Pad returned database fields to avoid index errors
      const padded = padArrays(res.data);
      setFormData(prev => ({
        ...prev,
        ...padded,
        family: { ...prev.family, ...padded.family },
        epicDetails: { ...prev.epicDetails, ...padded.epicDetails },
        panDetails: { ...prev.panDetails, ...padded.panDetails },
        assets: { ...prev.assets, ...padded.assets },
        governmentSchemes: { ...prev.governmentSchemes, ...padded.governmentSchemes },
        signature: { ...prev.signature, ...padded.signature }
      }));
      if (res.data.current_step) setStep(res.data.current_step);
      if (res.data.ocr_confidence) setOcrConfidence(res.data.ocr_confidence);

      // Auto route to final stages if submitted or based on draft progress
      if (res.data.status === 'submitted') {
        setWizardStage('download');
        setPaymentStatus('success');
      } else if (res.data.current_step >= 10) {
        setWizardStage('preview');
      } else {
        setWizardStage('scan');
      }
    } catch (err) {
      console.error(err);
      setOcrFeedback('Failed to load application data.');
    } finally {
      setLoading(false);
    }
  };

  const saveDraftToServer = async (showUINotif = true): Promise<boolean> => {
    if (isViewOnly || !appId) return true;
    if (showUINotif) setSaveStatus('saving');

    if (String(appId).startsWith('local-')) {
      try {
        const stored = localStorage.getItem('annapurna_applications');
        if (stored) {
          const appsList = JSON.parse(stored);
          const idx = appsList.findIndex((a: any) => a.id === appId);
          if (idx !== -1) {
            appsList[idx].updated_at = new Date().toISOString();
            appsList[idx].status = formData.status || 'draft';
            appsList[idx].family = {
              hofName: formData.family?.hofName || '',
              hofAadhaar: formData.family?.hofAadhaar || '',
              hofMobile: formData.family?.hofMobile || ''
            };
            appsList[idx].formData = {
              ...formData,
              current_step: step,
              ocr_confidence: ocrConfidence
            };
            localStorage.setItem('annapurna_applications', JSON.stringify(appsList));
          }
        }
        if (showUINotif) setSaveStatus('saved');
        setLastSavedTime(new Date().toLocaleTimeString());
        return true;
      } catch (err) {
        console.error('Failed to save local draft:', err);
        if (showUINotif) setSaveStatus('error');
        return false;
      }
    }

    try {
      await axios.put(
        `${BACKEND_URL}/api/applications/${appId}`,
        {
          ...formData,
          current_step: step,
          ocr_confidence: ocrConfidence
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (showUINotif) setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      return true;
    } catch (err: any) {
      console.error(err);
      if (showUINotif) setSaveStatus('error');
      if (err.response?.data?.isDuplicateAadhaar) {
        alert(t('duplicateAadhaarError') || 'Error: Aadhaar card number is already registered in the system!');
      }
      return false;
    }
  };

  // OCR Upload and Extraction
  const handleFileUploadAndOcr = async (e: React.ChangeEvent<HTMLInputElement>, docType: string, memberIndex?: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setOcrLoading(memberIndex !== undefined ? `${docType}_${memberIndex}` : docType);
    setOcrFeedback(null);

    const uploadData = new FormData();
    uploadData.append('document', file);
    uploadData.append('documentType', docType);

    try {
      const response = await axios.post(`${BACKEND_URL}/api/ocr/upload`, uploadData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });

      const { extractedData, fileUrl, confidenceScore } = response.data;
      setOcrConfidence(confidenceScore);
      setOcrFeedback(t('ocrSuccess', { confidence: confidenceScore }));

      // Map OCR details into visual fields
      setFormData(prev => {
        const next = JSON.parse(JSON.stringify(prev)); // Deep copy
        
        if (docType === 'aadhaar_front') {
          next.family.hofName = extractedData.fullName || next.family.hofName;
          next.family.hofDob = extractedData.dob || next.family.hofDob;
          next.family.hofGender = extractedData.gender || next.family.hofGender;
          next.family.hofAadhaar = extractedData.aadhaarNumber || next.family.hofAadhaar;
          next.family.aadhaarFrontPath = fileUrl;
        } else if (docType === 'aadhaar_back') {
          next.family.hofAddress = extractedData.address || next.family.hofAddress;
          next.family.aadhaarBackPath = fileUrl;
        } else if (docType === 'ration_card') {
          next.family.householdId = extractedData.householdId || next.family.householdId;
          next.family.hofName = extractedData.fullName || next.family.hofName;
          next.family.rationCardPath = fileUrl;
        } else if (docType === 'caste_certificate') {
          next.family.casteCertificatePath = fileUrl;
          next.family.hofCategory = extractedData.category || next.family.hofCategory;
        } else if (docType === 'voter_card') {
          next.epicDetails.epicNumber = extractedData.epicNumber || next.epicDetails.epicNumber;
          next.epicDetails.acPartNumber = extractedData.acPartNumber || next.epicDetails.acPartNumber;
          next.epicDetails.voterCardPath = fileUrl;
        } else if (docType === 'pan_card') {
          next.panDetails.panNumber = extractedData.panNumber || next.panDetails.panNumber;
          next.panDetails.panCardPath = fileUrl;
        } else if (docType === 'passbook') {
          next.bankDetails[0] = {
            memberAadhaar: next.family.hofAadhaar || '',
            bankName: extractedData.bankName || '',
            accountNumber: extractedData.accountNumber || '',
            ifsc: extractedData.ifsc || '',
            passbookPath: fileUrl
          };
        } else if (docType === 'aadhaar_member' && memberIndex !== undefined) {
          if (next.members[memberIndex]) {
            next.members[memberIndex].name = extractedData.fullName || next.members[memberIndex].name;
            next.members[memberIndex].dob = extractedData.dob || next.members[memberIndex].dob;
            next.members[memberIndex].gender = extractedData.gender || next.members[memberIndex].gender;
            next.members[memberIndex].aadhaar = extractedData.aadhaarNumber || next.members[memberIndex].aadhaar;
            next.members[memberIndex].aadhaarPath = fileUrl;
          }
        } else if (docType === 'voter_front_member' && memberIndex !== undefined) {
          if (next.members[memberIndex]) {
            next.members[memberIndex].epicNumber = extractedData.epicNumber || next.members[memberIndex].epicNumber;
            next.members[memberIndex].acPartNumber = extractedData.acPartNumber || next.members[memberIndex].acPartNumber;
            next.members[memberIndex].voterCardPath = fileUrl;
          }
        } else if (docType === 'voter_back_member' && memberIndex !== undefined) {
          if (next.members[memberIndex]) {
            next.members[memberIndex].voterCardBackPath = fileUrl;
          }
        } else if (docType === 'pan_member' && memberIndex !== undefined) {
          if (next.members[memberIndex]) {
            next.members[memberIndex].panNumber = extractedData.panNumber || next.members[memberIndex].panNumber;
            next.members[memberIndex].panCardPath = fileUrl;
          }
        } else if (docType === 'passbook_member' && memberIndex !== undefined) {
          if (next.members[memberIndex]) {
            next.members[memberIndex].bankName = extractedData.bankName || next.members[memberIndex].bankName;
            next.members[memberIndex].accountNumber = extractedData.accountNumber || next.members[memberIndex].accountNumber;
            next.members[memberIndex].ifsc = extractedData.ifsc || next.members[memberIndex].ifsc;
            next.members[memberIndex].passbookPath = fileUrl;
          }
        }

        return next;
      });

    } catch (err: any) {
      console.error(err);
      setOcrFeedback(err.response?.data?.error || 'Failed to process document scanning.');
    } finally {
      setOcrLoading(null);
    }
  };

  const handleDeleteDocument = (docType: string, memberIndex?: number) => {
    if (isViewOnly) return;
    const confirmDelete = window.confirm(
      language === 'en'
        ? "Are you sure you want to delete this document? Any auto-filled data associated with it will also be cleared."
        : "আপনি কি এই নথিটি মুছে ফেলতে চান? এর সাথে সম্পর্কিত সমস্ত তথ্যও মুছে যাবে।"
    );
    if (!confirmDelete) return;

    setFormData(prev => {
      const next = JSON.parse(JSON.stringify(prev)); // Deep copy
      if (memberIndex !== undefined && next.members[memberIndex]) {
        if (docType === 'aadhaar_member') {
          next.members[memberIndex].aadhaarPath = '';
          next.members[memberIndex].name = '';
          next.members[memberIndex].dob = '';
          next.members[memberIndex].gender = '';
          next.members[memberIndex].aadhaar = '';
        } else if (docType === 'voter_front_member') {
          next.members[memberIndex].voterCardPath = '';
          next.members[memberIndex].epicNumber = '';
          next.members[memberIndex].acPartNumber = '';
        } else if (docType === 'voter_back_member') {
          next.members[memberIndex].voterCardBackPath = '';
        } else if (docType === 'pan_member') {
          next.members[memberIndex].panCardPath = '';
          next.members[memberIndex].panNumber = '';
        } else if (docType === 'passbook_member') {
          next.members[memberIndex].passbookPath = '';
          next.members[memberIndex].bankName = '';
          next.members[memberIndex].accountNumber = '';
          next.members[memberIndex].ifsc = '';
        }
      } else {
        if (docType === 'aadhaar_front') {
          next.family.aadhaarFrontPath = '';
          next.family.hofName = '';
          next.family.hofDob = '';
          next.family.hofGender = '';
          next.family.hofAadhaar = '';
        } else if (docType === 'aadhaar_back') {
          next.family.aadhaarBackPath = '';
          next.family.hofAddress = '';
        } else if (docType === 'ration_card') {
          next.family.rationCardPath = '';
          next.family.householdId = '';
        } else if (docType === 'caste_certificate') {
          next.family.casteCertificatePath = '';
          next.family.hofCategory = '';
        } else if (docType === 'voter_card') {
          next.epicDetails.voterCardPath = '';
          next.epicDetails.epicNumber = '';
          next.epicDetails.acPartNumber = '';
        } else if (docType === 'pan_card') {
          next.panDetails.panCardPath = '';
          next.panDetails.panNumber = '';
        } else if (docType === 'passbook') {
          if (next.bankDetails[0]) {
            next.bankDetails[0].passbookPath = '';
            next.bankDetails[0].bankName = '';
            next.bankDetails[0].accountNumber = '';
            next.bankDetails[0].ifsc = '';
          }
        }
      }
      return next;
    });
  };

  // Manage Camera Streaming Activation & Facing Mode
  useEffect(() => {
    if (!cameraActive) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      return;
    }

    let activeStream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error("Error playing video:", e));
        }
      } catch (err: any) {
        console.error("Camera access error:", err);
        // Try fallback without width/height ideal constraints
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode }, 
            audio: false 
          });
          activeStream = stream;
          setCameraStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(e => console.error("Error playing video fallback:", e));
          }
        } catch (fallbackErr: any) {
          console.error("Camera fallback access error:", fallbackErr);
          alert(language === 'en' 
            ? "Failed to open camera. Please grant camera permissions or use manual upload."
            : "ক্যামেরা খুলতে ব্যর্থ হয়েছে। অনুগ্রহ করে ক্যামেরার অনুমতি দিন অথবা ফাইল আপলোড অপশনটি ব্যবহার করুন।");
          setCameraActive(null);
        }
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraActive, facingMode]);

  // Capture Image from Video frame & Trigger OCR Upload
  const handleCapturePhoto = async () => {
    if (!videoRef.current || !cameraActive) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the current video frame on canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to Blob (file)
    canvas.toBlob(async (blob) => {
      if (!blob) return;

      // Create a File object from blob to pass to the upload OCR function
      const fileName = `camera_${cameraActive}_${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Stop camera stream
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      setCameraActive(null);

      // Trigger the OCR upload directly!
      const mockEvent = {
        target: {
          files: [file]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      let finalDocType = cameraActive;
      let memberIndex: number | undefined = undefined;
      const memberMatch = cameraActive.match(/^([a-z_]+)_member_(\d+)$/);
      if (memberMatch) {
        finalDocType = memberMatch[1] + '_member'; // e.g. 'aadhaar_member'
        memberIndex = parseInt(memberMatch[2], 10);
      }

      handleFileUploadAndOcr(mockEvent, finalDocType, memberIndex);
    }, 'image/png');
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

  // Signatures Drawing Controls
  useEffect(() => {
    if (step !== 10 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#1d4ed8'; // Blue ink
    ctx.lineWidth = 2.5;

    // Load pre-existing signature image
    if (formData.signature.signatureData) {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = formData.signature.signatureData;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, [step, formData.signature.signatureData]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isViewOnly || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    let clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    let clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    let clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setFieldValue('signature.signatureData', '');
  };

  const saveCanvasSignature = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    setFieldValue('signature.signatureData', dataUrl);
    alert(t('signatureCaptured'));
  };

  const handleUploadSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    const reader = new FileReader();
    reader.onload = () => {
      setFieldValue('signature.signatureData', reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // PDF Export Handlers
  const handleDownloadPdf = async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/pdf/generate`, formData, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = fileURL;
      link.setAttribute('download', `Annapurna_Application_${appId}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPdf = async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const res = await axios.post(`${BACKEND_URL}/api/pdf/generate`, formData, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      const file = new Blob([res.data], { type: 'application/pdf' });
      const fileURL = URL.createObjectURL(file);
      window.open(fileURL);
    } catch (err) {
      console.error(err);
      alert('Failed to print PDF.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitApplication = async () => {
    if (isViewOnly || !appId) return;

    setLoading(true);
    try {
      await axios.put(
        `${BACKEND_URL}/api/applications/${appId}`,
        {
          ...formData,
          status: 'submitted',
          current_step: step,
          ocr_confidence: ocrConfidence
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(t('submitSuccess'));
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      alert('Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  // Declarative Coordinate Fields Schema Page-by-Page
  const pageOverlays: Record<number, OverlayField[]> = {
    1: [
      { id: 'family.hofName', type: 'text', left: '37.0%', top: '20.0%', width: '33.0%', docUploadType: 'aadhaar_front' },
      { id: 'family.hofDob', type: 'date', left: '37.0%', top: '25.1%', width: '33.0%' },
      { id: 'family.hofGender_Male', type: 'checkbox', left: '44.2%', top: '30.9%', width: '2.5%', height: '1.5%' },
      { id: 'family.hofGender_Female', type: 'checkbox', left: '50.0%', top: '30.9%', width: '2.5%', height: '1.5%' },
      { id: 'family.hofGender_Other', type: 'checkbox', left: '55.4%', top: '30.9%', width: '2.5%', height: '1.5%' },
      { id: 'family.hofAadhaar', type: 'text', left: '37.0%', top: '33.2%', width: '33.0%' },
      { id: 'family.householdId', type: 'text', left: '37.0%', top: '36.6%', width: '33.0%', docUploadType: 'ration_card' },
      { id: 'assets.familySize', type: 'text', left: '37.0%', top: '39.6%', width: '33.0%' },
      { id: 'family.hofAddress', type: 'text', left: '37.0%', top: '42.6%', width: '33.0%', docUploadType: 'aadhaar_back' },
      { id: 'family.hofMobile', type: 'text', left: '37.0%', top: '49.6%', width: '33.0%' },
      
      // Member 1
      { id: 'members.0.name', type: 'text', left: '43.7%', top: '63.7%', width: '33.0%', docUploadType: 'aadhaar_member' },
      { id: 'members.0.dob', type: 'date', left: '43.7%', top: '65.3%', width: '33.0%' },
      { id: 'members.0.gender', type: 'select', left: '43.7%', top: '66.9%', width: '15.0%', options: [{value:'Male', label:t('male')},{value:'Female', label:t('female')},{value:'Other', label:t('other')}] },
      { id: 'members.0.relation', type: 'text', left: '62.2%', top: '68.4%', width: '16.0%' },
      { id: 'members.0.aadhaar', type: 'text', left: '45.4%', top: '70.0%', width: '33.0%' },

      // Member 2
      { id: 'members.1.name', type: 'text', left: '43.7%', top: '73.9%', width: '33.0%' },
      { id: 'members.1.dob', type: 'date', left: '43.7%', top: '75.5%', width: '33.0%' },
      { id: 'members.1.gender', type: 'select', left: '43.7%', top: '77.1%', width: '15.0%', options: [{value:'Male', label:t('male')},{value:'Female', label:t('female')},{value:'Other', label:t('other')}] },
      { id: 'members.1.relation', type: 'text', left: '62.2%', top: '78.7%', width: '16.0%' },
      { id: 'members.1.aadhaar', type: 'text', left: '45.4%', top: '80.3%', width: '33.0%' },

      // Member 3
      { id: 'members.2.name', type: 'text', left: '43.7%', top: '84.1%', width: '33.0%' },
      { id: 'members.2.dob', type: 'date', left: '43.7%', top: '85.5%', width: '33.0%' },
      { id: 'members.2.gender', type: 'select', left: '43.7%', top: '86.8%', width: '15.0%', options: [{value:'Male', label:t('male')},{value:'Female', label:t('female')},{value:'Other', label:t('other')}] },
      { id: 'members.2.relation', type: 'text', left: '62.2%', top: '88.2%', width: '16.0%' },
      { id: 'members.2.aadhaar', type: 'text', left: '45.4%', top: '89.6%', width: '33.0%' }
    ],
    2: [
      // Member 4
      { id: 'members.3.name', type: 'text', left: '43.7%', top: '9.0%', width: '33.0%' },
      { id: 'members.3.dob', type: 'date', left: '43.7%', top: '10.6%', width: '33.0%' },
      { id: 'members.3.gender', type: 'select', left: '43.7%', top: '12.1%', width: '15.0%', options: [{value:'Male', label:t('male')},{value:'Female', label:t('female')},{value:'Other', label:t('other')}] },
      { id: 'members.3.relation', type: 'text', left: '62.2%', top: '13.7%', width: '16.0%' },
      { id: 'members.3.aadhaar', type: 'text', left: '45.4%', top: '15.3%', width: '33.0%' },

      // Member 5
      { id: 'members.4.name', type: 'text', left: '43.7%', top: '21.4%', width: '33.0%' },
      { id: 'members.4.dob', type: 'date', left: '43.7%', top: '22.8%', width: '33.0%' },
      { id: 'members.4.gender', type: 'select', left: '43.7%', top: '24.1%', width: '15.0%', options: [{value:'Male', label:t('male')},{value:'Female', label:t('female')},{value:'Other', label:t('other')}] },
      { id: 'members.4.relation', type: 'text', left: '62.2%', top: '25.5%', width: '16.0%' },
      { id: 'members.4.aadhaar', type: 'text', left: '45.4%', top: '26.9%', width: '33.0%' },

      // Bank Details HOF
      { id: 'bankDetails.0.bankName', type: 'text', left: '47.0%', top: '28.3%', width: '33.0%', docUploadType: 'passbook' },
      { id: 'bankDetails.0.accountNumber', type: 'text', left: '43.7%', top: '31.0%', width: '33.0%' },
      { id: 'bankDetails.0.ifsc', type: 'text', left: '42.0%', top: '33.7%', width: '33.0%' },

      // Bank Details Member 1
      { id: 'bankDetails.1.bankName', type: 'text', left: '47.0%', top: '36.5%', width: '33.0%' },
      { id: 'bankDetails.1.accountNumber', type: 'text', left: '47.0%', top: '39.2%', width: '33.0%' },
      { id: 'bankDetails.1.ifsc', type: 'text', left: '42.0%', top: '41.9%', width: '33.0%' },

      // Member 2
      { id: 'bankDetails.2.bankName', type: 'text', left: '47.0%', top: '44.7%', width: '33.0%' },
      { id: 'bankDetails.2.accountNumber', type: 'text', left: '47.0%', top: '47.4%', width: '33.0%' },
      { id: 'bankDetails.2.ifsc', type: 'text', left: '42.0%', top: '50.1%', width: '33.0%' },

      // Member 3
      { id: 'bankDetails.3.bankName', type: 'text', left: '47.0%', top: '53.3%', width: '33.0%' },
      { id: 'bankDetails.3.accountNumber', type: 'text', left: '47.0%', top: '56.4%', width: '33.0%' },
      { id: 'bankDetails.3.ifsc', type: 'text', left: '42.0%', top: '59.6%', width: '33.0%' },

      // Member 4
      { id: 'bankDetails.4.bankName', type: 'text', left: '47.0%', top: '62.8%', width: '33.0%' },
      { id: 'bankDetails.4.accountNumber', type: 'text', left: '47.0%', top: '65.9%', width: '33.0%' },
      { id: 'bankDetails.4.ifsc', type: 'text', left: '42.0%', top: '69.1%', width: '33.0%' },

      // Member 5
      { id: 'bankDetails.5.bankName', type: 'text', left: '47.0%', top: '72.2%', width: '33.0%' },
      { id: 'bankDetails.5.accountNumber', type: 'text', left: '47.0%', top: '75.4%', width: '33.0%' },
      { id: 'bankDetails.5.ifsc', type: 'text', left: '42.0%', top: '78.6%', width: '33.0%' },

      // EPIC HOF
      { id: 'epicDetails.epicNumber', type: 'text', left: '47.0%', top: '81.8%', width: '33.0%', docUploadType: 'voter_card' },
      { id: 'epicDetails.acPartNumber', type: 'text', left: '48.7%', top: '83.3%', width: '33.0%' }
    ],
    3: [
      // HOF Category
      { id: 'family.hofCategory_SC', type: 'checkbox', left: '55.1%', top: '26.2%', width: '2.5%', height: '1.5%' },
      { id: 'family.hofCategory_ST', type: 'checkbox', left: '61.1%', top: '26.2%', width: '2.5%', height: '1.5%' },
      { id: 'family.hofCategory_OBC', type: 'checkbox', left: '38.4%', top: '27.7%', width: '2.5%', height: '1.5%' },
      { id: 'family.hofCategory_General', type: 'checkbox', left: '36.5%', top: '26.2%', width: '2.5%', height: '1.5%' },
      
      // Ration Card
      { id: 'family.hasRation_Yes', type: 'checkbox', left: '36.5%', top: '33.2%', width: '2.5%', height: '1.5%' },
      { id: 'family.hasRation_No', type: 'checkbox', left: '43.5%', top: '33.2%', width: '2.5%', height: '1.5%' },
      { id: 'family.rationType_SPHH', type: 'checkbox', left: '52.3%', top: '35.6%', width: '2.5%', height: '1.5%' },

      // Assets pucca rooms & land
      { id: 'assets.puccaRooms_Yes', type: 'checkbox', left: '36.5%', top: '44.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.puccaRooms_No', type: 'checkbox', left: '43.9%', top: '44.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.landOwnership_Yes', type: 'checkbox', left: '36.5%', top: '48.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.landOwnership_No', type: 'checkbox', left: '43.9%', top: '48.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.landSize', type: 'text', left: '37.0%', top: '53.1%', width: '15.0%' },
      
      // Vehicles
      { id: 'assets.vehicleOwnership_Yes', type: 'checkbox', left: '36.5%', top: '55.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.vehicleOwnership_No', type: 'checkbox', left: '43.9%', top: '55.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.vehicleNumberCount', type: 'text', left: '53.8%', top: '57.4%', width: '10.0%' },
      { id: 'assets.vehicleModel', type: 'text', left: '75.6%', top: '58.7%', width: '15.0%' },
      { id: 'assets.vehicleNumber', type: 'text', left: '57.1%', top: '60.5%', width: '20.0%' },

      // Insurance
      { id: 'assets.healthInsurance_No', type: 'checkbox', left: '36.5%', top: '62.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.healthInsurance_Yes', type: 'checkbox', left: '36.5%', top: '64.2%', width: '2.5%', height: '1.5%' },
      { id: 'assets.healthInsuranceGovt', type: 'checkbox', left: '40.4%', top: '68.3%', width: '2.5%', height: '1.5%' },
      { id: 'assets.healthInsurancePrivate', type: 'checkbox', left: '52.8%', top: '68.3%', width: '2.5%', height: '1.5%' },
      { id: 'assets.premium', type: 'text', left: '45.4%', top: '69.9%', width: '20.0%' },
      { id: 'assets.sumAssured', type: 'text', left: '48.7%', top: '71.5%', width: '20.0%' }
    ],
    4: [
      // Income Tax
      { id: 'assets.incomeTax_Yes', type: 'checkbox', left: '36.5%', top: '23.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.incomeTax_No', type: 'checkbox', left: '36.5%', top: '25.2%', width: '2.5%', height: '1.5%' },

      // PAN Details
      { id: 'panDetails.panHolderName', type: 'text', left: '39.5%', top: '26.7%', width: '25.0%' },
      { id: 'panDetails.panNumber', type: 'text', left: '41.0%', top: '28.1%', width: '25.0%', docUploadType: 'pan_card' },
      
      // HOF Employment Status Checkboxes
      { id: 'assets.hofEmp_Govt', type: 'checkbox', left: '36.5%', top: '53.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_Private', type: 'checkbox', left: '53.1%', top: '53.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_FormalSelf', type: 'checkbox', left: '45.8%', top: '52.0%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_PartTime', type: 'checkbox', left: '66.7%', top: '50.4%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_InformalSelf', type: 'checkbox', left: '50.0%', top: '48.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_Migrant', type: 'checkbox', left: '66.8%', top: '47.3%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_Unemployed', type: 'checkbox', left: '51.4%', top: '45.7%', width: '2.5%', height: '1.5%' },
      { id: 'assets.hofEmp_Others', type: 'checkbox', left: '65.0%', top: '45.7%', width: '2.5%', height: '1.5%' },

      // Member 1
      { id: 'assets.m1Emp_Govt', type: 'checkbox', left: '36.5%', top: '67.1%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_Private', type: 'checkbox', left: '53.1%', top: '67.1%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_FormalSelf', type: 'checkbox', left: '45.8%', top: '65.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_PartTime', type: 'checkbox', left: '66.7%', top: '63.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_InformalSelf', type: 'checkbox', left: '50.0%', top: '62.4%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_Migrant', type: 'checkbox', left: '66.8%', top: '60.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_Unemployed', type: 'checkbox', left: '51.4%', top: '59.2%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m1Emp_Others', type: 'checkbox', left: '65.0%', top: '59.2%', width: '2.5%', height: '1.5%' },

      // Member 2
      { id: 'assets.m2Emp_Govt', type: 'checkbox', left: '36.5%', top: '80.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_Private', type: 'checkbox', left: '53.1%', top: '80.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_FormalSelf', type: 'checkbox', left: '45.8%', top: '79.0%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_PartTime', type: 'checkbox', left: '66.7%', top: '77.4%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_InformalSelf', type: 'checkbox', left: '50.0%', top: '75.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_Migrant', type: 'checkbox', left: '66.8%', top: '74.3%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_Unemployed', type: 'checkbox', left: '51.4%', top: '72.7%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m2Emp_Others', type: 'checkbox', left: '65.0%', top: '72.7%', width: '2.5%', height: '1.5%' }
    ],
    5: [
      // Members Literacy checklist
      { id: 'family.literateCount', type: 'text', left: '37.0%', top: '40.6%', width: '33.0%' },
      { id: 'family.illiterateCount', type: 'text', left: '37.0%', top: '42.2%', width: '33.0%' },

      // HOF Literacy
      { id: 'education.0.isLiterate_Yes', type: 'checkbox', left: '36.5%', top: '46.7%', width: '2.5%', height: '1.5%' },
      { id: 'education.0.isLiterate_No', type: 'checkbox', left: '36.5%', top: '48.5%', width: '2.5%', height: '1.5%' },
      { id: 'education.0.highestQualification', type: 'text', left: '53.8%', top: '49.9%', width: '20.0%' },

      // Member 1 Literacy
      { id: 'education.1.isLiterate_Yes', type: 'checkbox', left: '36.5%', top: '54.8%', width: '2.5%', height: '1.5%' },
      { id: 'education.1.isLiterate_No', type: 'checkbox', left: '36.5%', top: '56.6%', width: '2.5%', height: '1.5%' },
      { id: 'education.1.highestQualification', type: 'text', left: '53.8%', top: '58.0%', width: '20.0%' },

      // Member 2 Literacy
      { id: 'education.2.isLiterate_Yes', type: 'checkbox', left: '36.5%', top: '64.5%', width: '2.5%', height: '1.5%' },
      { id: 'education.2.isLiterate_No', type: 'checkbox', left: '36.5%', top: '66.3%', width: '2.5%', height: '1.5%' },
      { id: 'education.2.highestQualification', type: 'text', left: '53.8%', top: '67.9%', width: '20.0%' },

      // Member 3 Literacy
      { id: 'education.3.isLiterate_Yes', type: 'checkbox', left: '36.5%', top: '74.0%', width: '2.5%', height: '1.5%' },
      { id: 'education.3.isLiterate_No', type: 'checkbox', left: '36.5%', top: '75.8%', width: '2.5%', height: '1.5%' },
      { id: 'education.3.highestQualification', type: 'text', left: '53.8%', top: '77.4%', width: '20.0%' },

      // Member 4 Literacy
      { id: 'education.4.isLiterate_Yes', type: 'checkbox', left: '36.5%', top: '83.5%', width: '2.5%', height: '1.5%' },
      { id: 'education.4.isLiterate_No', type: 'checkbox', left: '36.5%', top: '85.3%', width: '2.5%', height: '1.5%' },
      { id: 'education.4.highestQualification', type: 'text', left: '53.8%', top: '86.9%', width: '20.0%' },

      // Member 3 Employment
      { id: 'assets.m3Emp_Govt', type: 'checkbox', left: '36.5%', top: '9.0%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_Private', type: 'checkbox', left: '53.1%', top: '9.0%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_FormalSelf', type: 'checkbox', left: '45.8%', top: '10.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_PartTime', type: 'checkbox', left: '66.7%', top: '12.2%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_InformalSelf', type: 'checkbox', left: '50.0%', top: '13.7%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_Migrant', type: 'checkbox', left: '66.8%', top: '15.3%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_Unemployed', type: 'checkbox', left: '51.4%', top: '16.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m3Emp_Others', type: 'checkbox', left: '65.0%', top: '16.9%', width: '2.5%', height: '1.5%' },

      // Member 4 Employment
      { id: 'assets.m4Emp_Govt', type: 'checkbox', left: '36.5%', top: '20.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_Private', type: 'checkbox', left: '53.1%', top: '20.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_FormalSelf', type: 'checkbox', left: '45.8%', top: '22.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_PartTime', type: 'checkbox', left: '66.7%', top: '24.1%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_InformalSelf', type: 'checkbox', left: '50.0%', top: '25.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_Migrant', type: 'checkbox', left: '66.8%', top: '27.2%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_Unemployed', type: 'checkbox', left: '51.4%', top: '28.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m4Emp_Others', type: 'checkbox', left: '65.0%', top: '28.8%', width: '2.5%', height: '1.5%' },

      // Member 5 Employment
      { id: 'assets.m5Emp_Govt', type: 'checkbox', left: '36.5%', top: '34.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_Private', type: 'checkbox', left: '53.1%', top: '34.6%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_FormalSelf', type: 'checkbox', left: '45.8%', top: '36.2%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_PartTime', type: 'checkbox', left: '66.7%', top: '37.8%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_InformalSelf', type: 'checkbox', left: '50.0%', top: '39.3%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_Migrant', type: 'checkbox', left: '66.8%', top: '40.9%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_Unemployed', type: 'checkbox', left: '51.4%', top: '42.5%', width: '2.5%', height: '1.5%' },
      { id: 'assets.m5Emp_Others', type: 'checkbox', left: '65.0%', top: '42.5%', width: '2.5%', height: '1.5%' }
    ],
    6: [
      { id: 'education.5.isLiterate_Yes', type: 'checkbox', left: '36.5%', top: '9.3%', width: '2.5%', height: '1.5%' },
      { id: 'education.5.isLiterate_No', type: 'checkbox', left: '36.5%', top: '11.1%', width: '2.5%', height: '1.5%' },
      { id: 'education.5.highestQualification', type: 'text', left: '53.8%', top: '12.5%', width: '20.0%' },
      { id: 'assets.annualIncome', type: 'text', left: '50.4%', top: '46.5%', width: '20.0%' }
    ],
    8: [
      // Child 1
      { id: 'children.0.name', type: 'text', left: '25.2%', top: '25.2%', width: '20.0%' },
      { id: 'children.0.className', type: 'text', left: '50.4%', top: '25.2%', width: '10.0%' },
      { id: 'children.0.schoolName', type: 'text', left: '63.8%', top: '25.2%', width: '20.0%' },
      { id: 'children.0.schoolType_Govt', type: 'checkbox', left: '5.9%', top: '27.6%', width: '2.5%', height: '1.5%' },
      { id: 'children.0.schoolType_Private', type: 'checkbox', left: '16.8%', top: '27.6%', width: '2.5%', height: '1.5%' },

      // Child 2
      { id: 'children.1.name', type: 'text', left: '25.2%', top: '32.8%', width: '20.0%' },
      { id: 'children.1.className', type: 'text', left: '50.4%', top: '32.8%', width: '10.0%' },
      { id: 'children.1.schoolName', type: 'text', left: '63.8%', top: '32.8%', width: '20.0%' },
      { id: 'children.1.schoolType_Govt', type: 'checkbox', left: '5.9%', top: '35.2%', width: '2.5%', height: '1.5%' },
      { id: 'children.1.schoolType_Private', type: 'checkbox', left: '16.8%', top: '35.2%', width: '2.5%', height: '1.5%' }
    ],
    10: [
      { id: 'governmentSchemes.agreeTerms', type: 'checkbox', left: '36.5%', top: '63.2%', width: '2.5%', height: '1.5%' }
    ]
  };

  // Find document uploads associated with the active page
  const pageUploads = pageOverlays[step]?.filter(f => f.docUploadType) || [];

  return (
    <div className="min-h-screen min-h-dvh bg-slate-50 dark:bg-slate-900 transition-colors duration-200 flex flex-col font-sans">
      
      {/* Premium Glassmorphic Top Nav Header */}
      <header className="sticky top-0 z-40 w-full bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2.5 sm:py-4 flex justify-between items-center transition-colors gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
          <div className="min-w-0">
            <h1 className="text-[11px] sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-wide uppercase flex items-center gap-1.5 truncate">
              <span>{t('title')}</span>
              <span className="text-[8px] sm:text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 sm:px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900 shrink-0 whitespace-nowrap">
                {formData.application_id || 'APN-TEMP'}
              </span>
            </h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400 font-semibold truncate">{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Last saved / Sync indicators */}
          {lastSavedTime && (
            <div className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
              <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin-slow" />
              <span>Autosaved: {lastSavedTime}</span>
            </div>
          )}

          {/* Languages Selector */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="p-2 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 bg-slate-100 dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] font-extrabold uppercase"
          >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">{language === 'en' ? 'বাংলা' : 'English'}</span>
          </button>

          {/* Theme Selector */}
          <button
            onClick={toggleDarkMode}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            {darkMode ? <Sun className="w-4.5 h-4.5 text-amber-500" /> : <Moon className="w-4.5 h-4.5 text-slate-600" />}
          </button>

          {/* Actions */}
          {!isViewOnly && (
            <button
              onClick={() => saveDraftToServer(true)}
              className="p-2 sm:px-4 sm:py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-slate-200 dark:border-slate-800"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">{saveStatus === 'saving' ? 'Saving...' : 'Save Draft'}</span>
            </button>
          )}
        </div>
      </header>

      
      {/* Simplified Wizard Timeline Navigation Tracker */}
      <div className="wizard-timeline-bar w-full bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 py-2.5 sm:py-4 px-3 sm:px-6 transition-colors shadow-sm shrink-0">
        <div className="max-w-[1400px] mx-auto flex items-center justify-start sm:justify-between overflow-x-auto gap-2 sm:gap-4 scrollbar-none scroll-snap-x py-1 -mx-1 px-1">
          {[
            { id: 'scan', label: t('scanDocs') || 'Scan Documents', num: '1', activeColor: 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
            { id: 'form', label: t('fillForm') || 'Fill Smart Form', num: '2', activeColor: 'border-sky-500 text-sky-600 bg-sky-50 dark:bg-sky-950/20' },
            { id: 'preview', label: t('previewForm') || 'Preview Form', num: '3', activeColor: 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
            { id: 'payment', label: t('upiPayment') || 'UPI Payment', num: '4', activeColor: 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20' },
            { id: 'download', label: t('downloadPrint') || 'Download & Print', num: '5', activeColor: 'border-purple-500 text-purple-600 bg-purple-50 dark:bg-purple-950/20' }
          ].map((stg, index) => {
            const isActive = wizardStage === stg.id;
            const isCompleted = ['scan', 'form', 'preview', 'payment', 'download'].indexOf(wizardStage) > ['scan', 'form', 'preview', 'payment', 'download'].indexOf(stg.id);
            return (
              <div key={stg.id} className="flex items-center gap-2 shrink-0 scroll-snap-align-start">
                <button
                  type="button"
                  disabled={isViewOnly && stg.id === 'payment'}
                  onClick={() => {
                    if (stg.id === 'download' && paymentStatus !== 'success') return;
                    if (stg.id === 'payment' && !formData.family.hofAadhaar) return;
                    setWizardStage(stg.id as any);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isActive 
                      ? stg.activeColor 
                      : isCompleted
                        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/20 text-emerald-600'
                        : 'border-transparent text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shadow-sm ${
                    isCompleted 
                      ? 'bg-emerald-600 text-white' 
                      : isActive 
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950' 
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-600'
                  }`}>
                    {isCompleted ? '✓' : stg.num}
                  </span>
                  <span>{stg.label}</span>
                </button>
                {index < 4 && (
                  <span className="text-slate-300 dark:text-slate-800 font-light hidden sm:inline">➜</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Frame */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-3 sm:p-6 flex flex-col justify-start">
        
        {/* STAGE 1: DOCUMENT SCAN TRAY */}
        {wizardStage === 'scan' && (
          <div className="space-y-6 animate-slide-up">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>{t('scanTrayTitle') || 'Document Scanner Tray'}</span>
                <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-600 rounded-full font-bold border border-emerald-500/20">OCR SCANNER</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t('scanTraySubtitle') || 'Scan applicant credentials to trigger intelligent bilingual auto-fill extraction.'}
              </p>
            </div>

            {ocrFeedback && (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl text-xs font-semibold text-emerald-800 dark:text-emerald-400 animate-fade-in flex items-center gap-2 shadow-sm shadow-emerald-500/5">
                <Sparkles className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                <span>{ocrFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
              {[
                { key: 'aadhaar_front', label: t('uploadAadhaarFront') || 'Aadhaar Card Front', path: formData.family.aadhaarFrontPath },
                { key: 'aadhaar_back', label: t('uploadAadhaarBack') || 'Aadhaar Card Back', path: formData.family.aadhaarBackPath },
                { key: 'ration_card', label: t('uploadRation') || 'Digital Ration Card', path: formData.family.rationCardPath },
                { key: 'caste_certificate', label: t('uploadCaste') || 'Caste Certificate (Optional)', path: formData.family.casteCertificatePath || '' },
                { key: 'passbook', label: t('uploadPassbook') || 'Bank Passbook / Cheque', path: formData.bankDetails.find(b => !!b.passbookPath)?.passbookPath || '' },
                { key: 'voter_card', label: t('uploadVoter') || 'Voter ID (EPIC)', path: formData.epicDetails.voterCardPath },
                { key: 'pan_card', label: t('uploadPan') || 'PAN Card (Optional)', path: formData.panDetails.panCardPath }
              ].map((doc) => {
                const isUploaded = !!doc.path;
                return (
                  <div 
                    key={doc.key} 
                    className={`bg-white dark:bg-slate-950 border rounded-3xl p-5 shadow-sm transition-all relative overflow-hidden flex flex-col justify-between h-auto min-h-[160px] sm:h-[180px] ${
                      isUploaded 
                        ? 'border-emerald-500/35 bg-emerald-500/[0.01]' 
                        : 'border-slate-200 dark:border-slate-850 hover:border-slate-300 dark:hover:border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">ANNAPURNA credential</span>
                        {isUploaded && (
                          <span className="text-[8px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900 uppercase flex items-center gap-1 shrink-0 animate-pulse">
                            <span>✓</span>
                            <span>{t('ocrSuccess') || 'OCR Scanned'}</span>
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                        {doc.label}
                      </h4>
                    </div>

                    <div className="pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-900/60 mt-auto">
                      {!isUploaded ? (
                        <div className="flex items-center gap-2 w-full">
                          <label className="flex-1 py-2 bg-slate-100 hover:bg-slate-250 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-800 active:scale-[0.98]">
                            <UploadCloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{ocrLoading === doc.key ? 'Loading...' : 'Upload'}</span>
                            <input 
                              type="file" 
                              disabled={ocrLoading !== null} 
                              onChange={(e) => handleFileUploadAndOcr(e, doc.key)} 
                              className="hidden" 
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => setCameraActive(doc.key)}
                            disabled={ocrLoading !== null}
                            className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 active:scale-[0.98]"
                          >
                            <Camera className="w-3.5 h-3.5 shrink-0" />
                            <span>Scan</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">File attached</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(doc.key)}
                            className="p-2 border border-red-200 dark:border-red-950/20 text-red-500 hover:bg-red-55 dark:hover:bg-red-950/20 rounded-xl transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stage Proceed button */}
            <div className="flex justify-end pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={async () => {
                  const ok = await saveDraftToServer(false);
                  if (ok) setWizardStage('form');
                }}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-emerald-500/10 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <span>{language === 'en' ? 'Next: Fill Smart Form' : 'পরবর্তী ধাপ: স্মার্ট ফর্ম পূরণ'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STAGE 2: SIMPLE SMART BILINGUAL FORM */}
        {wizardStage === 'form' && (
          <div className="space-y-6 animate-slide-up max-w-[1000px] mx-auto w-full">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex justify-between items-center gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>{t('fillForm') || 'Fill Smart Form'}</span>
                  <span className="text-xs px-2 py-0.5 bg-sky-500/10 text-sky-600 rounded-full font-bold border border-sky-500/20">SMART UI</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {language === 'en' ? 'Review values filled by OCR and complete details' : 'ওসিআর (OCR) দ্বারা সংগৃহীত তথ্য যাচাই করুন এবং বাকি তথ্য পূরণ করুন'}
                </p>
              </div>
              
              {/* Form categories tabs */}
              <div className="flex items-center gap-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-1 shadow-sm shrink-0 overflow-x-auto scrollbar-none max-w-full">
                {[
                  { id: 'hof', label: t('hofSection') || '👤 HOF Profile', icon: '👤' },
                  { id: 'members', label: t('familySection') || '👨‍👩‍👦 Members', icon: '👨‍👩‍👦' },
                  { id: 'bank', label: t('bankAssetSection') || '🏦 Bank & Assets', icon: '🏦' },
                  { id: 'schemes', label: t('schemesChildrenSection') || '📋 Schemes & Children', icon: '📋' }
                ].map((tb) => (
                  <button
                    key={tb.id}
                    type="button"
                    onClick={() => setFormTab(tb.id as any)}
                    className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                      formTab === tb.id
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-500/15'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span className="mr-1">{tb.icon}</span>
                    <span className="hidden md:inline">{tb.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* TAB CONTENT: HEAD OF FAMILY */}
            {formTab === 'hof' && (
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
                <div className="border-l-4 border-sky-500 pl-3">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    {language === 'en' ? 'Head of Family Identity Profile' : 'পরিবারের প্রধানের পরিচয়পত্র'}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Name field */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('fullName') || 'Full Name'} / নাম
                    </label>
                    <input
                      type="text"
                      value={getFieldValue('family.hofName')}
                      onChange={(e) => setFieldValue('family.hofName', e.target.value)}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('fullNamePlaceholder') || 'Enter full name'}
                    />
                    {!!formData.family.aadhaarFrontPath && (
                      <span className="absolute right-4 top-4 text-[8px] font-extrabold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900">
                        {t('autofilledFromAadhaar') || 'Autofilled from Aadhaar'}
                      </span>
                    )}
                  </div>

                  {/* Aadhaar field */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('aadhaarNumber') || 'Aadhaar Number'} / আধার নম্বর
                    </label>
                    <input
                      type="text"
                      maxLength={12}
                      value={getFieldValue('family.hofAadhaar')}
                      onChange={(e) => setFieldValue('family.hofAadhaar', e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('aadhaarPlaceholder') || '12-digit number'}
                    />
                    {!!formData.family.aadhaarFrontPath && (
                      <span className="absolute right-4 top-4 text-[8px] font-extrabold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900">
                        {t('autofilledFromAadhaar') || 'Autofilled from Aadhaar'}
                      </span>
                    )}
                  </div>

                  {/* DOB field */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('dob') || 'Date of Birth'} / জন্ম তারিখ
                    </label>
                    <input
                      type="date"
                      value={getFieldValue('family.hofDob')}
                      onChange={(e) => setFieldValue('family.hofDob', e.target.value)}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                    />
                    {!!formData.family.aadhaarFrontPath && (
                      <span className="absolute right-4 top-4 text-[8px] font-extrabold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900">
                        {t('autofilledFromAadhaar') || 'Autofilled from Aadhaar'}
                      </span>
                    )}
                  </div>

                  {/* Gender field */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('gender') || 'Gender'} / লিঙ্গ
                    </label>
                    <select
                      value={getFieldValue('family.hofGender')}
                      onChange={(e) => setFieldValue('family.hofGender', e.target.value)}
                      className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                    >
                      <option value="">-- Select Gender --</option>
                      <option value="Male">{t('male') || 'Male'}</option>
                      <option value="Female">{t('female') || 'Female'}</option>
                      <option value="Other">{t('other') || 'Other'}</option>
                    </select>
                  </div>

                  {/* Mobile field */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('mobileNumber') || 'Mobile Number'} / মোবাইল নম্বর
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      value={getFieldValue('family.hofMobile')}
                      onChange={(e) => setFieldValue('family.hofMobile', e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('mobilePlaceholder') || '10-digit number'}
                    />
                  </div>

                  {/* Category/Caste field */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('category') || 'Category'} / ক্যাটাগরি
                    </label>
                    <select
                      value={getFieldValue('family.hofCategory')}
                      onChange={(e) => setFieldValue('family.hofCategory', e.target.value)}
                      className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                    >
                      <option value="">-- Select Category --</option>
                      <option value="UR">{t('general') || 'General'}</option>
                      <option value="SC">{t('sc') || 'SC'}</option>
                      <option value="ST">{t('st') || 'ST'}</option>
                      <option value="OBC">OBC</option>
                    </select>
                    {!!formData.family.casteCertificatePath && (
                      <span className="absolute right-4 top-4 text-[8px] font-extrabold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900">
                        Caste Scanned
                      </span>
                    )}
                  </div>

                  {/* Address field (Full-width spans) */}
                  <div className="md:col-span-2 space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('address') || 'Address'} / ঠিকানা
                    </label>
                    <textarea
                      value={getFieldValue('family.hofAddress')}
                      onChange={(e) => setFieldValue('family.hofAddress', e.target.value)}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs resize-none h-12"
                      placeholder={t('addressPlaceholder') || 'Enter full address'}
                    />
                    {!!formData.family.aadhaarBackPath && (
                      <span className="absolute right-4 top-4 text-[8px] font-extrabold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900">
                        Auto-Address
                      </span>
                    )}
                  </div>

                  {/* Ration Card details */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('householdId') || 'Household ID'} / রেশন কার্ড আইডি
                    </label>
                    <input
                      type="text"
                      value={getFieldValue('family.householdId')}
                      onChange={(e) => setFieldValue('family.householdId', e.target.value)}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('householdPlaceholder') || 'Ration card number'}
                    />
                    {!!formData.family.rationCardPath && (
                      <span className="absolute right-4 top-4 text-[8px] font-extrabold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900">
                        {t('autofilledFromRation') || 'Autofilled from Ration Card'}
                      </span>
                    )}
                  </div>

                  {/* HOF Literacy Status */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {language === 'en' ? 'Literate Status' : 'শিক্ষাগত স্থিতি'} / শিক্ষিত কি না?
                    </label>
                    <select
                      value={getFieldValue('education.0.isLiterate') === '' ? 'true' : String(getFieldValue('education.0.isLiterate'))}
                      onChange={(e) => {
                        const val = e.target.value === 'true';
                        setFieldValue('education.0.isLiterate', val);
                        if (formData.family.hofAadhaar) {
                          setFieldValue('education.0.memberAadhaar', formData.family.hofAadhaar);
                        }
                      }}
                      className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                    >
                      <option value="true">{language === 'en' ? 'Yes / Literate' : 'হ্যাঁ / শিক্ষিত'}</option>
                      <option value="false">{language === 'en' ? 'No / Illiterate' : 'না / অশিক্ষিত'}</option>
                    </select>
                  </div>

                  {/* HOF Highest Qualification */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {language === 'en' ? 'Highest Qualification' : 'সর্বোচ্চ শিক্ষাগত যোগ্যতা'}
                    </label>
                    <select
                      value={getFieldValue('education.0.highestQualification') || 'Graduate'}
                      disabled={getFieldValue('education.0.isLiterate') === false}
                      onChange={(e) => setFieldValue('education.0.highestQualification', e.target.value)}
                      className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs disabled:opacity-50"
                    >
                      <option value="Primary">{language === 'en' ? 'Primary' : 'প্রাথমিক'}</option>
                      <option value="Secondary">{language === 'en' ? 'Secondary' : 'মাধ্যমিক'}</option>
                      <option value="Higher Secondary">{language === 'en' ? 'Higher Secondary' : 'উচ্চ মাধ্যমিক'}</option>
                      <option value="Graduate">{language === 'en' ? 'Graduate' : 'স্নাতক'}</option>
                      <option value="Post Graduate">{language === 'en' ? 'Post Graduate' : 'স্নাতকোত্তর'}</option>
                      <option value="Illiterate">{language === 'en' ? 'N/A' : 'প্রযোজ্য নয়'}</option>
                    </select>
                  </div>

                  {/* HOF Nature of Employment */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {language === 'en' ? 'Employment Status' : 'প্রধানের কর্মসংস্থান স্থিতি'}
                    </label>
                    <select
                      value={(() => {
                        const keys = ['Govt', 'Private', 'FormalSelf', 'PartTime', 'InformalSelf', 'Migrant', 'Unemployed', 'Others'];
                        for (const k of keys) {
                          if (formData.assets[`hofEmp_${k}` as keyof typeof formData.assets]) return k;
                        }
                        return 'Unemployed';
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        const keys = ['Govt', 'Private', 'FormalSelf', 'PartTime', 'InformalSelf', 'Migrant', 'Unemployed', 'Others'];
                        keys.forEach(k => {
                          setFieldValue(`assets.hofEmp_${k}`, k === val);
                        });
                      }}
                      className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                    >
                      <option value="Govt">{language === 'en' ? 'Govt Employee' : 'সরকারি চাকরিজীবী'}</option>
                      <option value="Private">{language === 'en' ? 'Private Sector' : 'বেসরকারি চাকরিজীবী'}</option>
                      <option value="FormalSelf">{language === 'en' ? 'Formal Self-Employed' : 'প্রাতিষ্ঠানিক স্ব-নিযুক্ত'}</option>
                      <option value="PartTime">{language === 'en' ? 'Part-Time Work' : 'খণ্ডকালীন কর্মী'}</option>
                      <option value="InformalSelf">{language === 'en' ? 'Informal Self-Employed' : 'অপ্রাতিষ্ঠানিক স্ব-নিযুক্ত'}</option>
                      <option value="Migrant">{language === 'en' ? 'Migrant Worker' : 'পরিযায়ী শ্রমিক'}</option>
                      <option value="Unemployed">{language === 'en' ? 'Unemployed' : 'বেকার / কোনোটিই নয়'}</option>
                      <option value="Others">{language === 'en' ? 'Others' : 'অন্যান্য'}</option>
                    </select>
                  </div>
                </div>

                {/* Navigation Row */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setWizardStage('scan')}
                    className="px-5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95"
                  >
                    <span>{t('previous') || 'Previous'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTab('members')}
                    className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>Next Tab</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: FAMILY MEMBERS */}
            {formTab === 'members' && (
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-4">
                  <div className="border-l-4 border-sky-500 pl-3">
                    <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      {t('familySection') || 'Family Members'} / সদস্যদের তালিকা
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => {
                        const next = JSON.parse(JSON.stringify(prev));
                        next.members.push({ name: '', dob: '', gender: '', relation: '', aadhaar: '' });
                        return next;
                      });
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('addMember') || 'Add Member'}</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {formData.members.filter(m => !!m).length === 0 ? (
                    <div className="py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-center text-xs font-semibold text-slate-400">
                      {t('noMembersYet') || 'No family members added yet.'}
                    </div>
                  ) : (
                    formData.members.map((member, index) => {
                      if (!member) return null;
                      return (
                        <div key={index} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-850 rounded-3xl p-5 space-y-4 relative">
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-2">
                            <span className="text-[10px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-900 uppercase">
                              Member {index + 1} / সদস্য {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData(prev => {
                                  const next = JSON.parse(JSON.stringify(prev));
                                  next.members.splice(index, 1);
                                  return next;
                                });
                              }}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 p-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Member Name */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Name / নাম</label>
                              <input
                                type="text"
                                value={member.name || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].name = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                                placeholder="Enter name"
                              />
                            </div>

                            {/* Member Aadhaar */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Aadhaar / আধার</label>
                              <input
                                type="text"
                                maxLength={12}
                                value={member.aadhaar || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].aadhaar = e.target.value.replace(/\D/g, '');
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                                placeholder="12-digit number"
                              />
                            </div>

                            {/* Member DOB */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">DOB / জন্ম তারিখ</label>
                              <input
                                type="date"
                                value={member.dob || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].dob = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                              />
                            </div>

                            {/* Member Relation */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Relation / সম্পর্ক</label>
                              <select
                                value={member.relation || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].relation = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                              >
                                <option value="">-- Select relation --</option>
                                <option value="Wife">{t('wife') || 'Wife'}</option>
                                <option value="Husband">{t('husband') || 'Husband'}</option>
                                <option value="Son">{t('son') || 'Son'}</option>
                                <option value="Daughter">{t('daughter') || 'Daughter'}</option>
                                <option value="Father">{t('father') || 'Father'}</option>
                                <option value="Mother">{t('mother') || 'Mother'}</option>
                              </select>
                            </div>

                            {/* Member Literacy */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">
                                {language === 'en' ? 'Literate Status' : 'শিক্ষাগত স্থিতি'} / শিক্ষিত?
                              </label>
                              <select
                                value={member.isLiterate === undefined ? 'true' : String(member.isLiterate)}
                                onChange={(e) => {
                                  const val = e.target.value === 'true';
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].isLiterate = val;
                                    const aadhaar = next.members[index].aadhaar || '';
                                    if (!next.education[index + 1]) {
                                      next.education[index + 1] = { memberAadhaar: aadhaar, isLiterate: val, highestQualification: '' };
                                    } else {
                                      next.education[index + 1].isLiterate = val;
                                      next.education[index + 1].memberAadhaar = aadhaar;
                                    }
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                              >
                                <option value="true">{language === 'en' ? 'Yes / Literate' : 'হ্যাঁ / শিক্ষিত'}</option>
                                <option value="false">{language === 'en' ? 'No / Illiterate' : 'না / অশিক্ষিত'}</option>
                              </select>
                            </div>

                            {/* Member Highest Qualification */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">
                                {language === 'en' ? 'Highest Qualification' : 'সর্বোচ্চ যোগ্যতা'}
                              </label>
                              <select
                                value={member.highestQualification || 'Primary'}
                                disabled={member.isLiterate === false}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].highestQualification = val;
                                    const aadhaar = next.members[index].aadhaar || '';
                                    if (!next.education[index + 1]) {
                                      next.education[index + 1] = { memberAadhaar: aadhaar, isLiterate: true, highestQualification: val };
                                    } else {
                                      next.education[index + 1].highestQualification = val;
                                      next.education[index + 1].memberAadhaar = aadhaar;
                                    }
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs disabled:opacity-50"
                              >
                                <option value="Primary">{language === 'en' ? 'Primary' : 'প্রাথমিক'}</option>
                                <option value="Secondary">{language === 'en' ? 'Secondary' : 'মাধ্যমিক'}</option>
                                <option value="Higher Secondary">{language === 'en' ? 'Higher Secondary' : 'উচ্চ মাধ্যমিক'}</option>
                                <option value="Graduate">{language === 'en' ? 'Graduate' : 'স্নাতক'}</option>
                                <option value="Post Graduate">{language === 'en' ? 'Post Graduate' : 'স্নাতকোত্তর'}</option>
                                <option value="Illiterate">{language === 'en' ? 'N/A' : 'প্রযোজ্য নয়'}</option>
                              </select>
                            </div>

                            {/* Member Employment Status */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl relative">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">
                                {language === 'en' ? 'Employment Status' : 'কর্মসংস্থান স্থিতি'}
                              </label>
                              <select
                                value={member.employmentStatus || 'Unemployed'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.members[index].employmentStatus = val;
                                    const mKey = `m${index + 1}`;
                                    const keys = ['Govt', 'Private', 'FormalSelf', 'PartTime', 'InformalSelf', 'Migrant', 'Unemployed', 'Others'];
                                    keys.forEach(k => {
                                      next.assets[`${mKey}Emp_${k}`] = k === val;
                                    });
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                              >
                                <option value="Govt">{language === 'en' ? 'Govt Employee' : 'সরকারি চাকরিজীবী'}</option>
                                <option value="Private">{language === 'en' ? 'Private Sector' : 'বেসরকারি চাকরিজীবী'}</option>
                                <option value="FormalSelf">{language === 'en' ? 'Formal Self-Employed' : 'প্রাতিষ্ঠানিক স্ব-নিযুক্ত'}</option>
                                <option value="PartTime">{language === 'en' ? 'Part-Time Work' : 'খণ্ডকালীন কর্মী'}</option>
                                <option value="InformalSelf">{language === 'en' ? 'Informal Self-Employed' : 'অপ্রাতিষ্ঠানিক স্ব-নিযুক্ত'}</option>
                                <option value="Migrant">{language === 'en' ? 'Migrant Worker' : 'পরিযায়ী শ্রমিক'}</option>
                                <option value="Unemployed">{language === 'en' ? 'Unemployed' : 'বেকার / কোনোটিই নয়'}</option>
                                <option value="Others">{language === 'en' ? 'Others' : 'অন্যান্য'}</option>
                              </select>
                            </div>

                            {/* Member Documents Section */}
                            <div className="col-span-1 md:col-span-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                              <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-sky-500" />
                                <span>Documents / নথি সমূহ</span>
                              </h4>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                {[
                                  { key: 'aadhaar_member', label: 'Aadhaar Card', path: member.aadhaarPath },
                                  { key: 'voter_front_member', label: 'Voter Front', path: member.voterCardPath },
                                  { key: 'voter_back_member', label: 'Voter Back', path: member.voterCardBackPath },
                                  { key: 'pan_member', label: 'PAN Card', path: member.panCardPath },
                                  { key: 'passbook_member', label: 'Passbook', path: member.passbookPath }
                                ].map((doc) => {
                                  const isUploaded = !!doc.path;
                                  return (
                                    <div 
                                      key={doc.key} 
                                      className={`bg-white dark:bg-slate-950 border rounded-2xl p-3 shadow-sm transition-all relative overflow-hidden flex flex-col justify-between min-h-[105px] ${
                                        isUploaded 
                                          ? 'border-emerald-500/35 bg-emerald-500/[0.01]' 
                                          : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-750'
                                      }`}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                          <span className="text-[8px] font-bold text-slate-400 uppercase truncate pr-1">{doc.label}</span>
                                          {isUploaded && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                                        </div>
                                      </div>
                                      
                                      <div className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-900 flex items-center justify-between gap-1.5">
                                        {!isUploaded ? (
                                          <div className="flex items-center gap-1 w-full">
                                            <label className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-250 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-[9px] uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-[0.98] min-w-0">
                                              <UploadCloud className="w-3 h-3 text-emerald-600 shrink-0" />
                                              <span className="truncate">{ocrLoading === `${doc.key}_${index}` ? '...' : 'Upload'}</span>
                                              <input 
                                                type="file" 
                                                disabled={ocrLoading !== null} 
                                                onChange={(e) => handleFileUploadAndOcr(e, doc.key, index)} 
                                                className="hidden" 
                                              />
                                            </label>
                                            
                                            <button
                                              type="button"
                                              onClick={() => setCameraActive(`${doc.key}_${index}`)}
                                              disabled={ocrLoading !== null}
                                              className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-[0.98] shrink-0"
                                            >
                                              <Camera className="w-3 h-3 shrink-0" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-between w-full">
                                            <span className="text-[8px] font-bold text-emerald-600 uppercase truncate">OCR OK</span>
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteDocument(doc.key, index)}
                                              className="p-1.5 border border-red-200 dark:border-red-950/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all cursor-pointer"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Navigation Row */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setFormTab('hof')}
                    className="px-5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95"
                  >
                    <span>Previous Tab</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTab('bank')}
                    className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>Next Tab</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: BANK & ASSETS */}
            {formTab === 'bank' && (
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
                <div className="border-l-4 border-sky-500 pl-3">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    {t('bankDetailsTitle') || 'Bank Details'} / ব্যাংক অ্যাকাউন্টের বিবরণ
                  </h3>
                </div>

                {/* Render Bank account fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bank Name */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('bankName') || 'Bank Name'} / ব্যাংকের নাম
                    </label>
                    <input
                      type="text"
                      value={formData.bankDetails[0]?.bankName || ''}
                      onChange={(e) => {
                        setFormData(prev => {
                          const next = JSON.parse(JSON.stringify(prev));
                          if (!next.bankDetails[0]) next.bankDetails[0] = { memberAadhaar: '', bankName: '', accountNumber: '', ifsc: '' };
                          next.bankDetails[0].bankName = e.target.value;
                          return next;
                        });
                      }}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('bankPlaceholder') || 'E.g., State Bank of India'}
                    />
                  </div>

                  {/* Account Number */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('accountNumber') || 'Account Number'} / অ্যাকাউন্ট নম্বর
                    </label>
                    <input
                      type="text"
                      value={formData.bankDetails[0]?.accountNumber || ''}
                      onChange={(e) => {
                        setFormData(prev => {
                          const next = JSON.parse(JSON.stringify(prev));
                          if (!next.bankDetails[0]) next.bankDetails[0] = { memberAadhaar: '', bankName: '', accountNumber: '', ifsc: '' };
                          next.bankDetails[0].accountNumber = e.target.value;
                          return next;
                        });
                      }}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('accountPlaceholder') || 'Enter account number'}
                    />
                  </div>

                  {/* IFSC */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl relative">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t('ifsc') || 'IFSC Code'} / আইএফএসসি কোড
                    </label>
                    <input
                      type="text"
                      value={formData.bankDetails[0]?.ifsc || ''}
                      onChange={(e) => {
                        setFormData(prev => {
                          const next = JSON.parse(JSON.stringify(prev));
                          if (!next.bankDetails[0]) next.bankDetails[0] = { memberAadhaar: '', bankName: '', accountNumber: '', ifsc: '' };
                          next.bankDetails[0].ifsc = e.target.value;
                          return next;
                        });
                      }}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder={t('ifscPlaceholder') || '11-character code'}
                    />
                  </div>
                </div>

                <div className="border-l-4 border-sky-500 pl-3 pt-2">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    {language === 'en' ? 'Property & Assets Details' : 'সম্পত্তি ও সম্পদের বিবরণ'}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Pucca rooms toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 pr-4 leading-normal">
                      {t('puccaRooms') || 'More than 3 Pucca Rooms?'} / ৩-এর বেশি পাকা ঘর?
                    </span>
                    <button
                      type="button"
                      onClick={() => setFieldValue('assets.puccaRooms', !formData.assets.puccaRooms)}
                      className={`w-11 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                        formData.assets.puccaRooms ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="bg-white w-5 h-5 rounded-full shadow-md" />
                    </button>
                  </div>

                  {/* Own vehicle toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 pr-4 leading-normal">
                      {t('vehicleOwnership') || 'Own 2/3/4-Wheeler Vehicle?'} / ২/৩/৪ চাকার গাড়ি?
                    </span>
                    <button
                      type="button"
                      onClick={() => setFieldValue('assets.vehicleOwnership', !formData.assets.vehicleOwnership)}
                      className={`w-11 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                        formData.assets.vehicleOwnership ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="bg-white w-5 h-5 rounded-full shadow-md" />
                    </button>
                  </div>

                  {/* Vehicle details if owned */}
                  {formData.assets.vehicleOwnership && (
                    <>
                      <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          Vehicle Number / গাড়ির নম্বর
                        </label>
                        <input
                          type="text"
                          value={formData.assets.vehicleNumber || ''}
                          onChange={(e) => setFieldValue('assets.vehicleNumber', e.target.value)}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                          placeholder="Registration number"
                        />
                      </div>

                      <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          Vehicle Model / গাড়ির মডেল
                        </label>
                        <input
                          type="text"
                          value={formData.assets.vehicleModel || ''}
                          onChange={(e) => setFieldValue('assets.vehicleModel', e.target.value)}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                          placeholder="E.g., Honda Shine"
                        />
                      </div>
                    </>
                  )}

                  {/* Land ownership toggle */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 pr-4 leading-normal">
                      {language === 'en' ? 'Own Agricultural Land?' : 'কৃষি জমি আছে কি?'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !formData.assets.landOwnership;
                        setFieldValue('assets.landOwnership', nextVal);
                        if (!nextVal) setFieldValue('assets.landSize', '');
                      }}
                      className={`w-11 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                        formData.assets.landOwnership ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="bg-white w-5 h-5 rounded-full shadow-md" />
                    </button>
                  </div>

                  {/* Land Size if owned */}
                  {formData.assets.landOwnership && (
                    <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                        {language === 'en' ? 'Land Size (Acres)' : 'জমির পরিমাণ (একর)'}
                      </label>
                      <input
                        type="text"
                        value={formData.assets.landSize || ''}
                        onChange={(e) => setFieldValue('assets.landSize', e.target.value)}
                        className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                        placeholder="E.g., 1.5"
                      />
                    </div>
                  )}

                  {/* Annual Family Income */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {language === 'en' ? 'Annual Family Income' : 'পরিবারের বার্ষিক মোট আয়'}
                    </label>
                    <input
                      type="text"
                      value={formData.assets.annualIncome || ''}
                      onChange={(e) => setFieldValue('assets.annualIncome', e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                      placeholder="E.g., 120000"
                    />
                  </div>

                  {/* Health Insurance Type */}
                  <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {language === 'en' ? 'Health Insurance Scheme' : 'স্বাস্থ্য বীমা প্রকল্প'}
                    </label>
                    <select
                      value={formData.assets.healthInsuranceType || 'None'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFieldValue('assets.healthInsuranceType', val);
                        if (val === 'None') {
                          setFieldValue('assets.premium', '');
                          setFieldValue('assets.sumAssured', '');
                        }
                      }}
                      className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                    >
                      <option value="None">{language === 'en' ? 'None' : 'কোনোটিই নয়'}</option>
                      <option value="Govt">{language === 'en' ? 'Government Scheme' : 'সরকারি প্রকল্প'}</option>
                      <option value="Private">{language === 'en' ? 'Private Insurance' : 'বেসরকারি বীমা'}</option>
                    </select>
                  </div>

                  {/* Premium and Sum Assured if has health insurance */}
                  {formData.assets.healthInsuranceType && formData.assets.healthInsuranceType !== 'None' && (
                    <>
                      <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          {language === 'en' ? 'Annual Premium Paid' : 'বার্ষিক প্রিমিয়াম'}
                        </label>
                        <input
                          type="text"
                          value={formData.assets.premium || ''}
                          onChange={(e) => setFieldValue('assets.premium', e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                          placeholder="Annual premium in Rs."
                        />
                      </div>

                      <div className="space-y-1.5 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          {language === 'en' ? 'Sum Assured' : 'বীমা রাশি (Sum Assured)'}
                        </label>
                        <input
                          type="text"
                          value={formData.assets.sumAssured || ''}
                          onChange={(e) => setFieldValue('assets.sumAssured', e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                          placeholder="Sum assured in Rs."
                        />
                      </div>
                    </>
                  )}

                  {/* Constitutional Post toggle */}
                  <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 pr-4 leading-normal">
                        {language === 'en' ? 'Does any family member hold a Constitutional Post?' : 'পরিবারের কোনো সদস্য কি কোনো সাংবিধানিক পদে আছেন?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !formData.assets.constitutionalPost_Yes;
                          setFieldValue('assets.constitutionalPost_Yes', nextVal);
                          setFieldValue('assets.constitutionalPost_No', !nextVal);
                          if (!nextVal) setFieldValue('assets.constitutionalPost_Member', '');
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                          formData.assets.constitutionalPost_Yes ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                        }`}
                      >
                        <span className="bg-white w-5 h-5 rounded-full shadow-md" />
                      </button>
                    </div>
                    {formData.assets.constitutionalPost_Yes && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/50 dark:border-slate-800/50 animate-slide-down">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          {language === 'en' ? 'Select Member holding Constitutional Post' : 'সাংবিধানিক পদাধিকারী সদস্য নির্বাচন করুন'}
                        </label>
                        <select
                          value={formData.assets.constitutionalPost_Member || ''}
                          onChange={(e) => setFieldValue('assets.constitutionalPost_Member', e.target.value)}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                        >
                          <option value="">-- Select Member --</option>
                          <option value={formData.family.hofName || 'Head of Family'}>{formData.family.hofName || 'Head of Family'} (HOF)</option>
                          {formData.members.map((m, idx) => m.name && (
                            <option key={idx} value={m.name}>{m.name} (Member {idx + 1})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Government Pensioner toggle */}
                  <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 pr-4 leading-normal">
                        {language === 'en' ? 'Does any family member receive a Government Pension?' : 'পরিবারের কোনো সদস্য কি সরকারি পেনশন পান?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !formData.assets.govPensioner_Yes;
                          setFieldValue('assets.govPensioner_Yes', nextVal);
                          setFieldValue('assets.govPensioner_No', !nextVal);
                          if (!nextVal) setFieldValue('assets.govPensioner_Member', '');
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                          formData.assets.govPensioner_Yes ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                        }`}
                      >
                        <span className="bg-white w-5 h-5 rounded-full shadow-md" />
                      </button>
                    </div>
                    {formData.assets.govPensioner_Yes && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/50 dark:border-slate-800/50 animate-slide-down">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          {language === 'en' ? 'Select Pensioner Member' : 'পেনশনভোগী সদস্য নির্বাচন করুন'}
                        </label>
                        <select
                          value={formData.assets.govPensioner_Member || ''}
                          onChange={(e) => setFieldValue('assets.govPensioner_Member', e.target.value)}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 text-xs"
                        >
                          <option value="">-- Select Member --</option>
                          <option value={formData.family.hofName || 'Head of Family'}>{formData.family.hofName || 'Head of Family'} (HOF)</option>
                          {formData.members.map((m, idx) => m.name && (
                            <option key={idx} value={m.name}>{m.name} (Member {idx + 1})</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* GST Registered toggle */}
                  <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/60 rounded-2xl md:col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 pr-4 leading-normal">
                        {language === 'en' ? 'Is any family member registered under GST?' : 'পরিবারের কোনো সদস্য কি জিএসটি (GST) নিবন্ধিত?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !formData.assets.gstRegistered_Yes;
                          setFieldValue('assets.gstRegistered_Yes', nextVal);
                          setFieldValue('assets.gstRegistered_No', !nextVal);
                          if (!nextVal) setFieldValue('assets.gstin', '');
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                          formData.assets.gstRegistered_Yes ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                        }`}
                      >
                        <span className="bg-white w-5 h-5 rounded-full shadow-md" />
                      </button>
                    </div>
                    {formData.assets.gstRegistered_Yes && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/50 dark:border-slate-800/50 animate-slide-down">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                          GSTIN / জিএসটিআইএন নম্বর
                        </label>
                        <input
                          type="text"
                          maxLength={15}
                          value={formData.assets.gstin || ''}
                          onChange={(e) => setFieldValue('assets.gstin', e.target.value.toUpperCase())}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-sky-500 text-slate-800 dark:text-slate-100 font-semibold outline-none py-1 transition-colors text-xs"
                          placeholder="15-character GSTIN number"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Navigation Row */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setFormTab('members')}
                    className="px-5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95"
                  >
                    <span>Previous Tab</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormTab('schemes')}
                    className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>Next Tab</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SCHEMES & CHILDREN */}
            {formTab === 'schemes' && (
              <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
                <div className="border-l-4 border-sky-500 pl-3">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    {language === 'en' ? 'Currently Received Welfare Schemes' : 'বর্তমানে প্রাপ্ত সরকারি সুবিধাসমূহ'}
                  </h3>
                </div>

                {/* Schemes list checkboxes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { key: 'lakshmirBhandar', label: t('lakshmirBhandar') || "Lakshmir Bhandar" },
                    { key: 'pmKisan', label: t('pmKisan') || "PM Kisan" },
                    { key: 'oldAgePension', label: t('oldAgePension') || "Old Age Pension" },
                    { key: 'kanyashree', label: t('kanyashree') || "Kanyashree" },
                    { key: 'rupashree', label: t('rupashree') || "Rupashree" },
                    { key: 'awasYojana', label: t('awasYojana') || "Awas Yojana" }
                  ].map((sch) => {
                    const schemesList = formData.governmentSchemes.schemesList || [];
                    const isChecked = schemesList.includes(sch.key);
                    return (
                      <div
                        key={sch.key}
                        onClick={() => {
                          setFormData(prev => {
                            const next = JSON.parse(JSON.stringify(prev));
                            const curList = next.governmentSchemes.schemesList || [];
                            if (curList.includes(sch.key)) {
                              next.governmentSchemes.schemesList = curList.filter((k: string) => k !== sch.key);
                            } else {
                              next.governmentSchemes.schemesList = [...curList, sch.key];
                            }
                            return next;
                          });
                        }}
                        className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-center gap-3 active:scale-[0.99] ${
                          isChecked
                            ? 'border-sky-500 bg-sky-50/20 dark:bg-sky-950/10'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                          isChecked ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 dark:border-slate-700 bg-transparent'
                        }`}>
                          {isChecked && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-normal">
                          {sch.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-l-4 border-sky-500 pl-3 pt-2">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    {language === 'en' ? 'Children Details' : 'শিশুদের বিবরণ'}
                  </h3>
                </div>

                {/* Children dynamic fields */}
                <div className="space-y-4">
                  {formData.children.filter(c => !!c).length === 0 ? (
                    <div className="py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-center text-xs font-semibold text-slate-400">
                      No children details added.
                    </div>
                  ) : (
                    formData.children.map((child, index) => {
                      if (!child) return null;
                      return (
                        <div key={index} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-850 rounded-3xl p-5 space-y-4">
                          <div className="border-b border-slate-100 dark:border-slate-900 pb-2">
                            <span className="text-[10px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-900 uppercase">
                              Child {index + 1} / সন্তান {index + 1}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Child Name */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Child Name / নাম</label>
                              <input
                                type="text"
                                value={child.name || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.children[index].name = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                                placeholder="Enter name"
                              />
                            </div>

                            {/* Class */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Class / শ্রেণী</label>
                              <input
                                type="text"
                                value={child.className || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.children[index].className = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                                placeholder="E.g., Class V"
                              />
                            </div>

                            {/* School Name */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">School / বিদ্যালয়</label>
                              <input
                                type="text"
                                value={child.schoolName || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.children[index].schoolName = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                                placeholder="School Name"
                              />
                            </div>

                            {/* School Type */}
                            <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl">
                              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">School Type / বিদ্যালয়ের ধরণ</label>
                              <select
                                value={child.schoolType || ''}
                                onChange={(e) => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.children[index].schoolType = e.target.value;
                                    return next;
                                  });
                                }}
                                className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                              >
                                <option value="">-- Select type --</option>
                                <option value="Government">{language === 'en' ? 'Government' : 'সরকারি'}</option>
                                <option value="Private">{language === 'en' ? 'Private' : 'বেসরকারি'}</option>
                                <option value="Recognized Madrasah">{language === 'en' ? 'Recognized Madrasah' : 'অনুমোদিত মাদ্রাসা'}</option>
                                <option value="Other Madrasah">{language === 'en' ? 'Other Madrasah' : 'অন্যান্য মাদ্রাসা'}</option>
                                <option value="Others">{language === 'en' ? 'Others' : 'অন্যান্য'}</option>
                              </select>
                            </div>

                            {/* Vaccination status */}
                            <div className="flex items-center justify-between bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl">
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Vaccinated? / টিকাকরণ সম্পন্ন?</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData(prev => {
                                    const next = JSON.parse(JSON.stringify(prev));
                                    next.children[index].isVaccinated = !next.children[index].isVaccinated;
                                    if (!next.children[index].isVaccinated) {
                                      next.children[index].vaccinationCardId = '';
                                    }
                                    return next;
                                  });
                                }}
                                className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                                  child.isVaccinated ? 'bg-sky-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                                }`}
                              >
                                <span className="bg-white w-4 h-4 rounded-full shadow-md" />
                              </button>
                            </div>

                            {/* Vaccination Card ID */}
                            {child.isVaccinated && (
                              <div className="space-y-1 bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800/60 p-3 rounded-2xl">
                                <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">Vaccination Card ID / টিকাকরণ কার্ড নম্বর</label>
                                <input
                                  type="text"
                                  value={child.vaccinationCardId || ''}
                                  onChange={(e) => {
                                    setFormData(prev => {
                                      const next = JSON.parse(JSON.stringify(prev));
                                      next.children[index].vaccinationCardId = e.target.value;
                                      return next;
                                    });
                                  }}
                                  className="w-full bg-transparent border-none text-slate-800 dark:text-slate-100 font-semibold outline-none py-0.5 text-xs"
                                  placeholder="E.g., Card ID"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Tab Proceed buttons */}
                <div className="flex justify-between items-center pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setFormTab('bank')}
                    className="px-5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95"
                  >
                    <span>Previous Tab</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await saveDraftToServer(false);
                      if (ok) setWizardStage('preview');
                    }}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-indigo-500/10 flex items-center gap-2 cursor-pointer active:scale-95 animate-pulse"
                  >
                    <span>{language === 'en' ? 'Proceed to Preview' : 'পরবর্তী ধাপ: রিভিউ করুন'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STAGE 3: INTERACTIVE BILINGUAL IFRAME PREVIEW */}
        {wizardStage === 'preview' && (
          <div className="space-y-6 animate-slide-up max-w-[900px] mx-auto w-full">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 text-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2">
                <Eye className="w-5 h-5 text-sky-600 animate-pulse" />
                <span>{language === 'en' ? 'Review Application Form' : 'আবেদনপত্র রিভিউ করুন'}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {language === 'en' ? 'Please review the generated form draft before paying the processing fee.' : 'প্রসেসিং ফি দেওয়ার আগে তৈরি হওয়া ফর্মের খসড়াটি অনুগ্রহ করে দেখে নিন।'}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-md space-y-4">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider animate-pulse">
                    {language === 'en' ? 'Compiling PDF with checkbox checkmarks...' : 'চেকমার্কসহ পিডিএফ তৈরি হচ্ছে...'}
                  </p>
                </div>
              ) : previewUrl ? (
                <div className="relative w-full aspect-[3/4] max-h-[700px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-850 bg-slate-50">
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0 bg-white"
                    title="Form Preview"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Eye className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-xs font-semibold text-slate-400">
                    {language === 'en' ? 'No preview generated. Click below to load.' : 'কোনো প্রিভিউ লোড করা নেই। নিচে ক্লিক করে লোড করুন।'}
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!appId) return;
                      setPreviewLoading(true);
                      try {
                        const res = await axios.post(`${BACKEND_URL}/api/pdf/generate`, formData, {
                          headers: { Authorization: `Bearer ${token}` },
                          responseType: 'blob'
                        });
                        const blob = new Blob([res.data], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        setPreviewUrl(url);
                      } catch (err) {
                        console.error(err);
                      } finally {
                        setPreviewLoading(false);
                      }
                    }}
                    className="mt-4 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    Compile Preview
                  </button>
                </div>
              )}
            </div>

            {/* Self Declaration check box */}
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  defaultChecked={true}
                  className="mt-0.5 w-4.5 h-4.5 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed">
                  {t('confirmDeclaration') || 'I declare that the information provided is correct / আমি ঘোষণা করছি যে উপরে দেওয়া সমস্ত তথ্য সত্য ও নির্ভুল।'}
                </span>
              </label>
            </div>

            {/* Stage Proceed button */}
            <div className="flex justify-between items-center pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setWizardStage('form');
                  setFormTab('schemes');
                }}
                className="px-5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95"
              >
                <span>{t('previous') || 'Previous'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const ok = await saveDraftToServer(false);
                  if (ok) setWizardStage('payment');
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-indigo-500/10 flex items-center gap-2 cursor-pointer active:scale-95 animate-pulse"
              >
                <span>{language === 'en' ? 'Proceed to UPI Payment' : 'পরবর্তী ধাপ: পেমেন্ট করুন'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STAGE 4: INTERACTIVE UPI PAYMENT GATEWAY */}
        {wizardStage === 'payment' && (
          <div className="space-y-6 animate-slide-up max-w-[500px] mx-auto w-full">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4 text-center">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-600" />
                <span>{t('paymentTitle') || 'UPI Secure Checkout'}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {t('paymentSubtitle') || 'Scan or trigger pay intent link to complete processing fee transaction.'}
              </p>
            </div>

            {/* Visual Checkout Box */}
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 text-center space-y-6">
              
              {/* Payment glow backgrounds */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none"></div>

              {paymentStatus === 'pending' && (
                <div className="space-y-6 relative z-10">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">ANNAPURNA PROCESSING FEE</span>
                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                      {t('payAmount') || '₹ 10.00'}
                    </div>
                  </div>

                  {/* QR Code generator */}
                  <div className="flex flex-col items-center justify-center space-y-2 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-3xl border border-slate-100 dark:border-slate-850 w-full max-w-[280px] mx-auto shadow-inner">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=upi://pay?pa=imsusanta@okaxis%26pn=AnnapurnaYojana%26am=10%26cu=INR`}
                      alt="UPI QR Code"
                      className="w-40 h-40 border border-slate-200 rounded-xl bg-white p-1"
                    />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                      <span>{t('scanQrCode') || 'Scan this QR to Pay'}</span>
                    </span>
                  </div>

                  {/* Wallet Logos */}
                  <div className="flex justify-center items-center gap-4 bg-slate-50 dark:bg-slate-900/40 py-2.5 px-4 rounded-2xl max-w-[320px] mx-auto border border-slate-100 dark:border-slate-855">
                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Supported UPI:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-600 dark:text-slate-400 tracking-tight">GPay</span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="text-xs font-black text-slate-600 dark:text-slate-400 tracking-tight">PhonePe</span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="text-xs font-black text-slate-600 dark:text-slate-400 tracking-tight">Paytm</span>
                      <span className="text-slate-300 dark:text-slate-700">|</span>
                      <span className="text-xs font-black text-slate-600 dark:text-slate-400 tracking-tight">BHIM</span>
                    </div>
                  </div>

                  {/* Direct Mobile Launch intent trigger */}
                  <div className="space-y-3">
                    <a
                      href="upi://pay?pa=imsusanta@okaxis&pn=AnnapurnaYojana&am=10&cu=INR"
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs tracking-wider uppercase rounded-2xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Wallet className="w-4.5 h-4.5" />
                      <span>{t('payAppBtn') || 'Pay via Mobile Wallet Apps'}</span>
                    </a>

                    <button
                      type="button"
                      onClick={async () => {
                        setPaymentStatus('verifying');
                        setTimeout(async () => {
                          try {
                            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const osc1 = ctx.createOscillator();
                            const osc2 = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc1.connect(gain);
                            osc2.connect(gain);
                            gain.connect(ctx.destination);
                            osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
                            osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
                            gain.gain.setValueAtTime(0.2, ctx.currentTime);
                            osc1.start();
                            osc2.start();
                            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                            osc1.stop(ctx.currentTime + 0.4);
                            osc2.stop(ctx.currentTime + 0.4);
                          } catch (e) {}

                           try {
                            if (String(appId).startsWith('local-')) {
                              const stored = localStorage.getItem('annapurna_applications');
                              if (stored) {
                                const appsList = JSON.parse(stored);
                                const idx = appsList.findIndex((a: any) => a.id === appId);
                                if (idx !== -1) {
                                  appsList[idx].updated_at = new Date().toISOString();
                                  appsList[idx].status = 'submitted';
                                  appsList[idx].formData = {
                                    ...formData,
                                    status: 'submitted',
                                    current_step: 11
                                  };
                                  localStorage.setItem('annapurna_applications', JSON.stringify(appsList));
                                }
                              }
                            } else {
                              await axios.put(
                                `${BACKEND_URL}/api/applications/${appId}`,
                                {
                                  ...formData,
                                  status: 'submitted',
                                  current_step: 11
                                },
                                { headers: { Authorization: `Bearer ${token}` } }
                              );
                            }
                            setPaymentStatus('success');
                            setTimeout(() => {
                              setWizardStage('download');
                            }, 1800);
                          } catch (err) {
                            console.error(err);
                            setPaymentStatus('pending');
                            alert('Payment sync failed. Please try again.');
                          }
                        }, 1600);
                      }}
                      className="w-full py-3.5 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 font-bold text-xs tracking-wider uppercase rounded-2xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-pulse" />
                      <span>{t('verifyPayBtn') || 'Simulate Verified Instant Pay'}</span>
                    </button>
                  </div>
                </div>
              )}

              {paymentStatus === 'verifying' && (
                <div className="py-12 space-y-4 animate-pulse text-center">
                  <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Verifying Transaction...
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">
                    Contacting Bank Servers. Do not close this window.
                  </p>
                </div>
              )}

              {paymentStatus === 'success' && (
                <div className="py-12 space-y-6 text-center animate-scale-up relative">
                  <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/40 rounded-full border-2 border-emerald-500 flex items-center justify-center text-4xl mx-auto shadow-lg shadow-emerald-500/10 animate-bounce">
                    🎉
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-base font-extrabold text-emerald-600 uppercase tracking-wider">
                      {t('paySuccessMsg') || 'Payment Received Successfully!'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Redirecting to download workspace...
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Back button */}
            {paymentStatus === 'pending' && (
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={() => setWizardStage('preview')}
                  className="px-5 py-2 border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer active:scale-95"
                >
                  <span>{t('previous') || 'Previous'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STAGE 5: DOWNLOAD & PRINT SYSTEM RECEIPT */}
        {wizardStage === 'download' && (
          <div className="space-y-6 animate-slide-up max-w-[700px] mx-auto w-full">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 rounded-3xl p-6 text-white text-center shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
              <h2 className="text-lg font-black uppercase tracking-wider flex items-center justify-center gap-2">
                <CheckCircle2 className="w-6 h-6 animate-pulse" />
                <span>{language === 'en' ? 'Application Completed!' : 'আবেদনপত্র জমা সম্পূর্ণ!'}</span>
              </h2>
              <p className="text-xs text-emerald-100 mt-2 font-medium">
                {language === 'en' ? 'Annapurna Yojana form is compiled successfully with visually aligned checkmarks' : 'অন্নপূর্ণা যোজনা আবেদনপত্র সফলভাবে তৈরি হয়েছে এবং খসড়াটি যাচাই করা হয়েছে'}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md space-y-6">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-905 pb-3">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Registration Receipt / জমার রশিদ
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-855">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Application ID</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">{formData.application_id || 'APN-TEMP'}</span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-855">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Head of Family</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">{formData.family.hofName || 'N/A'}</span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-855">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Mobile Number</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 block">{formData.family.hofMobile || 'N/A'}</span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-855">
                  <span className="text-[9px] font-bold text-slate-400 uppercase block">Payment Status</span>
                  <span className="text-xs font-bold text-emerald-600 mt-0.5 block flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>Paid & Verified (১০ টাকা)</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Download className="w-4.5 h-4.5" />
                  <span>{t('download') || 'Download Filled Form'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPdf}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-855 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 font-bold text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Printer className="w-4.5 h-4.5" />
                  <span>{t('print') || 'Print Hardcopy'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/';
                }}
                className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-md shadow-slate-950/10"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>{language === 'en' ? 'Create New Application' : 'নতুন আবেদন করুন'}</span>
              </button>
            </div>
          </div>
        )}
      </main>


      {/* 5. Direct Mobile Camera Capture Scanner Modal */}
      {cameraActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-md animate-fade-in p-4 sm:p-6">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl w-full max-w-lg max-h-[90dvh] relative flex flex-col items-center">
            
            {/* Modal Title and Controls */}
            <div className="w-full px-6 py-4 flex items-center justify-between border-b border-slate-900">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-emerald-500 animate-pulse" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  {language === 'en' ? 'Mobile Camera Scanner' : 'মোবাইল ক্যামেরা স্ক্যানার'}
                </h3>
              </div>
              <button 
                onClick={() => setCameraActive(null)}
                className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Video Viewport with guideline scanner box */}
            <div className="w-full relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
              <video 
                ref={videoRef} 
                playsInline 
                muted 
                className="w-full h-full object-cover transform scale-x-1"
              />

              {/* Scanning Target Guide Overlay */}
              <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
                <div className="w-full h-full border-2 border-dashed border-emerald-500/50 rounded-2xl relative">
                  {/* Glowing scanner line animation */}
                  <div className="absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-md shadow-emerald-400/50 animate-bounce top-1/2"></div>
                  
                  {/* Guideline corner marks */}
                  <div className="absolute top-2 left-2 text-[8px] font-bold uppercase text-emerald-400 bg-black/60 px-1.5 py-0.5 rounded tracking-widest">
                    {language === 'en' ? 'Align Document Here' : 'নথিপত্রটি এখানে মেলান'}
                  </div>
                </div>
              </div>
            </div>

            {/* Active Controls */}
            <div className="w-full p-6 flex items-center justify-between border-t border-slate-900 bg-slate-950/80 gap-4 shrink-0">
              {/* Toggle camera orientation front/back */}
              <button
                type="button"
                onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
                className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-full transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                title="Switch Camera Mode"
              >
                <RotateCw className="w-4 h-4" />
                <span className="hidden sm:inline">{facingMode === 'environment' ? 'Rear' : 'Front'}</span>
              </button>

              {/* Main Trigger shutter button */}
              <button
                type="button"
                onClick={handleCapturePhoto}
                className="p-1 bg-white hover:bg-slate-100 rounded-full cursor-pointer shadow-lg active:scale-95 transition-all outline outline-offset-4 outline-2 outline-white flex items-center justify-center shrink-0 w-16 h-16"
              >
                <div className="w-14 h-14 rounded-full border-2 border-slate-950 bg-white flex items-center justify-center font-black text-slate-950 text-xs">SCAN</div>
              </button>

              {/* Cancel scan button */}
              <button
                type="button"
                onClick={() => setCameraActive(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-red-950/40 text-slate-400 hover:text-red-400 rounded-xl transition-all font-bold text-xs uppercase tracking-wider cursor-pointer border border-slate-800"
              >
                {language === 'en' ? 'Cancel' : 'বাতিল'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full py-4 sm:py-6 text-center text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-600 tracking-wide border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors mt-auto px-4">
        © 2026 Department of Food & Supplies, Government of West Bengal. All rights reserved.
      </footer>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs font-semibold text-slate-400">Loading Visual Form Workspace...</div>}>
      <ApplyWizard />
    </Suspense>
  );
}
