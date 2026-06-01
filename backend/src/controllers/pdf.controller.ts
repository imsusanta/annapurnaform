import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { query, isUsingMockDb, getMockStore } from '../db';

const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/kalam/Kalam-Regular.ttf'; // Kalam Regular
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FONT_PATH = path.join(ASSETS_DIR, 'Kalam-Regular.ttf');

// Helper to ensure assets folder and download Kalam font
async function loadHandwritingFont(): Promise<Buffer | null> {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  if (fs.existsSync(FONT_PATH)) {
    const stat = fs.statSync(FONT_PATH);
    if (stat.size > 10000) { // must be larger than 10KB
      return fs.readFileSync(FONT_PATH);
    }
    fs.unlinkSync(FONT_PATH); // delete corrupt/empty file
  }

  const downloadFont = (url: string, dest: string): Promise<Buffer | null> => {
    return new Promise((resolve) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            console.log(`Following redirect to: ${redirectUrl}`);
            res.resume();
            resolve(downloadFont(redirectUrl, dest));
            return;
          }
        }
        
        if (res.statusCode !== 200) {
          console.error(`Failed to download font: HTTP ${res.statusCode}`);
          res.resume();
          resolve(null);
          return;
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Kalam font downloaded successfully.');
          resolve(fs.readFileSync(dest));
        });
      }).on('error', (err) => {
        console.error('Font download error:', err.message);
        fs.unlink(dest, () => {});
        resolve(null);
      });
    });
  };

  console.log('Downloading Kalam handwriting font...');
  return downloadFont(FONT_URL, FONT_PATH);
}

// Draw a checkbox: [✓] or [ ]
function drawCheckbox(page: any, x: number, y: number, checked: boolean, font: any) {
  page.drawRectangle({
    x,
    y,
    width: 12,
    height: 12,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1,
  });
  if (checked) {
    const blueInk = rgb(0.1, 0.25, 0.65);
    page.drawLine({
      start: { x: x + 2, y: y + 4.5 },
      end: { x: x + 4.5, y: y + 2 },
      thickness: 1.5,
      color: blueInk
    });
    page.drawLine({
      start: { x: x + 4.5, y: y + 2 },
      end: { x: x + 9.5, y: y + 8.5 },
      thickness: 1.5,
      color: blueInk
    });
  }
}

// Fetch application dataset formatted for PDF
async function getApplicationDataForPdf(appId: number): Promise<any> {
  if (isUsingMockDb()) {
    const app = getMockStore().applications.find(a => a.id === appId);
    if (!app) return null;
    return {
      user_id: app.user_id,
      application_id: app.application_id,
      status: app.status,
      created_at: app.created_at,
      hofName: app.families?.hofName || app.families?.hof_name || '',
      hofDob: app.families?.hofDob || app.families?.hof_dob || '',
      hofGender: app.families?.hofGender || app.families?.hof_gender || '',
      hofAadhaar: app.families?.hofAadhaar || app.families?.hof_aadhaar || '',
      hofMobile: app.families?.hofMobile || app.families?.hof_mobile || '',
      hofAddress: app.families?.hofAddress || app.families?.hof_address || '',
      hofCategory: app.families?.hofCategory || app.families?.hof_category || '',
      householdId: app.families?.householdId || app.families?.household_id || '',
      casteCertificatePath: app.families?.casteCertificatePath || app.families?.caste_certificate_path || '',
      members: app.members || [],
      bankDetails: app.bank_details || app.bankDetails || [],
      epicDetails: app.epic_details || app.epicDetails || {},
      panDetails: app.pan_details || app.panDetails || {},
      assets: app.assets || {},
      education: app.education || [],
      children: app.children || [],
      governmentSchemes: app.government_schemes || app.governmentSchemes || {},
      signature: app.signatures?.signatureData || app.signatures?.signature_data || app.signature?.signatureData || null
    };
  }

  // Postgres details
  const appRes = await query('SELECT * FROM applications WHERE id = $1', [appId]);
  if (appRes.rows.length === 0) return null;
  const app = appRes.rows[0];

  const familyRes = await query('SELECT * FROM families WHERE application_id = $1', [appId]);
  const membersRes = await query('SELECT * FROM members WHERE application_id = $1', [appId]);
  const bankRes = await query('SELECT * FROM bank_details WHERE application_id = $1', [appId]);
  const epicRes = await query('SELECT * FROM epic_details WHERE application_id = $1', [appId]);
  const panRes = await query('SELECT * FROM pan_details WHERE application_id = $1', [appId]);
  const assetsRes = await query('SELECT * FROM assets WHERE application_id = $1', [appId]);
  const eduRes = await query('SELECT * FROM education WHERE application_id = $1', [appId]);
  const childrenRes = await query('SELECT * FROM children WHERE application_id = $1', [appId]);
  const schemesRes = await query('SELECT * FROM government_schemes WHERE application_id = $1', [appId]);
  const sigRes = await query('SELECT * FROM signatures WHERE application_id = $1', [appId]);

  const f = familyRes.rows[0] || {};
  const e = epicRes.rows[0] || {};
  const p = panRes.rows[0] || {};
  const a = assetsRes.rows[0] || {};
  const gs = schemesRes.rows[0] || {};
  const sig = sigRes.rows[0] || {};

  return {
    user_id: app.user_id,
    application_id: app.application_id,
    status: app.status,
    created_at: app.created_at,
    hofName: f.hof_name || '',
    hofDob: f.hof_dob ? f.hof_dob.toISOString().split('T')[0] : '',
    hofGender: f.hof_gender || '',
    hofAadhaar: f.hof_aadhaar || '',
    hofMobile: f.hof_mobile || '',
    hofAddress: f.hof_address || '',
    hofCategory: f.hof_category || '',
    householdId: f.household_id || '',
    casteCertificatePath: f.caste_certificate_path || '',
    members: membersRes.rows.map(m => ({
      name: m.name,
      dob: m.dob ? m.dob.toISOString().split('T')[0] : '',
      gender: m.gender,
      relation: m.relation,
      aadhaar: m.aadhaar
    })),
    bankDetails: bankRes.rows.map(b => ({
      memberAadhaar: b.member_aadhaar,
      bankName: b.bank_name,
      accountNumber: b.account_number,
      ifsc: b.ifsc
    })),
    epicDetails: {
      epicNumber: e.epic_number || '',
      acPartNumber: e.ac_part_number || ''
    },
    panDetails: {
      panNumber: p.pan_number || ''
    },
    assets: {
      ...(a.extra_fields ? JSON.parse(a.extra_fields) : {}),
      puccaRooms: a.pucca_rooms || false,
      landOwnership: a.land_ownership || false,
      landSize: a.land_size || '',
      vehicleOwnership: a.vehicle_ownership || false,
      vehicleNumber: a.vehicle_number || '',
      vehicleModel: a.vehicle_model || '',
      healthInsuranceType: a.health_insurance_type || '',
      premium: a.premium || 0,
      sumAssured: a.sum_assured || 0
    },
    education: eduRes.rows.map(edu => ({
      memberAadhaar: edu.member_aadhaar,
      isLiterate: edu.is_literate,
      highestQualification: edu.highest_qualification
    })),
    children: childrenRes.rows.map(c => ({
      name: c.name,
      className: c.class_name,
      schoolName: c.school_name,
      schoolType: c.school_type,
      isVaccinated: c.is_vaccinated,
      vaccinationCardId: c.vaccination_card_id
    })),
    governmentSchemes: {
      schemesList: gs.schemes_list || [],
      dbtReceiving: gs.dbt_receiving || false
    },
    signature: sig.signature_data || null
  };
}

