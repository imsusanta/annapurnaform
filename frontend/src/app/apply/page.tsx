'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '../LanguageContext';
import { Sun, Moon, ArrowLeft, ArrowRight, Save, Eye, CheckCircle2, UploadCloud, Trash2, Printer, Download, Sparkles, Languages, RefreshCw, FileText } from 'lucide-react';
import axios from 'axios';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

interface FamilyMember {
  name: string;
  dob: string;
  gender: string;
  relation: string;
  aadhaar: string;
  aadhaarPath?: string;
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
      rationCardPath: ''
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

      'panDetails.panNumber': { en: 'PAN Card Number', bn: 'প্যান কার্ড নম্বর' },
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
    const savedToken = localStorage.getItem('annapurna_token');
    if (!savedToken) {
      router.push('/');
      return;
    }
    setToken(savedToken);
    setDarkMode(document.documentElement.classList.contains('dark'));

    if (appId) {
      loadApplicationData(savedToken, parseInt(appId));
    } else {
      // Initialize with padded arrays
      setFormData(prev => padArrays(prev));
    }
  }, [appId]);

  // Periodic autosave
  useEffect(() => {
    if (isViewOnly || !token || !appId) return;

    const timer = setInterval(() => {
      saveDraftToServer(false);
    }, 30000);

    return () => clearInterval(timer);
  }, [formData, token, appId]);

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
    } catch (err) {
      console.error(err);
      setOcrFeedback('Failed to load application data.');
    } finally {
      setLoading(false);
    }
  };

  const saveDraftToServer = async (showUINotif = true) => {
    if (isViewOnly || !token || !appId) return;
    if (showUINotif) setSaveStatus('saving');

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
    } catch (err) {
      console.error(err);
      if (showUINotif) setSaveStatus('error');
    }
  };

  // OCR Upload and Extraction
  const handleFileUploadAndOcr = async (e: React.ChangeEvent<HTMLInputElement>, docType: string, memberIndex?: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setOcrLoading(docType);
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
          next.family.rationCardPath = fileUrl;
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

  const handleDeleteDocument = (docType: string) => {
    if (isViewOnly) return;
    const confirmDelete = window.confirm(
      language === 'en'
        ? "Are you sure you want to delete this document? Any auto-filled data associated with it will also be cleared."
        : "আপনি কি এই নথিটি মুছে ফেলতে চান? এর সাথে সম্পর্কিত সমস্ত তথ্যও মুছে যাবে।"
    );
    if (!confirmDelete) return;

    setFormData(prev => {
      const next = JSON.parse(JSON.stringify(prev)); // Deep copy
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
      return next;
    });
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
      const res = await axios.get(`${BACKEND_URL}/api/applications/${appId}/pdf`, {
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
      const res = await axios.get(`${BACKEND_URL}/api/applications/${appId}/pdf`, {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200 flex flex-col font-sans">
      
      {/* Premium Glassmorphic Top Nav Header */}
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center transition-colors">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { saveDraftToServer(false); router.push('/dashboard'); }}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 tracking-wide uppercase flex items-center gap-1.5">
              <span>{t('title')}</span>
              <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                {formData.application_id || 'APN-TEMP'}
              </span>
            </h1>
            <p className="text-[10px] text-slate-400 font-semibold">{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Last saved / Sync indicators */}
          {lastSavedTime && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
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
            <span>{language === 'en' ? 'বাংলা' : 'English'}</span>
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
              className="px-4 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-slate-200 dark:border-slate-800"
            >
              <Save className="w-4 h-4" />
              <span>{saveStatus === 'saving' ? 'Saving...' : 'Save Draft'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Sidebar: Nav tabs and required documents */}
        <aside className="lg:col-span-3 space-y-6 lg:sticky lg:top-24 w-full">
          
          {/* Visual page selector mapping to original form layout */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-900 pb-3">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{t('formLayoutMap')}</h3>
            </div>
            
            <div className="grid grid-cols-4 lg:grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {[
                { page: 1, desc: 'HOF & Members 1-3' },
                { page: 2, desc: 'Members 4-5, Banks, EPIC' },
                { page: 3, desc: 'EPIC 3-5, Category, Assets, Ins' },
                { page: 4, desc: 'PAN, Nature of Employment' },
                { page: 5, desc: 'Employment Members, Literacy HOF & 1-4' },
                { page: 6, desc: 'Literacy Member 5, Annual Income' },
                { page: 7, desc: 'Guidelines Page (Read-only)' },
                { page: 8, desc: 'Child Education & Vaccination' },
                { page: 9, desc: 'Child Vaccination Cards' },
                { page: 10, desc: 'Consent Agreement & Signature' },
                { page: 11, desc: 'Acknowledgement Receipt' }
              ].map((pg) => {
                const isActive = step === pg.page;
                return (
                  <button
                    key={pg.page}
                    onClick={() => { saveDraftToServer(false); setStep(pg.page); }}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-all w-full flex flex-col cursor-pointer ${
                      isActive 
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400' 
                        : 'border-slate-100 dark:border-slate-900 bg-slate-50/20 dark:bg-slate-900/5 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-extrabold uppercase tracking-wide text-[9px]">
                        Page {pg.page}
                      </span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </div>
                    <span className="text-[10px] leading-relaxed hidden lg:block font-medium truncate w-full">
                      {pg.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contextual OCR document uploads list for this active page */}
          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:bg-slate-900 pb-3">
              <UploadCloud className="w-5 h-5 text-emerald-600" />
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{t('requiredDocs')}</h3>
            </div>
            
            <ul className="space-y-3.5">
              {[
                { key: 'aadhaar_front', label: t('uploadAadhaarFront'), path: formData.family.aadhaarFrontPath },
                { key: 'aadhaar_back', label: t('uploadAadhaarBack'), path: formData.family.aadhaarBackPath },
                { key: 'ration_card', label: t('uploadRation'), path: formData.family.rationCardPath },
                { key: 'passbook', label: t('uploadPassbook'), path: formData.bankDetails.find(b => !!b.passbookPath)?.passbookPath || '' },
                { key: 'voter_card', label: t('uploadVoter'), path: formData.epicDetails.voterCardPath },
                { key: 'pan_card', label: t('uploadPan'), path: formData.panDetails.panCardPath }
              ].map((doc, idx) => {
                const isUploaded = !!doc.path;
                return (
                  <li key={idx} className="flex flex-col gap-2 text-xs border-b border-slate-100 dark:border-slate-900 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        {isUploaded ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-700 shrink-0" />
                        )}
                        <span className={isUploaded ? 'line-through text-slate-400 dark:text-slate-500 text-[11px]' : 'font-medium text-[11px]'}>{doc.label}</span>
                      </div>
                      
                      {isUploaded && !isViewOnly && (
                        <button
                          onClick={() => handleDeleteDocument(doc.key)}
                          className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-all cursor-pointer"
                          title="Delete document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    
                    {/* Thumbnail preview if uploaded */}
                    {isUploaded && (
                      <div className="relative group w-20 h-14 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-950 shadow-sm flex items-center justify-center">
                        {doc.path.toLowerCase().endsWith('.pdf') ? (
                          <div className="flex flex-col items-center justify-center p-1 text-center">
                            <FileText className="w-6 h-6 text-red-500" />
                            <span className="text-[7px] font-bold text-slate-400 truncate max-w-full">PDF File</span>
                          </div>
                        ) : (
                          <img 
                            src={`${BACKEND_URL}${doc.path}`} 
                            alt={doc.label} 
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                          />
                        )}
                        <a 
                          href={`${BACKEND_URL}${doc.path}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[8px] font-extrabold uppercase transition-opacity tracking-wider"
                        >
                          View Full
                        </a>
                      </div>
                    )}
                    
                    {/* Upload button (always available if not uploaded) */}
                    {!isUploaded && !isViewOnly && (
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] font-extrabold uppercase bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-md cursor-pointer flex items-center gap-1 transition-all">
                          <UploadCloud className="w-3 h-3 text-emerald-600" />
                          <span>{ocrLoading === doc.key ? 'Scanning...' : 'Choose File'}</span>
                          <input 
                            type="file" 
                            disabled={ocrLoading !== null} 
                            onChange={(e) => handleFileUploadAndOcr(e, doc.key)} 
                            className="hidden" 
                          />
                        </label>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Middle Panel: Quick Form Editor */}
        <section className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 w-full max-h-[calc(100vh-140px)] overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-5 flex flex-col">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-900 pb-3 shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse" />
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                {language === 'en' ? 'Quick Form Editor' : 'সহজ তথ্য এডিটর'}
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold">
                {language === 'en' ? `Page ${step} — Fill or toggle fields` : `পৃষ্ঠা ${step} — তথ্য পূরণ করুন`}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1 mt-2">
            {(() => {
              const fields = pageOverlays[step] || [];
              if (fields.length === 0) {
                return (
                  <div className="py-8 text-center text-xs font-semibold text-slate-400 dark:text-slate-600">
                    {language === 'en' ? 'No interactive fields on this page.' : 'এই পৃষ্ঠায় কোনো পূরণ করার মতো তথ্য নেই।'}
                  </div>
                );
              }

              // Group fields into logical sections
              const getGroupKey = (id: string): string => {
                if (id.startsWith('family.hofGender')) return 'hof_identity';
                if (id.startsWith('family.hofCategory')) return 'hof_category';
                if (id.startsWith('family.hasRation') || id === 'family.rationType_SPHH') return 'ration';
                if (id.startsWith('family.hof') || id === 'family.householdId' || id === 'family.literateCount' || id === 'family.illiterateCount') return 'hof_identity';
                if (id.startsWith('members.')) { const idx = id.split('.')[1]; return `member_${idx}`; }
                if (id.startsWith('bankDetails.')) { const idx = id.split('.')[1]; return `bank_${idx}`; }
                if (id.startsWith('education.')) { const idx = id.split('.')[1]; return `edu_${idx}`; }
                if (id.startsWith('children.')) { const idx = id.split('.')[1]; return `child_${idx}`; }
                if (id.startsWith('epicDetails')) return 'epic';
                if (id.startsWith('panDetails')) return 'pan';
                if (id.match(/^assets\.(hof|m\d)Emp/)) { const who = id.match(/^assets\.(hof|m\d)Emp/)?.[1]; return `emp_${who}`; }
                if (id.startsWith('assets.healthInsurance') || id === 'assets.premium' || id === 'assets.sumAssured') return 'insurance';
                if (id.startsWith('assets.incomeTax')) return 'income_tax';
                if (id.startsWith('assets.vehicle') || id.startsWith('assets.pucca') || id.startsWith('assets.land')) return 'assets_property';
                if (id === 'assets.familySize') return 'hof_identity';
                if (id === 'assets.annualIncome') return 'income';
                if (id.startsWith('governmentSchemes')) return 'schemes';
                return 'other';
              };

              const getGroupLabel = (key: string): string => {
                const isEn = language === 'en';
                const labels: Record<string, {en: string, bn: string}> = {
                  hof_identity: { en: '👤 HOF — Head of Family', bn: '👤 প্রধান — পরিবারের প্রধান' },
                  hof_category: { en: '🏷️ Category / Caste', bn: '🏷️ বিভাগ / জাতি' },
                  ration: { en: '🍚 Ration Card', bn: '🍚 রেশন কার্ড' },
                  member_0: { en: '👨‍👩‍👦 Member 1', bn: '👨‍👩‍👦 সদস্য ১' },
                  member_1: { en: '👨‍👩‍👦 Member 2', bn: '👨‍👩‍👦 সদস্য ২' },
                  member_2: { en: '👨‍👩‍👦 Member 3', bn: '👨‍👩‍👦 সদস্য ৩' },
                  member_3: { en: '👨‍👩‍👦 Member 4', bn: '👨‍👩‍👦 সদস্য ৪' },
                  member_4: { en: '👨‍👩‍👦 Member 5', bn: '👨‍👩‍👦 সদস্য ৫' },
                  bank_0: { en: '🏦 HOF Bank Account', bn: '🏦 প্রধানের ব্যাংক' },
                  bank_1: { en: '🏦 Member 1 Bank', bn: '🏦 সদস্য ১-এর ব্যাংক' },
                  bank_2: { en: '🏦 Member 2 Bank', bn: '🏦 সদস্য ২-এর ব্যাংক' },
                  bank_3: { en: '🏦 Member 3 Bank', bn: '🏦 সদস্য ৩-এর ব্যাংক' },
                  bank_4: { en: '🏦 Member 4 Bank', bn: '🏦 সদস্য ৪-এর ব্যাংক' },
                  bank_5: { en: '🏦 Member 5 Bank', bn: '🏦 সদস্য ৫-এর ব্যাংক' },
                  epic: { en: '🗳️ Voter Card (EPIC)', bn: '🗳️ ভোটার কার্ড' },
                  pan: { en: '💳 PAN Card', bn: '💳 প্যান কার্ড' },
                  income_tax: { en: '🧾 Income Tax', bn: '🧾 আয়কর' },
                  assets_property: { en: '🏠 Property & Vehicles', bn: '🏠 সম্পদ ও যানবাহন' },
                  insurance: { en: '🛡️ Health Insurance', bn: '🛡️ স্বাস্থ্য বীমা' },
                  income: { en: '💰 Annual Income', bn: '💰 বার্ষিক আয়' },
                  emp_hof: { en: '💼 HOF Employment', bn: '💼 প্রধানের জীবিকা' },
                  emp_m1: { en: '💼 Member 1 Employment', bn: '💼 সদস্য ১-এর জীবিকা' },
                  emp_m2: { en: '💼 Member 2 Employment', bn: '💼 সদস্য ২-এর জীবিকা' },
                  emp_m3: { en: '💼 Member 3 Employment', bn: '💼 সদস্য ৩-এর জীবিকা' },
                  emp_m4: { en: '💼 Member 4 Employment', bn: '💼 সদস্য ৪-এর জীবিকা' },
                  emp_m5: { en: '💼 Member 5 Employment', bn: '💼 সদস্য ৫-এর জীবিকা' },
                  edu_0: { en: '📚 HOF Education', bn: '📚 প্রধানের শিক্ষা' },
                  edu_1: { en: '📚 Member 1 Education', bn: '📚 সদস্য ১-এর শিক্ষা' },
                  edu_2: { en: '📚 Member 2 Education', bn: '📚 সদস্য ২-এর শিক্ষা' },
                  edu_3: { en: '📚 Member 3 Education', bn: '📚 সদস্য ৩-এর শিক্ষা' },
                  edu_4: { en: '📚 Member 4 Education', bn: '📚 সদস্য ৪-এর শিক্ষা' },
                  edu_5: { en: '📚 Member 5 Education', bn: '📚 সদস্য ৫-এর শিক্ষা' },
                  child_0: { en: '🧒 Child 1', bn: '🧒 শিশু ১' },
                  child_1: { en: '🧒 Child 2', bn: '🧒 শিশু ২' },
                  schemes: { en: '📋 Terms & Agreement', bn: '📋 শর্তাবলী ও সম্মতি' },
                  other: { en: '📝 Other Fields', bn: '📝 অন্যান্য তথ্য' }
                };
                return labels[key] ? (isEn ? labels[key].en : labels[key].bn) : key;
              };

              // Build ordered groups
              const groupOrder: string[] = [];
              const groupMap: Record<string, typeof fields> = {};
              fields.forEach(field => {
                const gk = getGroupKey(field.id);
                if (!groupMap[gk]) {
                  groupMap[gk] = [];
                  groupOrder.push(gk);
                }
                groupMap[gk].push(field);
              });

              return groupOrder.map(gk => (
                <div key={gk} className="mb-2">
                  <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-950/20 dark:to-slate-950 border border-emerald-100 dark:border-emerald-900/30 rounded-lg px-3 py-2 mb-2">
                    <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide">
                      {getGroupLabel(gk)}
                    </span>
                  </div>
                  <div className="space-y-2 pl-1">
                    {groupMap[gk].map(field => {
                      const val = getFieldValue(field.id);
                      const label = getFieldLabel(field.id);
                      const isCheckbox = field.type === 'checkbox';

                      if (isCheckbox) {
                        const isChecked = getFieldChecked(field.id);
                        return (
                          <div key={field.id} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-100 dark:border-slate-900 rounded-xl transition-all">
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 pr-2 leading-relaxed">
                              {label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCheckboxToggle(field.id)}
                              className={`w-10 h-5.5 flex items-center rounded-full p-0.5 cursor-pointer transition-all duration-200 shrink-0 ${
                                isChecked ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-700 justify-start'
                              }`}
                            >
                              <span className="bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-200" />
                            </button>
                          </div>
                        );
                      }

                      if (field.type === 'select') {
                        return (
                          <div key={field.id} className="space-y-1 p-1">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</label>
                            <select
                              disabled={isViewOnly}
                              value={val}
                              onChange={(e) => setFieldValue(field.id, e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition-colors"
                            >
                              <option value="">-- Select --</option>
                              {field.options?.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      }

                      return (
                        <div key={field.id} className="space-y-1 p-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</label>
                            {field.docUploadType && (
                              <span className="text-[8px] font-extrabold uppercase text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded">OCR</span>
                            )}
                          </div>
                          <input
                            type={field.type}
                            disabled={isViewOnly}
                            value={val}
                            onChange={(e) => setFieldValue(field.id, e.target.value)}
                            placeholder={field.placeholder || label}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>

        {/* Right Side: Form Preview Panel */}
        <section className="lg:col-span-5 space-y-4 w-full">

          {/* Edit / Preview Mode Tabs */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5">
            <button
              onClick={() => setPreviewMode('edit')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                previewMode === 'edit'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'Edit on Template' : 'টেমপ্লেটে এডিট'}</span>
            </button>
            <button
              onClick={async () => {
                setPreviewMode('preview');
                if (!appId) return;
                setPreviewLoading(true);
                try {
                  await saveDraftToServer(false);
                  const res = await axios.get(`${BACKEND_URL}/api/applications/${appId}/pdf`, {
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
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                previewMode === 'preview'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{language === 'en' ? 'Preview Filled Form' : 'পূরণ করা ফর্ম দেখুন'}</span>
            </button>
          </div>
          
          {ocrFeedback && (
            <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-400 animate-fade-in flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{ocrFeedback}</span>
            </div>
          )}

          {/* Preview Mode: Compiled PDF */}
          {previewMode === 'preview' && (
            <div className="relative w-full mx-auto rounded-xl overflow-hidden border border-blue-200 dark:border-blue-900 shadow-md" style={{ maxWidth: '780px', minHeight: '600px' }}>
              {previewLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 dark:bg-slate-950/90 z-10">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <span className="text-xs font-bold text-slate-500">
                    {language === 'en' ? 'Generating filled PDF preview...' : 'পূরণ করা PDF তৈরি হচ্ছে...'}
                  </span>
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full border-0 bg-white"
                  style={{ height: '85vh', minHeight: '600px' }}
                  title="Filled Form Preview"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Eye className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-xs font-semibold text-slate-400">
                    {language === 'en' ? 'Click the Preview tab above to generate a filled form preview.' : 'উপরের Preview ট্যাবে ক্লিক করুন।'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Edit Mode: Template overlay */}
          {previewMode === 'edit' && (
          <div className="relative w-full mx-auto" style={{ maxWidth: '780px' }}>
            
            {/* The Background PDF Page Renderer with overlays inside */}
            <PdfPageRenderer 
              pdfUrl={`${BACKEND_URL}/assets/annapurna_template.pdf`} 
              pageNumber={step}
              scale={1.35}
            >
              {/* Absolute positioned interactive text overlay grid */}
              <div className="absolute inset-0 z-20 pointer-events-none w-full h-full">
                <div className="relative w-full h-full">
                  
                  {/* Dynamically render page overlay schema fields */}
                  {(pageOverlays[step] || []).map((field) => {
                    const val = getFieldValue(field.id);
                    const isCheckbox = field.type === 'checkbox';
                    
                    if (isCheckbox) {
                      const isChecked = getFieldChecked(field.id);
                      return (
                        <div
                          key={field.id}
                          onClick={() => handleCheckboxToggle(field.id)}
                          className={`absolute border border-dashed hover:border-emerald-500 rounded cursor-pointer pointer-events-auto flex items-center justify-center transition-all bg-white/50 hover:bg-emerald-50/20 ${
                            isChecked ? 'border-emerald-600 bg-emerald-50/10' : 'border-slate-300'
                          }`}
                          style={{
                            left: field.left,
                            top: field.top,
                            width: '14px',
                            height: '14px',
                          }}
                        >
                          {isChecked && (
                            <span className="font-extrabold text-[12px] text-blue-700 flex items-center justify-center leading-none transform -translate-y-0.5 select-none font-sans">✓</span>
                          )}
                        </div>
                      );
                    }

                    if (field.type === 'select') {
                      return (
                        <select
                          key={field.id}
                          disabled={isViewOnly}
                          value={val}
                          onChange={(e) => setFieldValue(field.id, e.target.value)}
                          className="absolute pointer-events-auto outline-none border-none text-[11px] font-medium text-blue-700 bg-emerald-50/40 focus:bg-yellow-50/70 p-0.5 rounded transition-all font-cursive"
                          style={{
                            left: field.left,
                            top: field.top,
                            width: field.width || '80px',
                            height: '22px'
                          }}
                        >
                          <option value="">--</option>
                          {field.options?.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      );
                    }

                    const memberIndex = field.id.startsWith('members.') ? parseInt(field.id.split('.')[1], 10) : undefined;
                    return (
                      <div 
                        key={field.id} 
                        className="absolute pointer-events-auto flex items-center gap-1 group" 
                        style={{
                          left: field.left,
                          top: field.top,
                          width: field.width || '150px',
                          height: '24px',
                          transform: 'translateY(-3px)'
                        }}
                      >
                        <input
                          type={field.type}
                          disabled={isViewOnly}
                          value={val}
                          onChange={(e) => setFieldValue(field.id, e.target.value)}
                          placeholder={field.placeholder || ''}
                          className="flex-1 outline-none border-none text-xs font-semibold text-blue-700 bg-transparent focus:bg-yellow-100/50 p-0.5 font-cursive transition-all"
                          style={{
                            height: '18px',
                            fontSize: '11px',
                            fontFamily: "'Kalam', cursive"
                          }}
                        />
                        {field.docUploadType && !isViewOnly && (
                          <label 
                            className="shrink-0 p-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded cursor-pointer flex items-center justify-center transition-all opacity-40 group-hover:opacity-100 hover:scale-105 shadow-sm" 
                            title={t('uploadBtn')}
                          >
                            <UploadCloud className="w-3 h-3 text-emerald-600" />
                            <input 
                              type="file" 
                              disabled={ocrLoading !== null} 
                              onChange={(e) => handleFileUploadAndOcr(e, field.docUploadType!, memberIndex)} 
                              className="hidden" 
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}


                </div>
              </div>
            </PdfPageRenderer>

          </div>
          )}

          {/* Action progress control buttons */}
          <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-6 mt-6">
            <button
              onClick={() => { saveDraftToServer(false); if(step > 1) setStep(step - 1); }}
              disabled={step === 1}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 cursor-pointer transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('previous')}</span>
            </button>

            <div className="flex gap-2">
              <button
                onClick={handlePrintPdf}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{t('print')}</span>
              </button>

              <button
                onClick={handleDownloadPdf}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{t('download')}</span>
              </button>

              {step < 11 ? (
                <button
                  onClick={() => { saveDraftToServer(false); setStep(step + 1); }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 cursor-pointer transition-all"
                >
                  <span>{t('next')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                !isViewOnly && (
                  <button
                    onClick={handleSubmitApplication}
                    disabled={loading}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-500/10 transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{loading ? t('submitting') : 'Submit Form'}</span>
                  </button>
                )
              )}
            </div>
          </div>

        </section>

      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-[10px] text-slate-400 dark:text-slate-600 tracking-wide border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors mt-auto">
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
