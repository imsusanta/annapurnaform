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
      caaStatus: app.families?.caaStatus || app.families?.caa_status || 'Not Applicable',
      caaNumber: app.families?.caaNumber || app.families?.caa_number || '',
      otherCardType: app.families?.otherCardType || app.families?.other_card_type || '',
      otherCardNumber: app.families?.otherCardNumber || app.families?.other_card_number || '',
      otherCardIssueDate: app.families?.otherCardIssueDate || app.families?.other_card_issue_date || '',
      tribunalStatus: app.families?.tribunalStatus || app.families?.tribunal_status || 'Not Applicable',
      tribunalDetails: app.families?.tribunalDetails || app.families?.tribunal_details || '',
      dbtReceiving: app.families?.dbtReceiving || app.families?.dbt_receiving || false,
      dbtSchemes: app.families?.dbtSchemes || app.families?.dbt_schemes || '',
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
    caaStatus: f.caa_status || 'Not Applicable',
    caaNumber: f.caa_number || '',
    otherCardType: f.other_card_type || '',
    otherCardNumber: f.other_card_number || '',
    otherCardIssueDate: f.other_card_issue_date || '',
    tribunalStatus: f.tribunal_status || 'Not Applicable',
    tribunalDetails: f.tribunal_details || '',
    dbtReceiving: f.dbt_receiving || false,
    dbtSchemes: f.dbt_schemes || '',
    members: membersRes.rows.map(m => ({
      name: m.name,
      dob: m.dob ? m.dob.toISOString().split('T')[0] : '',
      gender: m.gender,
      relation: m.relation,
      aadhaar: m.aadhaar,
      bankName: m.bank_name || '',
      accountNumber: m.account_number || '',
      ifsc: m.ifsc || '',
      passbookPath: m.passbook_path || '',
      epicNumber: m.epic_number || '',
      acPartNumber: m.ac_part_number || '',
      voterCardPath: m.voter_card_path || '',
      voterCardBackPath: m.voter_card_back_path || '',
      panNumber: m.pan_number || '',
      panCardPath: m.pan_card_path || '',
      isLiterate: m.is_literate !== false,
      highestQualification: m.highest_qualification || '',
      employmentStatus: m.employment_status || '',
      caaStatus: m.caa_status || 'Not Applicable',
      caaNumber: m.caa_number || '',
      otherCardType: m.other_card_type || '',
      otherCardNumber: m.other_card_number || '',
      otherCardIssueDate: m.other_card_issue_date || '',
      tribunalStatus: m.tribunal_status || 'Not Applicable',
      tribunalDetails: m.tribunal_details || '',
      dbtReceiving: m.dbt_receiving || false,
      dbtSchemes: m.dbt_schemes || ''
    })),
    bankDetails: bankRes.rows.map(b => ({
      memberAadhaar: b.member_aadhaar,
      bankName: b.bank_name,
      accountNumber: b.account_number,
      ifsc: b.ifsc
    })),
    epicDetails: {
      epicNumber: e.epic_number || '',
      acPartNumber: e.ac_part_number || '',
      voterCardPath: e.voter_card_path || '',
      voterCardBackPath: e.voter_card_back_path || ''
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
        caaStatus: b.family?.caaStatus || 'Not Applicable',
        caaNumber: b.family?.caaNumber || '',
        otherCardType: b.family?.otherCardType || '',
        otherCardNumber: b.family?.otherCardNumber || '',
        otherCardIssueDate: b.family?.otherCardIssueDate || '',
        tribunalStatus: b.family?.tribunalStatus || 'Not Applicable',
        tribunalDetails: b.family?.tribunalDetails || '',
        dbtReceiving: b.family?.dbtReceiving || false,
        dbtSchemes: b.family?.dbtSchemes || '',
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
          size: size + 2,
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

      const getEmpChecks = (m: any, prefix: string, assets: any) => {
        const status = m?.employmentStatus || m?.employment_status;
        if (status) {
          const s = status.toLowerCase();
          return {
            govt: s === 'govt' || s === 'government',
            private: s === 'private',
            formal_self: s === 'formalself' || s === 'formal_self' || s === 'formal self-employed',
            part_time: s === 'parttime' || s === 'part_time' || s === 'part-time',
            informal_self: s === 'informalself' || s === 'informal_self' || s === 'informal self-employed',
            migrant: s === 'migrant',
            unemployed: s === 'unemployed',
            others: s === 'others' || s === 'other'
          };
        }
        
        // Fallback to assets
        return {
          govt: !!assets[`${prefix}Emp_Govt`],
          private: !!assets[`${prefix}Emp_Private`],
          formal_self: !!assets[`${prefix}Emp_FormalSelf`],
          part_time: !!assets[`${prefix}Emp_PartTime`],
          informal_self: !!assets[`${prefix}Emp_InformalSelf`],
          migrant: !!assets[`${prefix}Emp_Migrant`],
          unemployed: !!assets[`${prefix}Emp_Unemployed`],
          others: !!assets[`${prefix}Emp_Others`]
        };
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
      
      const mList = (appData.members || []).filter((m: any) => m.name?.trim() || m.aadhaar?.trim() || m.epicNumber?.trim());
      const familySize = appData.assets?.familySize !== undefined && appData.assets?.familySize !== '' ? appData.assets.familySize : String(mList.length);
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

      // 9. Name, DOB, Gender, Relation with Head of Family, Aadhaar (of all family members)
      // Draw HOF details next to HOF: under section 9
      drawTextVal(p1, appData.hofName, 250, 345.6, 9);
      drawTick(p1, 433.8, 347.5, true); // HOF Apply Tick

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
        drawTextVal(p2, hofBank.bankName, 280, 603.8, 9);
        drawTextVal(p2, hofBank.accountNumber, 260, 580.8, 9);
        drawTextVal(p2, hofBank.ifsc, 250, 557.8, 9);
      }
      
      // Each entry: [bankNameY, accountNumberY, ifscY]
      const memberBankYCoords = [
        [534.7, 511.9, 488.9],  // Member 1
        [465.8, 442.8, 419.8],  // Member 2
        [393.4, 366.7, 340.1],  // Member 3
        [313.4, 286.8, 260.4],  // Member 4
        [233.8, 207.1, 180.5],  // Member 5
      ];
      mList.forEach((m: any, idx: number) => {
        if (idx >= 5) return;
        const bankName = m.bankName || (banks.find((b: any) => b.memberAadhaar === m.aadhaar) || banks[idx + 1] || {}).bankName || '';
        const accountNumber = m.accountNumber || (banks.find((b: any) => b.memberAadhaar === m.aadhaar) || banks[idx + 1] || {}).accountNumber || '';
        const ifsc = m.ifsc || (banks.find((b: any) => b.memberAadhaar === m.aadhaar) || banks[idx + 1] || {}).ifsc || '';

        if (bankName || accountNumber || ifsc) {
          const [yName, yAcct, yIfsc] = memberBankYCoords[idx];
          drawTextVal(p2, bankName, 280, yName, 9);
          drawTextVal(p2, accountNumber, 280, yAcct, 9);
          drawTextVal(p2, ifsc, 250, yIfsc, 9);
        }
      });

      // EPIC Details
      if (appData.epicDetails) {
        drawTextVal(p2, appData.epicDetails.epicNumber, 280, 153.4, 9);
        drawTextVal(p2, appData.epicDetails.acPartNumber, 290, 140.2, 9);
      }

      // Member 1 & 2 Voter EPIC Details on Page 2
      if (mList.length > 0) {
        const m1 = mList[0];
        if (m1.epicNumber || m1.acPartNumber) {
          drawTextVal(p2, m1.epicNumber, 310, 113.5, 9);
          drawTextVal(p2, m1.acPartNumber, 310, 100.3, 9);
        }
      }
      if (mList.length > 1) {
        const m2 = mList[1];
        if (m2.epicNumber || m2.acPartNumber) {
          drawTextVal(p2, m2.epicNumber, 310, 73.7, 9);
          drawTextVal(p2, m2.acPartNumber, 310, 60.2, 9);
        }
      }

      // -------------------------------------------------------------
      // PAGE 3: EPIC continued, Category, Ration, Assets & Insurance HOF + Member 1-3
      // -------------------------------------------------------------
      const p3 = pages[2];
       // Member 3, 4 & 5 Voter EPIC Details on Page 3
      if (mList.length > 2) {
        const m3 = mList[2];
        if (m3.epicNumber || m3.acPartNumber) {
          drawTextVal(p3, m3.epicNumber, 310, 753.1, 9);
          drawTextVal(p3, m3.acPartNumber, 310, 739.9, 9);
        }
      }
      if (mList.length > 3) {
        const m4 = mList[3];
        if (m4.epicNumber || m4.acPartNumber) {
          drawTextVal(p3, m4.epicNumber, 310, 713.3, 9);
          drawTextVal(p3, m4.acPartNumber, 310, 700.1, 9);
        }
      }
      if (mList.length > 4) {
        const m5 = mList[4];
        if (m5.epicNumber || m5.acPartNumber) {
          drawTextVal(p3, m5.epicNumber, 310, 673.4, 9);
          drawTextVal(p3, m5.acPartNumber, 310, 660.0, 9);
        }
      }
      
      const cat = appData.hofCategory || '';
      drawTick(p3, 217.2, 621.6, cat.toUpperCase() === 'GENERAL' || cat.toUpperCase() === 'UR');
      drawTick(p3, 316.7, 621.6, cat.toUpperCase() === 'SC');
      drawTick(p3, 352.5, 621.6, cat.toUpperCase() === 'ST');
      drawTick(p3, 217.2, 608.4, cat.toUpperCase() === 'OBC');
 
      const hasRation = !!appData.householdId;
      drawTick(p3, 217.2, 562.6, hasRation);
      drawTick(p3, 258.9, 562.6, !hasRation);
      if (hasRation) {
        const householdIdStr = String(appData.householdId || '').toUpperCase();
        const isAAY = householdIdStr.includes('AAY');
        const isSPHH = householdIdStr.includes('SPHH');
        const isPHH = householdIdStr.includes('PHH') && !isSPHH;
        const isRKSY1 = householdIdStr.includes('RKSY1') || householdIdStr.includes('RKSY 1');
        const isRKSY2 = householdIdStr.includes('RKSY2') || householdIdStr.includes('RKSY 2');
        const isNonSub = !isAAY && !isPHH && !isSPHH && !isRKSY1 && !isRKSY2;
 
        drawTick(p3, 217.2, 542.2, isAAY);
        drawTick(p3, 265.0, 542.2, isPHH);
        drawTick(p3, 311.1, 542.2, isSPHH);
        drawTick(p3, 217.2, 529.0, isRKSY1);
        drawTick(p3, 265.0, 529.0, isRKSY2);
        drawTick(p3, 311.1, 529.0, isNonSub);
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
      const hofPan = appData.panDetails?.panNumber || '';
      const hasHofPan = !!hofPan;
      
      let hasAnyMemberPan = false;
      mList.forEach((m: any) => {
        if (m.panNumber) {
          hasAnyMemberPan = true;
        }
      });
      
      const isAnyPanAvailable = hasHofPan || hasAnyMemberPan;
      drawTick(p4, 217.2, 644.2, isAnyPanAvailable);
      drawTick(p4, 217.2, 629.0, !isAnyPanAvailable);
      
      if (hasHofPan) {
        drawTextVal(p4, appData.hofName, 240, 617.3, 9);
        drawTextVal(p4, hofPan, 250, 605.8, 9);
      }
      
      const memberPanCoords = [
        { nameY: 594.2, panY: 582.7 }, // Member 1
        { nameY: 569.5, panY: 556.3 }, // Member 2
        { nameY: 542.9, panY: 529.7 }, // Member 3
        { nameY: 516.5, panY: 503.0 }, // Member 4
        { nameY: 489.8, panY: 476.4 }  // Member 5
      ];
      
      mList.forEach((m: any, idx: number) => {
        if (idx >= 5) return;
        if (m.panNumber) {
          const coords = memberPanCoords[idx];
          drawTextVal(p4, m.name, 260, coords.nameY, 9);
          drawTextVal(p4, m.panNumber, 260, coords.panY, 9);
        }
      });
      
      // HOF Employment Status Checkboxes
      const hofEmp = getEmpChecks(null, 'hof', assets);
      drawTick(p4, 217.2, 451.4, hofEmp.govt);
      drawTick(p4, 316.3, 451.4, hofEmp.private);
      drawTick(p4, 272.7, 438.2, hofEmp.formal_self);
      drawTick(p4, 397.2, 424.8, hofEmp.part_time);
      drawTick(p4, 297.2, 411.6, hofEmp.informal_self);
      drawTick(p4, 397.4, 398.2, hofEmp.migrant);
      drawTick(p4, 306.1, 385.0, hofEmp.unemployed);
      drawTick(p4, 386.3, 385.0, hofEmp.others);

      // Member 1 Employment Status (if exists)
      if (mList.length > 0) {
        const m1Emp = getEmpChecks(mList[0], 'm1', assets);
        drawTick(p4, 217.2, 337.4, m1Emp.govt);
        drawTick(p4, 316.3, 337.4, m1Emp.private);
        drawTick(p4, 272.7, 324.2, m1Emp.formal_self);
        drawTick(p4, 397.2, 311.0, m1Emp.part_time);
        drawTick(p4, 297.2, 297.8, m1Emp.informal_self);
        drawTick(p4, 397.4, 284.4, m1Emp.migrant);
        drawTick(p4, 306.1, 271.2, m1Emp.unemployed);
        drawTick(p4, 386.3, 271.2, m1Emp.others);
      }

      // Member 2 Employment Status (if exists)
      if (mList.length > 1) {
        const m2Emp = getEmpChecks(mList[1], 'm2', assets);
        drawTick(p4, 217.2, 222.0, m2Emp.govt);
        drawTick(p4, 316.3, 222.0, m2Emp.private);
        drawTick(p4, 272.7, 208.8, m2Emp.formal_self);
        drawTick(p4, 397.2, 195.4, m2Emp.part_time);
        drawTick(p4, 297.2, 182.2, m2Emp.informal_self);
        drawTick(p4, 397.4, 168.7, m2Emp.migrant);
        drawTick(p4, 306.1, 155.5, m2Emp.unemployed);
        drawTick(p4, 386.3, 155.5, m2Emp.others);
      }

      // -------------------------------------------------------------
      // PAGE 5: Member 3-5 employment, Literate stats, HOF & Member 1-4 Literate Highest Qualification
      // -------------------------------------------------------------
      const p5 = pages[4];
      
      // Member 3 Employment Status (if exists)
      if (mList.length > 2) {
        const m3Emp = getEmpChecks(mList[2], 'm3', assets);
        drawTick(p5, 217.2, 766.8, m3Emp.govt);
        drawTick(p5, 316.3, 766.8, m3Emp.private);
        drawTick(p5, 272.7, 753.6, m3Emp.formal_self);
        drawTick(p5, 397.2, 740.2, m3Emp.part_time);
        drawTick(p5, 297.2, 727.0, m3Emp.informal_self);
        drawTick(p5, 397.4, 713.8, m3Emp.migrant);
        drawTick(p5, 306.1, 700.4, m3Emp.unemployed);
        drawTick(p5, 386.3, 700.4, m3Emp.others);
      }

      // Member 4 Employment Status (if exists)
      if (mList.length > 3) {
        const m4Emp = getEmpChecks(mList[3], 'm4', assets);
        drawTick(p5, 217.2, 666.0, m4Emp.govt);
        drawTick(p5, 316.3, 666.0, m4Emp.private);
        drawTick(p5, 272.7, 652.5, m4Emp.formal_self);
        drawTick(p5, 397.2, 639.0, m4Emp.part_time);
        drawTick(p5, 297.2, 626.4, m4Emp.informal_self);
        drawTick(p5, 397.4, 612.9, m4Emp.migrant);
        drawTick(p5, 306.1, 599.5, m4Emp.unemployed);
        drawTick(p5, 386.3, 599.5, m4Emp.others);
      }

      // Member 5 Employment Status (if exists)
      if (mList.length > 4) {
        const m5Emp = getEmpChecks(mList[4], 'm5', assets);
        drawTick(p5, 217.2, 550.2, m5Emp.govt);
        drawTick(p5, 316.3, 550.2, m5Emp.private);
        drawTick(p5, 272.7, 536.7, m5Emp.formal_self);
        drawTick(p5, 397.2, 523.3, m5Emp.part_time);
        drawTick(p5, 297.2, 510.7, m5Emp.informal_self);
        drawTick(p5, 397.4, 497.2, m5Emp.migrant);
        drawTick(p5, 306.1, 483.7, m5Emp.unemployed);
        drawTick(p5, 386.3, 483.7, m5Emp.others);
      }

      const eduList = appData.education || [];
      
      // Compute HOF literacy
      const hofEdu = eduList.find((e: any) => e.memberAadhaar === appData.hofAadhaar) || eduList[0];
      const hofIsLit = hofEdu ? hofEdu.isLiterate !== false : true;
      const hofQual = hofEdu ? hofEdu.highestQualification : 'Graduate';
      
      // Compute member literacy details list
      const memberEduList = mList.map((m: any) => {
        if (m.isLiterate !== undefined) {
          return {
            isLiterate: m.isLiterate !== false,
            highestQualification: m.highestQualification || ''
          };
        }
        const me = eduList.find((e: any) => e.memberAadhaar === m.aadhaar);
        if (me) {
          return {
            isLiterate: me.isLiterate !== false,
            highestQualification: me.highestQualification || ''
          };
        }
        return {
          isLiterate: true,
          highestQualification: 'Primary'
        };
      });

      let totalLiterate = hofIsLit ? 1 : 0;
      let totalIlliterate = hofIsLit ? 0 : 1;
      memberEduList.forEach((me: any) => {
        if (me.isLiterate) {
          totalLiterate++;
        } else {
          totalIlliterate++;
        }
      });

      drawTextVal(p5, totalLiterate, 220, 500.2, 9);
      drawTextVal(p5, totalIlliterate, 220, 487.0, 9);

      // HOF Literacy
      drawTick(p5, 217.2, 449.0, hofIsLit);
      drawTick(p5, 217.2, 433.9, !hofIsLit);
      if (hofIsLit) {
        drawTextVal(p5, hofQual, 320, 422.2, 9);
      }

      mList.forEach((m: any, idx: number) => {
        if (idx >= 4) return;
        const me = memberEduList[idx];
        const isLit = me.isLiterate;
        const qual = me.highestQualification;
        
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
      // PAGE 6: Member 5 Literate Highest Qualification, Total annual income & CAA Status
      // -------------------------------------------------------------
      const p6 = pages[5];
      if (mList.length > 4) {
        const me = memberEduList[4];
        const isLit = me.isLiterate;
        const qual = me.highestQualification;
        
        drawTick(p6, 217.2, 764.9, isLit);
        drawTick(p6, 217.2, 749.8, !isLit);
        if (isLit) {
          drawTextVal(p6, qual, 320, 738.0, 9);
        }
      }
      
      // Constitutional Post
      drawTick(p6, 217.2, 722.6, appData.assets?.constitutionalPost_Yes === true);
      drawTick(p6, 261.4, 722.6, appData.assets?.constitutionalPost_No === true || appData.assets?.constitutionalPost_Yes === false);
      if (appData.assets?.constitutionalPost_Yes) {
        drawTextVal(p6, appData.assets?.constitutionalPost_Member || '', 270, 709.2, 9);
      }

      // Government Pensioner
      drawTick(p6, 217.2, 637.9, appData.assets?.govPensioner_Yes === true);
      drawTick(p6, 261.4, 637.9, appData.assets?.govPensioner_No === true || appData.assets?.govPensioner_Yes === false);
      if (appData.assets?.govPensioner_Yes) {
        drawTextVal(p6, appData.assets?.govPensioner_Member || '', 280, 624.5, 9);
      }

      // GST Registered
      drawTick(p6, 217.2, 574.6, appData.assets?.gstRegistered_Yes === true);
      drawTick(p6, 261.4, 574.6, appData.assets?.gstRegistered_No === true || appData.assets?.gstRegistered_Yes === false);
      if (appData.assets?.gstRegistered_Yes) {
        drawTextVal(p6, appData.assets?.gstin || '', 485, 576.2, 9);
      }

      // Annual Family Income
      const annualIncomeVal = appData.assets?.annualIncome ? String(appData.assets.annualIncome) : '';
      drawTextVal(p6, annualIncomeVal, 300, 550.8, 9);

      // CAA Application Status (HOF & Members 1-5)
      const caaProfiles = [
        { status: appData.caaStatus, number: appData.caaNumber },
        ...mList.map((m: any) => ({ status: m.caaStatus, number: m.caaNumber }))
      ];
      const caaY = [
        [483.6, 468.5, 453.4], // HOF
        [415.2, 400.1, 385.0], // Member 1
        [345.1, 330.0, 314.9], // Member 2
        [275.0, 259.9, 244.8], // Member 3
        [206.6, 191.5, 176.4], // Member 4
        [123.4, 108.2, 93.1]   // Member 5
      ];
      for (let i = 0; i < 6; i++) {
        const profile = caaProfiles[i] || { status: 'Not Applicable', number: '' };
        const status = profile.status || 'Not Applicable';
        const num = profile.number || '';
        const yCoords = caaY[i];

        if (status === 'Applied') {
          drawTick(p6, 217.2, yCoords[1], true);
          drawTextVal(p6, num, 380, yCoords[1], 9);
        } else if (status === 'Issued') {
          drawTick(p6, 217.2, yCoords[2], true);
          drawTextVal(p6, num, 380, yCoords[2], 9);
        } else {
          drawTick(p6, 217.2, yCoords[0], true);
        }
      }

      // -------------------------------------------------------------
      // PAGE 7: Credit Cards & Tribunal Pending Cases
      // -------------------------------------------------------------
      const p7 = pages[6];

      // Credit Card Details (HOF & Members 1-5)
      const ccProfiles = [
        { type: appData.otherCardType, number: appData.otherCardNumber, date: appData.otherCardIssueDate },
        ...mList.map((m: any) => ({ type: m.otherCardType, number: m.otherCardNumber, date: m.otherCardIssueDate }))
      ];
      const ccTypeY = [768.2, 716.9, 665.3, 613.9, 562.6, 511.2];
      const ccNumberY = [755.0, 703.7, 652.1, 600.7, 549.4, 498.0];
      const ccDateY = [741.6, 690.2, 638.9, 587.5, 536.2, 484.8];

      for (let i = 0; i < 6; i++) {
        const profile = ccProfiles[i];
        if (profile && (profile.type || profile.number || profile.date)) {
          const typeX = i === 0 ? 250 : 270;
          if (profile.type) drawTextVal(p7, profile.type, typeX, ccTypeY[i], 9);
          if (profile.number) drawTextVal(p7, profile.number, 250, ccNumberY[i], 9);
          if (profile.date) drawTextVal(p7, profile.date, 275, ccDateY[i], 9);
        }
      }

      // Tribunal Pending Cases (HOF & Members 1-5)
      const tribunalProfiles = [
        { status: appData.tribunalStatus, details: appData.tribunalDetails },
        ...mList.map((m: any) => ({ status: m.tribunalStatus, details: m.tribunalDetails }))
      ];
      const tribNaY = [444.5, 376.1, 306.0, 235.9, 165.8, 95.8];
      const tribNoY = [429.4, 361.0, 290.9, 220.8, 150.7, 80.6];
      const tribYesY = [414.2, 345.8, 275.8, 205.7, 135.6, 65.5];

      for (let i = 0; i < 6; i++) {
        const profile = tribunalProfiles[i] || { status: 'Not Applicable', details: '' };
        const status = profile.status || 'Not Applicable';
        const details = profile.details || '';

        if (status === 'No') {
          drawTick(p7, 217.2, tribNoY[i], true);
        } else if (status === 'Yes') {
          drawTick(p7, 217.2, tribYesY[i], true);
          if (details) drawTextVal(p7, details, 350, tribYesY[i], 9);
        } else {
          drawTick(p7, 217.2, tribNaY[i], true);
        }
      }

      // -------------------------------------------------------------
      // PAGE 8: Children Education
      // -------------------------------------------------------------
      const p8 = pages[7];
      const kids = appData.children || [];
      kids.forEach((c: any, idx: number) => {
        if (idx >= 4) return;
        if (!c.name && !c.schoolName) return; // Only draw if the child exists
        
        const yBase = 666.0 - idx * 153.5;
        
        // Draw Child details
        drawTextVal(p8, c.name, 300, yBase, 9);
        drawTextVal(p8, c.className, 260, yBase - 13.2, 9);
        drawTextVal(p8, c.schoolName, 300, yBase - 26.6, 9);
        
        // Draw School Type ticks
        const schoolType = (c.schoolType || '').toLowerCase();
        const isGovt = schoolType.includes('govt') || schoolType.includes('government') || schoolType.includes('aided') || schoolType.includes('sponsored');
        const isPrivate = schoolType.includes('private');
        const isRecMadrasah = schoolType.includes('recognized madrasah') || schoolType.includes('rec') && schoolType.includes('madrasah');
        const isOtherMadrasah = schoolType.includes('other madrasah') || schoolType.includes('other') && schoolType.includes('madrasah') && !isRecMadrasah;
        const isOthers = !isGovt && !isPrivate && !isRecMadrasah && !isOtherMadrasah && schoolType.length > 0;
        
        drawTick(p8, 217.2, yBase - 53.0, isGovt);
        drawTick(p8, 217.2, yBase - 68.2, isPrivate);
        drawTick(p8, 217.2, yBase - 83.3, isRecMadrasah);
        drawTick(p8, 217.2, yBase - 98.4, isOtherMadrasah);
        drawTick(p8, 217.2, yBase - 113.5, isOthers);
      });

      // -------------------------------------------------------------
      // PAGE 9 & 10: Checkboxes & Lists (Vaccination & DBT)
      // -------------------------------------------------------------
      const p9 = pages[8];
      
      // Children Vaccination Checkboxes (Page 8 for Child 1 Yes, Page 9 for Child 1 No & Child 2-4)
      if (kids.length > 0) {
        const isVac = kids[0].isVaccinated === true;
        drawTick(p8, 217.2, 63.1, isVac);
        drawTick(p9, 217.2, 764.9, !isVac);
        if (isVac) {
          drawTextVal(p8, kids[0].vaccinationCardId, 520, 63.1, 9);
        }
      }
      if (kids.length > 1) {
        const isVac = kids[1].isVaccinated === true;
        drawTick(p9, 217.2, 723.1, isVac);
        drawTick(p9, 217.2, 708.0, !isVac);
        if (isVac) {
          drawTextVal(p9, kids[1].vaccinationCardId, 520, 723.1, 9);
        }
      }
      if (kids.length > 2) {
        const isVac = kids[2].isVaccinated === true;
        drawTick(p9, 217.2, 666.2, isVac);
        drawTick(p9, 217.2, 651.1, !isVac);
        if (isVac) {
          drawTextVal(p9, kids[2].vaccinationCardId, 520, 666.2, 9);
        }
      }
      if (kids.length > 3) {
        const isVac = kids[3].isVaccinated === true;
        drawTick(p9, 217.2, 609.6, isVac);
        drawTick(p9, 217.2, 594.5, !isVac);
        if (isVac) {
          drawTextVal(p9, kids[3].vaccinationCardId, 520, 609.6, 9);
        }
      }

      // DBT Welfare Schemes (HOF & Members 1-5)
      const dbtProfiles = [
        { receiving: appData.dbtReceiving === true || appData.governmentSchemes?.dbtReceiving === true, schemes: appData.dbtSchemes || appData.governmentSchemes?.schemesList?.join(', ') || '' },
        ...mList.map((m: any) => ({ receiving: m.dbtReceiving === true, schemes: m.dbtSchemes || '' }))
      ];

      const dbtYesCheckCoords = [
        { page: p9, x: 242.7, y: 540.2 }, // HOF Page 9
        { page: p9, x: 263.9, y: 396.7 }, // Member 1 Page 9
        { page: p9, x: 263.9, y: 253.0 }, // Member 2 Page 9
        { page: p9, x: 263.9, y: 96.0 },  // Member 3 Page 9
        { page: pages[9], x: 263.9, y: 649.7 }, // Member 4 Page 10
        { page: pages[9], x: 263.9, y: 505.9 }  // Member 5 Page 10
      ];
      const dbtNoCheckCoords = [
        { page: p9, x: 286.9, y: 540.2 }, // HOF Page 9
        { page: p9, x: 308.0, y: 396.7 }, // Member 1 Page 9
        { page: p9, x: 308.0, y: 253.0 }, // Member 2 Page 9
        { page: p9, x: 308.0, y: 96.0 },  // Member 3 Page 9
        { page: pages[9], x: 308.0, y: 649.7 }, // Member 4 Page 10
        { page: pages[9], x: 308.0, y: 505.9 }  // Member 5 Page 10
      ];
      const dbtSchemesY = [
        [487.0, 471.4, 455.8, 440.2, 424.6], // HOF Page 9
        [342.2, 326.6, 311.0, 295.4, 279.8], // Member 1 Page 9
        [198.7, 183.1, 167.5, 151.9, 136.3], // Member 2 Page 9
        [739.0, 723.4, 707.8, 692.2, 676.6], // Member 3 Page 10
        [595.4, 579.8, 564.2, 548.4, 532.8], // Member 4 Page 10
        [451.7, 436.1, 420.5, 404.9, 389.3]  // Member 5 Page 10
      ];
      const dbtSchemesPages = [ p9, p9, p9, pages[9], pages[9], pages[9] ];

      for (let i = 0; i < 6; i++) {
        const profile = dbtProfiles[i] || { receiving: false, schemes: '' };
        const receiving = profile.receiving;
        const schemes = profile.schemes || '';

        const yesCoord = dbtYesCheckCoords[i];
        const noCoord = dbtNoCheckCoords[i];

        drawTick(yesCoord.page, yesCoord.x, yesCoord.y, receiving);
        drawTick(noCoord.page, noCoord.x, noCoord.y, !receiving);

        if (receiving && schemes) {
          const list = schemes.split(',').map(s => s.trim()).filter(Boolean);
          const yBases = dbtSchemesY[i];
          const pageTarget = dbtSchemesPages[i];
          list.forEach((sName, sIdx) => {
            if (sIdx < 5) {
              drawTextVal(pageTarget, sName, 250, yBases[sIdx], 9);
            }
          });
        }
      }

      // -------------------------------------------------------------
      // PAGE 10: Consent & Signature
      // -------------------------------------------------------------
      const p10 = pages[9];
      drawTick(p10, 217.2, 309.8, true);

      let signatureStr = '';
      if (appData.signature) {
        if (typeof appData.signature === 'string') {
          signatureStr = appData.signature;
        } else if (typeof appData.signature === 'object' && appData.signature.signatureData) {
          signatureStr = appData.signature.signatureData;
        }
      }

      if (signatureStr && signatureStr.startsWith('data:image/png;base64,')) {
        try {
          const sigBase64 = signatureStr.replace('data:image/png;base64,', '');
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
      let signatureStr2 = '';
      if (appData.signature) {
        if (typeof appData.signature === 'string') {
          signatureStr2 = appData.signature;
        } else if (typeof appData.signature === 'object' && appData.signature.signatureData) {
          signatureStr2 = appData.signature.signatureData;
        }
      }

      if (signatureStr2 && signatureStr2.startsWith('data:image/png;base64,')) {
        try {
          const sigBase64 = signatureStr2.replace('data:image/png;base64,', '');
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