export const generatePdf = async (req: Request, res: Response) => {
  const appId = parseInt(req.params.id) || 0;
  const authedReq = req as AuthenticatedRequest;

  try {
    let appData: any;

    if (req.body && req.body.family) {
      console.log('Generating PDF from request payload body directly (Stateless Mode)...');
      const b = req.body;
      appData = {
        user_id: 1,
        application_id: b.application_id || 'APN-TEMP',
        status: b.status || 'draft',
        created_at: new Date(),
        hofName: b.family?.hofName || '',
        hofDob: b.family?.hofDob || '',
        hofGender: b.family?.hofGender || '',
        hofAadhaar: b.family?.hofAadhaar || '',
        hofMobile: b.family?.hofMobile || '',
        hofAddress: b.family?.hofAddress || '',
        hofCategory: b.family?.hofCategory || '',
        householdId: b.family?.householdId || '',
        casteCertificatePath: b.family?.casteCertificatePath || '',
        members: b.members || [],
        bankDetails: b.bankDetails || [],
        epicDetails: b.epicDetails || {},
        panDetails: b.panDetails || {},
        assets: b.assets || {},
        education: b.education || [],
        children: b.children || [],
        governmentSchemes: b.governmentSchemes || {},
        signature: b.signature?.signatureData || b.signature || null
      };
    } else {
      console.log(`Generating PDF from DB for appId: ${appId}...`);
      appData = await getApplicationDataForPdf(appId);
      if (!appData) {
        return res.status(404).json({ error: 'Application not found' });
      }

      // Verify ownership
      if (appData.user_id && authedReq.user?.role !== 'admin' && appData.user_id !== authedReq.user?.id) {
        return res.status(403).json({ error: 'Access denied: You do not own this application draft' });
      }
    }

    // Check if custom template PDF exists in the assets folder
    let pdfDoc: PDFDocument;
    let isUsingTemplate = false;
    const templatePath = path.join(ASSETS_DIR, 'annapurna_template.pdf');

    if (fs.existsSync(templatePath)) {
      console.log('Template PDF detected! Overlaying text on top of custom template.');
      const templateBytes = fs.readFileSync(templatePath);
      console.log('Reading template bytes...');
      pdfDoc = await PDFDocument.load(templateBytes);
      console.log('Template loaded. Pages count:', pdfDoc.getPageCount());
      isUsingTemplate = true;
    } else {
      console.log('No template PDF found. Creating a styled PDF document dynamically.');
      pdfDoc = await PDFDocument.create();
    }

    // Register font
    let handwritingFont: any;
    console.log('Loading handwriting font...');
    const fontBuffer = await loadHandwritingFont();
    console.log('Handwriting font buffer status:', !!fontBuffer);
    if (fontBuffer) {
      console.log('Registering fontkit...');
      pdfDoc.registerFontkit(require('@pdf-lib/fontkit'));
      console.log('Embedding handwriting font...');
      handwritingFont = await pdfDoc.embedFont(fontBuffer);
      console.log('Handwriting font embedded successfully!');
    } else {
      console.log('Using standard Courier font fallback...');
      handwritingFont = await pdfDoc.embedFont(StandardFonts.Courier);
    }
    console.log('Embedding standard Helvetica fonts...');
    const labelFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const textFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    console.log('All fonts loaded!');

    const blueInk = rgb(0.1, 0.25, 0.65); // Handwriting blue ink

    // Convert YYYY-MM-DD to DD-MM-YYYY
    const formatDob = (dob: string | undefined): string => {
      if (!dob) return '';
      const str = String(dob);
      // Handle YYYY-MM-DD format
      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[3]}-${match[2]}-${match[1]}`;
      return str;
    };

    if (isUsingTemplate) {
      const pages = pdfDoc.getPages();

      // Helpers
      const drawTextVal = (page: any, text: string | number | undefined, x: number, y: number, size = 10) => {
        if (text === undefined || text === null || text === '') return;
        page.drawText(String(text), {
          x,
          y: y + 2,
          size,
          font: handwritingFont,
          color: blueInk
        });
      };

      // Word-aware text wrapping for address
      const wrapTextByWords = (text: string, maxChars: number): string[] => {
        if (!text) return [];
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let current = '';
        for (const word of words) {
          if (current.length + word.length + 1 > maxChars && current.length > 0) {
            lines.push(current.trim());
            current = word;
          } else {
            current += (current ? ' ' : '') + word;
          }
        }
        if (current) lines.push(current.trim());
        return lines;
      };

      const drawTick = (page: any, x: number, y: number, checked: boolean) => {
        if (!checked) return;
        // Draw a realistic handwritten vector tick mark (✓) using two blue ink lines (bolder and centered)
        page.drawLine({
          start: { x: x + 1.5, y: y + 4.5 },
          end: { x: x + 4.0, y: y + 1.5 },
          thickness: 2.0,
          color: blueInk
        });
        page.drawLine({
          start: { x: x + 4.0, y: y + 1.5 },
          end: { x: x + 9.5, y: y + 9.0 },
          thickness: 2.0,
          color: blueInk
        });
      };

      // -------------------------------------------------------------
      // PAGE 1: Family Identity & Members 1-3
      // -------------------------------------------------------------
      const p1 = pages[0];

      drawTextVal(p1, appData.hofName, 220, 673.2, 10);
      drawTextVal(p1, formatDob(appData.hofDob), 220, 631.0, 10);
      
      drawTick(p1, 262.8, 582.0, appData.hofGender === 'Male');
      drawTick(p1, 297.8, 582.0, appData.hofGender === 'Female');
      drawTick(p1, 329.4, 582.0, appData.hofGender === 'Other');

      drawTextVal(p1, appData.hofAadhaar, 220, 562.8, 10);
      drawTextVal(p1, appData.householdId, 220, 534.0, 10);
      
      const mList = appData.members || [];
      const familySize = appData.assets?.familySize || (mList.filter((m: any) => m.name).length + 1);
      drawTextVal(p1, familySize, 220, 508.6, 10);
      
      if (appData.hofAddress) {
        const addressLines = wrapTextByWords(appData.hofAddress, 45);
        addressLines.forEach((line: string, idx: number) => {
          if (idx < 2) {
            drawTextVal(p1, line, 220, 482.9 - idx * 12, 9);
          }
        });
      }
      
      drawTextVal(p1, appData.hofMobile, 220, 424.1, 10);

      // Member 1-3
      if (mList.length > 0) {
        const m = mList[0];
        drawTextVal(p1, m.name, 260, 305.5, 9);
        drawTextVal(p1, formatDob(m.dob), 260, 292.3, 9);
        drawTextVal(p1, m.gender, 260, 279.1, 9);
        drawTextVal(p1, m.relation, 370, 265.7, 9);
        drawTextVal(p1, m.aadhaar, 270, 252.5, 9);
        drawTick(p1, 433.8, 250.8, true);
      }
      if (mList.length > 1) {
        const m = mList[1];
        drawTextVal(p1, m.name, 260, 219.4, 9);
        drawTextVal(p1, formatDob(m.dob), 260, 206.2, 9);
        drawTextVal(p1, m.gender, 260, 192.7, 9);
        drawTextVal(p1, m.relation, 370, 179.5, 9);
        drawTextVal(p1, m.aadhaar, 270, 166.3, 9);
        drawTick(p1, 433.8, 169.2, true);
      }
      if (mList.length > 2) {
        const m = mList[2];
        drawTextVal(p1, m.name, 260, 133.7, 9);
        drawTextVal(p1, formatDob(m.dob), 260, 122.2, 9);
        drawTextVal(p1, m.gender, 260, 110.9, 9);
        drawTextVal(p1, m.relation, 370, 99.4, 9);
        drawTextVal(p1, m.aadhaar, 270, 87.8, 9);
        drawTick(p1, 433.8, 87.6, true);
      }

      // -------------------------------------------------------------
      // PAGE 2: Member 4-5 & Bank accounts HOF + Members 1-5 & EPIC
      // -------------------------------------------------------------
      const p2 = pages[1];
      if (mList.length > 3) {
        const m = mList[3];
        drawTextVal(p2, m.name, 260, 766.6, 9);
        drawTextVal(p2, formatDob(m.dob), 260, 753.1, 9);
        drawTextVal(p2, m.gender, 260, 739.9, 9);
        drawTextVal(p2, m.relation, 370, 726.5, 9);
        drawTextVal(p2, m.aadhaar, 270, 713.3, 9);
        drawTick(p2, 433.8, 698.4, true);
      }
      if (mList.length > 4) {
        const m = mList[4];
        drawTextVal(p2, m.name, 260, 661.7, 9);
        drawTextVal(p2, formatDob(m.dob), 260, 650.4, 9);
        drawTextVal(p2, m.gender, 260, 638.9, 9);
        drawTextVal(p2, m.relation, 370, 627.4, 9);
        drawTextVal(p2, m.aadhaar, 270, 615.8, 9);
        drawTick(p2, 433.8, 600.0, true);
      }

      // Bank accounts — exact Y coords derived from form template
      const banks = appData.bankDetails || [];
      const hofBank = banks.find((b: any) => b.memberAadhaar === appData.hofAadhaar) || banks[0];
      if (hofBank) {
        drawTextVal(p2, hofBank.bankName, 280, 603.7, 9);
        drawTextVal(p2, hofBank.accountNumber, 260, 580.9, 9);
        drawTextVal(p2, hofBank.ifsc, 250, 558.2, 9);
      }
      
      // Each entry: [bankNameY, accountNumberY, ifscY]
      const memberBankYCoords = [
        [534.6, 511.9, 489.2],  // Member 1
        [465.6, 442.8, 420.1],  // Member 2
        [393.2, 367.1, 340.1],  // Member 3
        [313.2, 287.1, 260.2],  // Member 4
        [234.1, 207.1, 180.2],  // Member 5
      ];
      mList.forEach((m: any, idx: number) => {
        if (idx >= 5) return;
        const mb = banks.find((b: any) => b.memberAadhaar === m.aadhaar) || banks[idx + 1];
        if (mb && (mb.bankName || mb.accountNumber || mb.ifsc)) {
          const [yName, yAcct, yIfsc] = memberBankYCoords[idx];
          drawTextVal(p2, mb.bankName, 280, yName, 9);
          drawTextVal(p2, mb.accountNumber, 280, yAcct, 9);
          drawTextVal(p2, mb.ifsc, 250, yIfsc, 9);
        }
      });

      // EPIC Details
      if (appData.epicDetails) {
        drawTextVal(p2, appData.epicDetails.epicNumber, 280, 153.4, 9);
        drawTextVal(p2, appData.epicDetails.acPartNumber, 290, 140.2, 9);
      }

      // -------------------------------------------------------------
      // PAGE 3: EPIC continued, Category, Ration, Assets & Insurance HOF + Member 1-3
      // -------------------------------------------------------------
      const p3 = pages[2];
      
      const cat = appData.hofCategory || '';
      drawTick(p3, 217.2, 621.6, cat.toUpperCase() === 'GENERAL' || cat.toUpperCase() === 'UR');
      drawTick(p3, 327.8, 621.6, cat.toUpperCase() === 'SC');
      drawTick(p3, 363.6, 621.6, cat.toUpperCase() === 'ST');
      drawTick(p3, 228.3, 608.4, cat.toUpperCase() === 'OBC');

      const hasRation = !!appData.householdId;
      drawTick(p3, 217.2, 562.6, hasRation);
      drawTick(p3, 258.9, 562.6, !hasRation);
      if (hasRation) {
        drawTick(p3, 265.0, 542.2, true);
      }
      drawTick(p3, 217.2, 508.3, true);

      const assets = appData.assets || {};
      drawTick(p3, 217.2, 467.5, assets.puccaRooms === true);
      drawTick(p3, 261.4, 467.5, assets.puccaRooms !== true);
      
      drawTick(p3, 217.2, 430.8, assets.landOwnership === true);
      drawTick(p3, 261.4, 430.8, assets.landOwnership !== true);
      
      if (assets.landOwnership) {
        drawTextVal(p3, assets.landSize || '0', 220, 394.6, 9);
      }

      drawTick(p3, 217.2, 372.5, assets.vehicleOwnership === true);
      drawTick(p3, 261.4, 372.5, assets.vehicleOwnership !== true);
      
      if (assets.vehicleOwnership) {
        drawTextVal(p3, '1', 320, 359.0, 9);
        drawTextVal(p3, assets.vehicleModel, 450, 347.5, 9);
        drawTextVal(p3, assets.vehicleNumber, 340, 332.4, 9);
      }

      const hasIns = !!assets.healthInsuranceType && assets.healthInsuranceType !== 'None';
      drawTick(p3, 217.2, 316.1, !hasIns);
      drawTick(p3, 217.2, 301.0, hasIns);

      if (hasIns) {
        const isGov = assets.healthInsuranceType.toLowerCase().includes('govt') || assets.healthInsuranceType.toLowerCase().includes('government');
        drawTick(p3, 240.3, 266.9, isGov);
        drawTick(p3, 313.9, 266.9, !isGov);
        drawTextVal(p3, assets.premium, 270, 253.4, 9);
        drawTextVal(p3, assets.sumAssured, 290, 240.0, 9);
      }

      // -------------------------------------------------------------
      // PAGE 4: Member 4-5 health ins, Income tax, PAN Details, Nature of employment HOF & Member 1-2
      // -------------------------------------------------------------
      const p4 = pages[3];
      const hasPan = !!appData.panDetails?.panNumber;
      drawTick(p4, 217.2, 644.2, hasPan);
      drawTick(p4, 217.2, 629.0, !hasPan);
      
      if (hasPan) {
        drawTextVal(p4, appData.hofName, 235, 617.3, 9);
        drawTextVal(p4, appData.panDetails.panNumber, 245, 605.8, 9);
      }
      
      // HOF Employment Status Checkboxes
      drawTick(p4, 217.2, 451.4, assets.hofEmp_Govt);
      drawTick(p4, 316.3, 451.4, assets.hofEmp_Private);
      drawTick(p4, 272.7, 438.2, assets.hofEmp_FormalSelf);
      drawTick(p4, 397.2, 424.8, assets.hofEmp_PartTime);
      drawTick(p4, 297.2, 411.6, assets.hofEmp_InformalSelf);
      drawTick(p4, 397.4, 398.2, assets.hofEmp_Migrant);
      drawTick(p4, 306.1, 385.0, assets.hofEmp_Unemployed);
      drawTick(p4, 386.3, 385.0, assets.hofEmp_Others);

      // Member 1 Employment Status (if exists)
      if (mList.length > 0) {
        drawTick(p4, 217.2, 337.4, assets.m1Emp_Govt);
        drawTick(p4, 316.3, 337.4, assets.m1Emp_Private);
        drawTick(p4, 272.7, 324.2, assets.m1Emp_FormalSelf);
        drawTick(p4, 397.2, 311.0, assets.m1Emp_PartTime);
        drawTick(p4, 297.2, 297.8, assets.m1Emp_InformalSelf);
        drawTick(p4, 397.4, 284.4, assets.m1Emp_Migrant);
        drawTick(p4, 306.1, 271.2, assets.m1Emp_Unemployed);
        drawTick(p4, 386.3, 271.2, assets.m1Emp_Others);
      }

      // Member 2 Employment Status (if exists)
      if (mList.length > 1) {
        drawTick(p4, 217.2, 222.0, assets.m2Emp_Govt);
        drawTick(p4, 316.3, 222.0, assets.m2Emp_Private);
        drawTick(p4, 272.7, 208.8, assets.m2Emp_FormalSelf);
        drawTick(p4, 397.2, 195.4, assets.m2Emp_PartTime);
        drawTick(p4, 297.2, 182.2, assets.m2Emp_InformalSelf);
        drawTick(p4, 397.4, 168.7, assets.m2Emp_Migrant);
        drawTick(p4, 306.1, 155.5, assets.m2Emp_Unemployed);
        drawTick(p4, 386.3, 155.5, assets.m2Emp_Others);
      }

      // -------------------------------------------------------------
      // PAGE 5: Member 3-5 employment, Literate stats, HOF & Member 1-4 Literate Highest Qualification
      // -------------------------------------------------------------
      const p5 = pages[4];
      
      // Member 3 Employment Status (if exists)
      if (mList.length > 2) {
        drawTick(p5, 217.2, 766.8, assets.m3Emp_Govt);
        drawTick(p5, 316.3, 766.8, assets.m3Emp_Private);
        drawTick(p5, 272.7, 753.6, assets.m3Emp_FormalSelf);
        drawTick(p5, 397.2, 740.2, assets.m3Emp_PartTime);
        drawTick(p5, 297.2, 727.0, assets.m3Emp_InformalSelf);
        drawTick(p5, 397.4, 713.8, assets.m3Emp_Migrant);
        drawTick(p5, 306.1, 700.4, assets.m3Emp_Unemployed);
        drawTick(p5, 386.3, 700.4, assets.m3Emp_Others);
      }

      // Member 4 Employment Status (if exists)
      if (mList.length > 3) {
        drawTick(p5, 217.2, 666.0, assets.m4Emp_Govt);
        drawTick(p5, 316.3, 666.0, assets.m4Emp_Private);
        drawTick(p5, 272.7, 652.5, assets.m4Emp_FormalSelf);
        drawTick(p5, 397.2, 639.0, assets.m4Emp_PartTime);
        drawTick(p5, 297.2, 626.4, assets.m4Emp_InformalSelf);
        drawTick(p5, 397.4, 612.9, assets.m4Emp_Migrant);
        drawTick(p5, 306.1, 599.5, assets.m4Emp_Unemployed);
        drawTick(p5, 386.3, 599.5, assets.m4Emp_Others);
      }

      // Member 5 Employment Status (if exists)
      if (mList.length > 4) {
        drawTick(p5, 217.2, 550.2, assets.m5Emp_Govt);
        drawTick(p5, 316.3, 550.2, assets.m5Emp_Private);
        drawTick(p5, 272.7, 536.7, assets.m5Emp_FormalSelf);
        drawTick(p5, 397.2, 523.3, assets.m5Emp_PartTime);
        drawTick(p5, 297.2, 510.7, assets.m5Emp_InformalSelf);
        drawTick(p5, 397.4, 497.2, assets.m5Emp_Migrant);
        drawTick(p5, 306.1, 483.7, assets.m5Emp_Unemployed);
        drawTick(p5, 386.3, 483.7, assets.m5Emp_Others);
      }

      const eduList = appData.education || [];
      const literateCount = eduList.filter((e: any) => e.isLiterate !== false).length + 1;
      const illiterateCount = eduList.filter((e: any) => e.isLiterate === false).length;
      drawTextVal(p5, literateCount, 220, 500.2, 9);
      drawTextVal(p5, illiterateCount, 220, 487.0, 9);

      // HOF Literacy
      const hofEdu = eduList.find((e: any) => e.memberAadhaar === appData.hofAadhaar) || eduList[0];
      const hofIsLit = hofEdu ? hofEdu.isLiterate !== false : true;
      const hofQual = hofEdu ? hofEdu.highestQualification : 'Graduate';
      drawTick(p5, 217.2, 449.0, hofIsLit);
      drawTick(p5, 217.2, 433.9, !hofIsLit);
      if (hofIsLit) {
        drawTextVal(p5, hofQual, 320, 422.2, 9);
      }

      mList.forEach((m: any, idx: number) => {
        if (idx >= 4) return;
        const me = eduList.find((e: any) => e.memberAadhaar === m.aadhaar);
        const isLit = me ? me.isLiterate !== false : true;
        const qual = me ? me.highestQualification : 'Primary';
        
        const litY = [380.6, 299.0, 219.4, 139.4][idx];
        const illitY = [365.5, 283.9, 204.2, 124.3][idx];
        const qualY = [352.1, 270.5, 190.8, 110.9][idx];

        drawTick(p5, 217.2, litY, isLit);
        drawTick(p5, 217.2, illitY, !isLit);
        if (isLit) {
          drawTextVal(p5, qual, 320, qualY, 9);
        }
      });

      // -------------------------------------------------------------
      // PAGE 6: Member 5 Literate Highest Qualification, Total annual income
      // -------------------------------------------------------------
      const p6 = pages[5];
      if (mList.length > 4) {
        const me = eduList.find((e: any) => e.memberAadhaar === mList[4].aadhaar);
        const isLit = me ? me.isLiterate !== false : true;
        const qual = me ? me.highestQualification : 'Primary';
        
        drawTick(p6, 217.2, 764.9, isLit);
        drawTick(p6, 217.2, 749.8, !isLit);
        if (isLit) {
          drawTextVal(p6, qual, 320, 738.0, 9);
        }
      }
      drawTextVal(p6, '120,000', 300, 450.0, 9);

      // -------------------------------------------------------------
      // PAGE 8: Children Education
      // -------------------------------------------------------------
      const p8 = pages[7];
      const kids = appData.children || [];
      kids.forEach((c: any, idx: number) => {
        if (idx >= 4) return;
        const yVal = 630.0 - idx * 64;
        drawTextVal(p8, idx + 1, 90, yVal, 9);
        drawTextVal(p8, c.name, 150, yVal, 9);
        drawTextVal(p8, c.className, 300, yVal, 9);
        drawTextVal(p8, c.schoolName, 380, yVal, 8);
        
        const isGovt = c.schoolType?.toLowerCase().includes('govt') || c.schoolType?.toLowerCase().includes('government');
        drawTick(p8, 35, yVal - 20, isGovt);
        drawTick(p8, 100, yVal - 20, !isGovt);
      });

      // -------------------------------------------------------------
      // PAGE 10: Consent & Signature
      // -------------------------------------------------------------
      const p10 = pages[9];
      drawTick(p10, 217.2, 309.8, true);

      if (appData.signature && appData.signature.startsWith('data:image/png;base64,')) {
        try {
          const sigBase64 = appData.signature.replace('data:image/png;base64,', '');
          const sigImageBytes = Buffer.from(sigBase64, 'base64');
          const cleanBytes = new Uint8Array(sigImageBytes); // Copy standard independent Uint8Array
          const embeddedSig = await pdfDoc.embedPng(cleanBytes);
          
          p10.drawImage(embeddedSig, {
            x: 240,
            y: 200,
            width: 150,
            height: 45
          });
        } catch (err: any) {
          console.error('Error embedding signature on Page 10 template:', err.message);
        }
      }
    } else {
      // -------------------------------------------------------------
      // PAGE 1: HOF Details, EPIC, PAN & Assets (Original Dynamic Fallback)
      // -------------------------------------------------------------
      const page = pdfDoc.addPage([595, 842]); // A4 Size
      
      // Draw Border
      page.drawRectangle({
        x: 20,
        y: 20,
        width: 555,
        height: 802,
        borderColor: rgb(0.1, 0.5, 0.1), // green border
        borderWidth: 2,
      });

      // Form Header Seal
      page.drawText('GOVERNMENT OF WEST BENGAL', { x: 210, y: 790, size: 12, font: labelFont, color: rgb(0.1, 0.3, 0.1) });
      page.drawText('ANNAPURNA BHANDAR YOJANA FAMILY DATA FORM', { x: 130, y: 770, size: 13, font: labelFont, color: rgb(0.1, 0.4, 0.1) });
      
      // Application ID metadata box
      page.drawRectangle({ x: 30, y: 715, width: 535, height: 40, color: rgb(0.95, 0.98, 0.95), borderColor: rgb(0.7, 0.8, 0.7), borderWidth: 1 });
      page.drawText('Application ID:', { x: 40, y: 730, size: 10, font: labelFont });
      page.drawText('Status:', { x: 320, y: 730, size: 10, font: labelFont });
      page.drawText('Date:', { x: 450, y: 730, size: 10, font: labelFont });

      // Section 1: HOF Details
      page.drawRectangle({ x: 30, y: 690, width: 535, height: 18, color: rgb(0.9, 0.9, 0.9) });
      page.drawText('SECTION A: HEAD OF FAMILY (HOF) DETAILS', { x: 35, y: 695, size: 9, font: labelFont });

      // Draw Application ID data values
      page.drawText(appData.application_id, { x: 120, y: 730, size: 11, font: handwritingFont, color: blueInk });
      page.drawText(appData.status.toUpperCase(), { x: 360, y: 730, size: 11, font: handwritingFont, color: blueInk });
      const formattedDate = new Date(appData.created_at || new Date()).toLocaleDateString();
      page.drawText(formattedDate, { x: 480, y: 730, size: 11, font: handwritingFont, color: blueInk });

      const hofFields = [
        { label: '1. Full Name:', value: appData.hofName },
        { label: '2. Date of Birth:', value: formatDob(appData.hofDob) },
        { label: '3. Gender:', value: appData.hofGender },
        { label: '4. Aadhaar Number:', value: appData.hofAadhaar },
        { label: '5. Mobile Number:', value: appData.hofMobile },
        { label: '6. Category (SC/ST/General):', value: appData.hofCategory },
        { label: '7. Digital Ration Card ID:', value: appData.householdId },
        { label: '8. Residential Address:', value: appData.hofAddress }
      ];

      let currentY = 665;
      hofFields.forEach(f => {
        page.drawText(f.label, { x: 35, y: currentY, size: 9, font: labelFont });
        if (f.label.includes('Address')) {
          page.drawText(f.value || '', { x: 170, y: currentY, size: 10, font: handwritingFont, color: blueInk, maxWidth: 380 });
          currentY -= 25;
        } else {
          page.drawText(f.value || '', { x: 170, y: currentY, size: 10, font: handwritingFont, color: blueInk });
        }
        currentY -= 20;
      });

      // Section 2: EPIC & PAN Details
      page.drawRectangle({ x: 30, y: currentY + 5, width: 535, height: 18, color: rgb(0.9, 0.9, 0.9) });
      page.drawText('SECTION B: IDENTITY DETAILS (EPIC & PAN)', { x: 35, y: currentY + 10, size: 9, font: labelFont });
      
      currentY -= 15;
      page.drawText('1. Voter EPIC Card No:', { x: 35, y: currentY, size: 9, font: labelFont });
      page.drawText('2. Assembly Part No:', { x: 350, y: currentY, size: 9, font: labelFont });
      page.drawText(appData.epicDetails?.epicNumber || '', { x: 170, y: currentY, size: 10, font: handwritingFont, color: blueInk });
      page.drawText(appData.epicDetails?.acPartNumber || '', { x: 450, y: currentY, size: 10, font: handwritingFont, color: blueInk });
      
      currentY -= 20;
      page.drawText('3. PAN Card Number:', { x: 35, y: currentY, size: 9, font: labelFont });
      page.drawText(appData.panDetails?.panNumber || '', { x: 170, y: currentY, size: 10, font: handwritingFont, color: blueInk });

      // Section 3: Asset Details
      currentY -= 30;
      page.drawRectangle({ x: 30, y: currentY + 5, width: 535, height: 18, color: rgb(0.9, 0.9, 0.9) });
      page.drawText('SECTION C: HOUSEHOLD ASSET DECLARATION', { x: 35, y: currentY + 10, size: 9, font: labelFont });
      
      const assets = appData.assets || {};
      currentY -= 15;
      page.drawText('1. 3+ Pucca Rooms:', { x: 35, y: currentY, size: 9, font: labelFont });
      page.drawText('Yes', { x: 165, y: currentY + 2, size: 8, font: textFont });
      page.drawText('No', { x: 210, y: currentY + 2, size: 8, font: textFont });
      page.drawText('2. Land Ownership:', { x: 270, y: currentY, size: 9, font: labelFont });
      page.drawText('Yes', { x: 395, y: currentY + 2, size: 8, font: textFont });
      page.drawText('No', { x: 440, y: currentY + 2, size: 8, font: textFont });
      
      const drawCheckboxLocal = (pg: any, cx: number, cy: number, checked: boolean) => {
        pg.drawRectangle({
          x: cx,
          y: cy,
          width: 12,
          height: 12,
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 1,
        });
        if (checked) {
          pg.drawLine({
            start: { x: cx + 2, y: cy + 4.5 },
            end: { x: cx + 4.5, y: cy + 2 },
            thickness: 1.5,
            color: blueInk
          });
          pg.drawLine({
            start: { x: cx + 4.5, y: cy + 2 },
            end: { x: cx + 9.5, y: cy + 8.5 },
            thickness: 1.5,
            color: blueInk
          });
        }
      };

      drawCheckboxLocal(page, 150, currentY, assets.puccaRooms === true);
      drawCheckboxLocal(page, 195, currentY, assets.puccaRooms === false);
      drawCheckboxLocal(page, 380, currentY, assets.landOwnership === true);
      drawCheckboxLocal(page, 425, currentY, assets.landOwnership === false);
      page.drawText(`Size: ${assets.landSize || '0'} acres`, { x: 480, y: currentY, size: 9, font: handwritingFont, color: blueInk });

      currentY -= 25;
      page.drawText('3. Motor Vehicle Ownership:', { x: 35, y: currentY, size: 9, font: labelFont });
      page.drawText('Yes', { x: 190, y: currentY + 2, size: 8, font: textFont });
      page.drawText('No', { x: 235, y: currentY + 2, size: 8, font: textFont });
      
      drawCheckboxLocal(page, 175, currentY, assets.vehicleOwnership === true);
      drawCheckboxLocal(page, 220, currentY, assets.vehicleOwnership === false);

      if (assets.vehicleOwnership) {
        page.drawText(`Model: ${assets.vehicleModel || 'N/A'} (No: ${assets.vehicleNumber || 'N/A'})`, { x: 270, y: currentY, size: 9, font: handwritingFont, color: blueInk });
      }

      currentY -= 25;
      page.drawText('4. Health Insurance Scheme:', { x: 35, y: currentY, size: 9, font: labelFont });
      page.drawText(assets.healthInsuranceType || 'None', { x: 175, y: currentY, size: 10, font: handwritingFont, color: blueInk });
      
      if (assets.premium) {
        page.drawText(`Premium: Rs. ${assets.premium} / Sum Assured: Rs. ${assets.sumAssured}`, { x: 300, y: currentY, size: 9, font: handwritingFont, color: blueInk });
      }

      page.drawText('Page 1 of 3', { x: 270, y: 30, size: 9, font: textFont });

      // -------------------------------------------------------------
      // PAGE 2: Family Members grid & Education/Children (Original Dynamic Fallback)
      // -------------------------------------------------------------
      const page2 = pdfDoc.addPage([595, 842]);
      page2.drawRectangle({
        x: 20,
        y: 20,
        width: 555,
        height: 802,
        borderColor: rgb(0.1, 0.5, 0.1),
        borderWidth: 2,
      });

      page2.drawText('SECTION D: FAMILY ROSTER & EDUCATION DETAILS', { x: 30, y: 790, size: 11, font: labelFont, color: rgb(0.1, 0.4, 0.1) });

      const startTableY = 760;
      page2.drawRectangle({ x: 30, y: startTableY, width: 535, height: 25, color: rgb(0.9, 0.95, 0.9) });
      const headers = [
        { text: 'Name', x: 35, width: 140 },
        { text: 'Relation', x: 180, width: 70 },
        { text: 'Aadhaar Card No', x: 255, width: 90 },
        { text: 'Gender', x: 350, width: 50 },
        { text: 'DOB', x: 405, width: 70 },
        { text: 'Qualif.', x: 480, width: 75 }
      ];
      headers.forEach(h => {
        page2.drawText(h.text, { x: h.x, y: startTableY + 7, size: 9, font: labelFont });
      });
      page2.drawLine({ start: { x: 30, y: startTableY }, end: { x: 565, y: startTableY }, thickness: 1 });
      page2.drawLine({ start: { x: 30, y: startTableY + 25 }, end: { x: 565, y: startTableY + 25 }, thickness: 1 });

      let tableY = startTableY - 22;
      const hofRow = {
        name: appData.hofName,
        relation: 'HOF',
        aadhaar: appData.hofAadhaar,
        gender: appData.hofGender,
        dob: formatDob(appData.hofDob),
        qualification: 'Graduate'
      };
      const allMembers = [hofRow, ...(appData.members || [])];

      allMembers.forEach((m: any) => {
        const eduInfo = (appData.education || []).find((e: any) => e.memberAadhaar === m.aadhaar);
        const qual = eduInfo ? eduInfo.highestQualification : (m.qualification || 'Primary');

        page2.drawText(m.name || '', { x: 35, y: tableY + 5, size: 9, font: handwritingFont, color: blueInk });
        page2.drawText(m.relation || '', { x: 180, y: tableY + 5, size: 9, font: handwritingFont, color: blueInk });
        page2.drawText(m.aadhaar || '', { x: 255, y: tableY + 5, size: 9, font: handwritingFont, color: blueInk });
        page2.drawText(m.gender || '', { x: 350, y: tableY + 5, size: 9, font: handwritingFont, color: blueInk });
        page2.drawText(formatDob(m.dob) || '', { x: 405, y: tableY + 5, size: 9, font: handwritingFont, color: blueInk });
        page2.drawText(qual || '', { x: 480, y: tableY + 5, size: 9, font: handwritingFont, color: blueInk });
        
        page2.drawLine({ start: { x: 30, y: tableY }, end: { x: 565, y: tableY }, thickness: 0.5 });
        tableY -= 22;
      });

      // Section E: Children Info Table
      currentY = tableY - 20;
      page2.drawRectangle({ x: 30, y: currentY, width: 535, height: 18, color: rgb(0.9, 0.9, 0.9) });
      page2.drawText('SECTION E: CHILDREN EDUCATION & VACCINATION STATUS', { x: 35, y: currentY + 5, size: 9, font: labelFont });

      currentY -= 25;
      page2.drawRectangle({ x: 30, y: currentY, width: 535, height: 20, color: rgb(0.95, 0.95, 0.95) });
      const childHeaders = [
        { text: "Child's Name", x: 35 },
        { text: 'Class', x: 180 },
        { text: 'School Name & Type', x: 240 },
        { text: 'Vaccinated?', x: 430 },
        { text: 'Vaccine ID', x: 495 }
      ];
      childHeaders.forEach(ch => {
        page2.drawText(ch.text, { x: ch.x, y: currentY + 5, size: 8, font: labelFont });
      });
      page2.drawLine({ start: { x: 30, y: currentY }, end: { x: 565, y: currentY }, thickness: 1 });

      const childrenList = appData.children && appData.children.length > 0 ? appData.children : [{ name: '', className: '', schoolName: '', schoolType: '', isVaccinated: false, vaccinationCardId: '' }];
      
      currentY -= 20;
      childrenList.forEach((c: any) => {
        if (c.name) {
          page2.drawText(c.name || '', { x: 35, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
          page2.drawText(c.className || '', { x: 180, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
          page2.drawText(`${c.schoolName || ''} (${c.schoolType || ''})`, { x: 240, y: currentY + 4, size: 8, font: handwritingFont, color: blueInk, maxWidth: 180 });
          page2.drawText(c.isVaccinated ? 'Yes' : 'No', { x: 430, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
          page2.drawText(c.vaccinationCardId || '-', { x: 495, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
        } else {
          page2.drawText('No children registered', { x: 35, y: currentY + 4, size: 9, font: textFont, color: rgb(0.5, 0.5, 0.5) });
        }
        page2.drawLine({ start: { x: 30, y: currentY }, end: { x: 565, y: currentY }, thickness: 0.5 });
        currentY -= 20;
      });

      page2.drawText('Page 2 of 3', { x: 270, y: 30, size: 9, font: textFont });

      // -------------------------------------------------------------
      // PAGE 3: Bank Details, Government Schemes, Declaration & Signature (Original Dynamic Fallback)
      // -------------------------------------------------------------
      const page3 = pdfDoc.addPage([595, 842]);
      page3.drawRectangle({
        x: 20,
        y: 20,
        width: 555,
        height: 802,
        borderColor: rgb(0.1, 0.5, 0.1),
        borderWidth: 2,
      });

      page3.drawText('SECTION F: BANK ACCOUNT DETAILS', { x: 30, y: 790, size: 11, font: labelFont, color: rgb(0.1, 0.4, 0.1) });

      currentY = 760;
      page3.drawRectangle({ x: 30, y: currentY, width: 535, height: 20, color: rgb(0.9, 0.95, 0.9) });
      const bankHeaders = [
        { text: 'Aadhaar Linked', x: 35 },
        { text: 'Bank Name', x: 180 },
        { text: 'Account Number', x: 320 },
        { text: 'IFSC Code', x: 460 }
      ];
      bankHeaders.forEach(bh => {
        page3.drawText(bh.text, { x: bh.x, y: currentY + 5, size: 8, font: labelFont });
      });
      page3.drawLine({ start: { x: 30, y: currentY }, end: { x: 565, y: currentY }, thickness: 1 });

      const banksLocal = appData.bankDetails && appData.bankDetails.length > 0 ? appData.bankDetails : [{ memberAadhaar: appData.hofAadhaar, bankName: '', accountNumber: '', ifsc: '' }];

      currentY -= 20;
      banksLocal.forEach((b: any) => {
        page3.drawText(b.memberAadhaar || '', { x: 35, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
        page3.drawText(b.bankName || '', { x: 180, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
        page3.drawText(b.accountNumber || '', { x: 320, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
        page3.drawText(b.ifsc || '', { x: 460, y: currentY + 4, size: 9, font: handwritingFont, color: blueInk });
        
        page3.drawLine({ start: { x: 30, y: currentY }, end: { x: 565, y: currentY }, thickness: 0.5 });
        currentY -= 20;
      });

      // Government Schemes
      currentY -= 15;
      page3.drawRectangle({ x: 30, y: currentY, width: 535, height: 18, color: rgb(0.9, 0.9, 0.9) });
      page3.drawText('SECTION G: GOVERNMENT SCHEMES & DBT RECEIPTS', { x: 35, y: currentY + 5, size: 9, font: labelFont });

      const schemesList = appData.governmentSchemes?.schemesList || [];
      const dbts = appData.governmentSchemes?.dbtReceiving || false;

      currentY -= 20;
      page3.drawText('Currently receiving any of the following benefits? (Select all that apply)', { x: 35, y: currentY, size: 8, font: textFont });
      
      currentY -= 20;
      const allSchemes = ['Lakshmir Bhandar', 'PM Kisan', 'Old Age Pension', 'Kanyashree', 'Rupashree', 'Awas Yojana'];
      allSchemes.forEach((s, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const posX = 35 + col * 170;
        const posY = currentY - row * 18;
        
        const hasScheme = schemesList.includes(s);
        drawCheckboxLocal(page3, posX, posY, hasScheme);
        page3.drawText(s, { x: posX + 16, y: posY + 2, size: 8, font: textFont });
      });

      currentY -= 35;
      page3.drawText('Receiving Direct Benefit Transfer (DBT) directly into bank account?', { x: 35, y: currentY, size: 8, font: textFont });
      page3.drawText('Yes', { x: 396, y: currentY, size: 8, font: textFont });
      page3.drawText('No', { x: 441, y: currentY, size: 8, font: textFont });
      
      drawCheckboxLocal(page3, 380, currentY - 2, dbts === true);
      drawCheckboxLocal(page3, 426, currentY - 2, dbts === false);

      // Section H: Declaration and Signature
      currentY -= 25;
      page3.drawRectangle({ x: 30, y: currentY, width: 535, height: 18, color: rgb(0.9, 0.9, 0.9) });
      page3.drawText('SECTION H: DECLARATION & SIGNATURE', { x: 35, y: currentY + 5, size: 9, font: labelFont });

      currentY -= 15;
      const declarationText = 
        'I hereby declare that all the information provided above is true to the best of my knowledge. ' +
        'I understand that if any information is found to be false, my application is liable to be rejected ' +
        'and legal action may be taken against me.';
      
      page3.drawText(declarationText, {
        x: 35,
        y: currentY,
        size: 7.5,
        font: textFont,
        maxWidth: 515,
        lineHeight: 11
      });

      currentY -= 90;
      
      page3.drawRectangle({
        x: 370,
        y: currentY,
        width: 170,
        height: 70,
        borderColor: rgb(0.5, 0.5, 0.5),
        borderWidth: 0.5
      });
      page3.drawText('Signature / Thumb Impression of HOF', { x: 375, y: currentY - 12, size: 7.5, font: labelFont });

      // Embed Signature Canvas PNG if exists
      if (appData.signature && appData.signature.startsWith('data:image/png;base64,')) {
        try {
          const sigBase64 = appData.signature.replace('data:image/png;base64,', '');
          const sigImageBytes = Buffer.from(sigBase64, 'base64');
          const cleanBytes = new Uint8Array(sigImageBytes); // Copy standard independent Uint8Array
          const embeddedSig = await pdfDoc.embedPng(cleanBytes);
          
          page3.drawImage(embeddedSig, {
            x: 380,
            y: currentY + 5,
            width: 150,
            height: 60
          });
        } catch (err: any) {
          console.error('Error embedding signature image into PDF:', err.message);
        }
      }

      page3.drawText('Page 3 of 3', { x: 270, y: 30, size: 9, font: textFont });
    }

    // Save and send PDF
    const pdfBytes = await pdfDoc.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Annapurna_Application_${appData.application_id}.pdf`);
    
    res.send(Buffer.from(pdfBytes));

  } catch (error: any) {
    console.error('Error compiling PDF:', error);
    return res.status(500).json({ error: 'Failed to generate PDF document' });
  }
};
