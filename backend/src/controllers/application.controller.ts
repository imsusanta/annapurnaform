import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { query, isUsingMockDb, getMockStore } from '../db';
import ExcelJS from 'exceljs';

// Helper to generate Application ID: APN-YYYYMMDD-XXXX
async function generateApplicationId(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  
  if (isUsingMockDb()) {
    const count = getMockStore().applications.length + 1;
    const padded = count.toString().padStart(4, '0');
    return `APN-${dateStr}-${padded}`;
  }

  // PostgreSQL logic: Count applications created today
  const res = await query(
    "SELECT COUNT(*) FROM applications WHERE application_id LIKE $1",
    [`APN-${dateStr}-%`]
  );
  const count = parseInt(res.rows[0].count) + 1;
  const padded = count.toString().padStart(4, '0');
  return `APN-${dateStr}-${padded}`;
}

// 1. Create a New Application (Initial Draft)
export const createApplication = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || null;
    const appId = await generateApplicationId();

    if (isUsingMockDb()) {
      const app = {
        id: getMockStore().applications.length + 1,
        user_id: userId,
        application_id: appId,
        status: 'draft',
        current_step: 1,
        ocr_confidence: 0,
        created_at: new Date(),
        updated_at: new Date(),
        // Mock nested storage
        families: {},
        members: [],
        bank_details: [],
        epic_details: {},
        pan_details: {},
        assets: {},
        education: [],
        children: [],
        government_schemes: {},
        signatures: {}
      };
      getMockStore().applications.push(app);
      return res.status(201).json(app);
    }

    // PostgreSQL Transaction
    const appRes = await query(
      `INSERT INTO applications (user_id, application_id, status, current_step, ocr_confidence) 
       VALUES ($1, $2, 'draft', 1, 0.0) RETURNING *`,
      [userId, appId]
    );
    const newApp = appRes.rows[0];

    // Seed empty default rows for 1-to-1 tables
    await query(`INSERT INTO families (application_id) VALUES ($1)`, [newApp.id]);
    await query(`INSERT INTO epic_details (application_id) VALUES ($1)`, [newApp.id]);
    await query(`INSERT INTO pan_details (application_id) VALUES ($1)`, [newApp.id]);
    await query(`INSERT INTO assets (application_id) VALUES ($1)`, [newApp.id]);
    await query(`INSERT INTO government_schemes (application_id) VALUES ($1)`, [newApp.id]);
    await query(`INSERT INTO signatures (application_id) VALUES ($1)`, [newApp.id]);

    return res.status(201).json(newApp);
  } catch (error: any) {
    console.error('Error creating application:', error);
    return res.status(500).json({ error: 'Failed to initialize application' });
  }
};

// 2. Save Application Step Data (Draft / Submission)
export const saveApplication = async (req: AuthenticatedRequest, res: Response) => {
  const appId = parseInt(req.params.id);
  const data = req.body; // Full application JSON structure

  try {
    if (isUsingMockDb()) {
      let app = getMockStore().applications.find(a => a.id === appId);
      if (app && app.user_id && req.user?.role !== 'admin' && app.user_id !== req.user?.id) {
        return res.status(403).json({ error: 'Access denied: You do not own this application draft' });
      }
      
      if (!app) {
        // Auto-seed/create the application to avoid 404s on save
        app = {
          id: appId,
          user_id: req.user?.id || null,
          application_id: `APN-DEV-${appId}`,
          status: 'draft',
          current_step: 1,
          ocr_confidence: 0,
          created_at: new Date(),
          updated_at: new Date(),
          families: {},
          members: [],
          bank_details: [],
          epic_details: {},
          pan_details: {},
          assets: {},
          education: [],
          children: [],
          government_schemes: {},
          signatures: {}
        };
        getMockStore().applications.push(app);
      }

      // Deep copy input fields into the mock store application object
      app.status = data.status || app.status;
      app.current_step = data.current_step || app.current_step;
      app.ocr_confidence = data.ocr_confidence || app.ocr_confidence;
      app.updated_at = new Date();

      if (data.family) app.families = { ...app.families, ...data.family };
      if (data.members) app.members = data.members;
      if (data.bankDetails) app.bank_details = data.bankDetails;
      if (data.epicDetails) app.epic_details = { ...app.epic_details, ...data.epicDetails };
      if (data.panDetails) app.pan_details = { ...app.pan_details, ...data.panDetails };
      if (data.assets) app.assets = { ...app.assets, ...data.assets };
      if (data.education) app.education = data.education;
      if (data.children) app.children = data.children;
      if (data.governmentSchemes) app.government_schemes = { ...app.government_schemes, ...data.governmentSchemes };
      if (data.signature) app.signatures = { ...app.signatures, ...data.signature };

      return res.status(200).json({ message: 'Application saved successfully (Mock DB)', application: app });
    }

    // PostgreSQL validation check first
    if (req.user?.role !== 'admin') {
      const checkRes = await query('SELECT user_id FROM applications WHERE id = $1', [appId]);
      if (checkRes.rows.length > 0) {
        const appOwner = checkRes.rows[0].user_id;
        if (appOwner && appOwner !== req.user?.id) {
          return res.status(403).json({ error: 'Access denied: You do not own this application draft' });
        }
      }
    }

    // PostgreSQL - Perform updates inside transactions
    await query('BEGIN');

    // Update main application table
    await query(
      `UPDATE applications SET status = $1, current_step = $2, ocr_confidence = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
      [data.status || 'draft', data.current_step || 1, data.ocr_confidence || 0.0, appId]
    );

    // Save step 1: Head of Family Info
    if (data.family) {
      const f = data.family;
      await query(
        `UPDATE families SET 
          hof_name = $1, hof_dob = $2, hof_gender = $3, hof_aadhaar = $4, hof_mobile = $5, 
          hof_address = $6, hof_category = $7, household_id = $8,
          aadhaar_front_path = $9, aadhaar_back_path = $10, ration_card_path = $11,
          caste_certificate_path = $12
         WHERE application_id = $13`,
        [f.hofName, f.hofDob || null, f.hofGender, f.hofAadhaar, f.hofMobile, f.hofAddress, f.hofCategory, f.householdId, f.aadhaarFrontPath, f.aadhaarBackPath, f.rationCardPath, f.casteCertificatePath || null, appId]
      );
    }

    // Save step 2: Members (Delete existing and rebuild)
    if (data.members) {
      await query('DELETE FROM members WHERE application_id = $1', [appId]);
      for (const m of data.members) {
        if (m.name) {
          await query(
            `INSERT INTO members (application_id, name, dob, gender, relation, aadhaar, aadhaar_path) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [appId, m.name, m.dob || null, m.gender, m.relation, m.aadhaar, m.aadhaarPath]
          );
        }
      }
    }

    // Save step 3: Bank Details (Delete existing and rebuild)
    if (data.bankDetails) {
      await query('DELETE FROM bank_details WHERE application_id = $1', [appId]);
      for (const b of data.bankDetails) {
        if (b.bankName || b.accountNumber) {
          await query(
            `INSERT INTO bank_details (application_id, member_aadhaar, bank_name, account_number, ifsc, passbook_path) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [appId, b.memberAadhaar, b.bankName, b.accountNumber, b.ifsc, b.passbookPath]
          );
        }
      }
    }

    // Save step 4: EPIC Details
    if (data.epicDetails) {
      const e = data.epicDetails;
      await query(
        `UPDATE epic_details SET epic_number = $1, ac_part_number = $2, voter_card_path = $3 WHERE application_id = $4`,
        [e.epicNumber, e.acPartNumber, e.voterCardPath, appId]
      );
    }

    // Save step 5: PAN Details
    if (data.panDetails) {
      const p = data.panDetails;
      await query(
        `UPDATE pan_details SET pan_number = $1, pan_holder_name = $2, pan_card_path = $3 WHERE application_id = $4`,
        [p.panNumber, p.panHolderName || '', p.panCardPath, appId]
      );
    }

    // Save step 7: Assets
    if (data.assets) {
      const a = data.assets;
      const standardKeys = ['puccaRooms', 'landOwnership', 'landSize', 'vehicleOwnership', 'vehicleNumber', 'vehicleModel', 'healthInsuranceType', 'premium', 'sumAssured'];
      const extraFields: any = {};
      Object.keys(a).forEach(k => {
        if (!standardKeys.includes(k)) {
          extraFields[k] = a[k];
        }
      });
      const extraFieldsStr = JSON.stringify(extraFields);

      await query(
        `UPDATE assets SET pucca_rooms = $1, land_ownership = $2, land_size = $3, vehicle_ownership = $4, 
          vehicle_number = $5, vehicle_model = $6, health_insurance_type = $7, premium = $8, sum_assured = $9,
          extra_fields = $10 
         WHERE application_id = $11`,
        [a.puccaRooms || false, a.landOwnership || false, a.landSize || '', a.vehicleOwnership || false, a.vehicleNumber || '', a.vehicleModel || '', a.healthInsuranceType || '', a.premium || 0.0, a.sumAssured || 0.0, extraFieldsStr, appId]
      );
    }

    // Save step 9: Education (Delete and rebuild)
    if (data.education) {
      await query('DELETE FROM education WHERE application_id = $1', [appId]);
      for (const edu of data.education) {
        await query(
          `INSERT INTO education (application_id, member_aadhaar, is_literate, highest_qualification) 
           VALUES ($1, $2, $3, $4)`,
          [appId, edu.memberAadhaar, edu.isLiterate !== false, edu.highestQualification]
        );
      }
    }

    // Save step 10: Children (Delete and rebuild)
    if (data.children) {
      await query('DELETE FROM children WHERE application_id = $1', [appId]);
      for (const c of data.children) {
        if (c.name) {
          await query(
            `INSERT INTO children (application_id, name, class_name, school_name, school_type, is_vaccinated, vaccination_card_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [appId, c.name, c.className, c.schoolName, c.schoolType, c.isVaccinated || false, c.vaccinationCardId]
          );
        }
      }
    }

    // Save step 11: Government Schemes
    if (data.governmentSchemes) {
      const gs = data.governmentSchemes;
      await query(
        `UPDATE government_schemes SET schemes_list = $1, dbt_receiving = $2 WHERE application_id = $3`,
        [gs.schemesList || [], gs.dbtReceiving || false, appId]
      );
    }

    // Save step 12: Signature
    if (data.signature) {
      const s = data.signature;
      await query(
        `UPDATE signatures SET signature_data = $1, signature_type = $2 WHERE application_id = $3`,
        [s.signatureData, s.signatureType || 'drawn', appId]
      );
    }

    await query('COMMIT');
    return res.status(200).json({ message: 'Application saved successfully' });
  } catch (error: any) {
    await query('ROLLBACK');
    console.error('Error saving application:', error);
    return res.status(500).json({ error: 'Failed to save application' });
  }
};

// 3. Fetch Application Full Details (12-step Form Data)
export const getApplication = async (req: AuthenticatedRequest, res: Response) => {
  const appId = parseInt(req.params.id);

  try {
    if (isUsingMockDb()) {
      let app = getMockStore().applications.find(a => a.id === appId);
      if (app && app.user_id && req.user?.role !== 'admin' && app.user_id !== req.user?.id) {
        return res.status(403).json({ error: 'Access denied: You do not own this application draft' });
      }

      if (!app) {
        // Auto-seed/create the application to avoid 404s on refresh
        app = {
          id: appId,
          user_id: req.user?.id || null,
          application_id: `APN-DEV-${appId}`,
          status: 'draft',
          current_step: 1,
          ocr_confidence: 0,
          created_at: new Date(),
          updated_at: new Date(),
          families: {},
          members: [],
          bank_details: [],
          epic_details: {},
          pan_details: {},
          assets: {},
          education: [],
          children: [],
          government_schemes: {},
          signatures: {}
        };
        getMockStore().applications.push(app);
      }
      
      // Format mock DB data to camelCase to match Postgres API output structure
      return res.status(200).json({
        id: app.id,
        application_id: app.application_id,
        status: app.status,
        current_step: app.current_step,
        ocr_confidence: app.ocr_confidence,
        created_at: app.created_at,
        updated_at: app.updated_at,
        family: {
          hofName: app.families?.hofName || '',
          hofDob: app.families?.hofDob || '',
          hofGender: app.families?.hofGender || '',
          hofAadhaar: app.families?.hofAadhaar || '',
          hofMobile: app.families?.hofMobile || '',
          hofAddress: app.families?.hofAddress || '',
          hofCategory: app.families?.hofCategory || '',
          householdId: app.families?.householdId || '',
          aadhaarFrontPath: app.families?.aadhaarFrontPath || '',
          aadhaarBackPath: app.families?.aadhaarBackPath || '',
          rationCardPath: app.families?.rationCardPath || ''
        },
        members: app.members || [],
        bankDetails: app.bank_details || [],
        epicDetails: {
          epicNumber: app.epic_details?.epicNumber || '',
          acPartNumber: app.epic_details?.acPartNumber || '',
          voterCardPath: app.epic_details?.voterCardPath || ''
        },
        panDetails: {
          panNumber: app.pan_details?.panNumber || '',
          panHolderName: app.pan_details?.panHolderName || '',
          panCardPath: app.pan_details?.panCardPath || ''
        },
        assets: {
          ...(app.assets || {}),
          puccaRooms: app.assets?.puccaRooms || false,
          landOwnership: app.assets?.landOwnership || false,
          landSize: app.assets?.landSize || '',
          vehicleOwnership: app.assets?.vehicleOwnership || false,
          vehicleNumber: app.assets?.vehicleNumber || '',
          vehicleModel: app.assets?.vehicleModel || '',
          healthInsuranceType: app.assets?.healthInsuranceType || '',
          premium: app.assets?.premium || '',
          sumAssured: app.assets?.sumAssured || ''
        },
        education: app.education || [],
        children: app.children || [],
        governmentSchemes: {
          schemesList: app.government_schemes?.schemesList || [],
          dbtReceiving: app.government_schemes?.dbtReceiving || false
        },
        signature: {
          signatureData: app.signatures?.signatureData || '',
          signatureType: app.signatures?.signatureType || 'drawn'
        }
      });
    }

    // Fetch from Postgres
    const appRes = await query('SELECT * FROM applications WHERE id = $1', [appId]);
    if (appRes.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }
    const app = appRes.rows[0];

    // Enforce operator privacy
    if (app.user_id && req.user?.role !== 'admin' && app.user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied: You do not own this application draft' });
    }

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

    const familyData = familyRes.rows[0] || {};
    const formattedFamily = {
      hofName: familyData.hof_name,
      hofDob: familyData.hof_dob ? familyData.hof_dob.toISOString().split('T')[0] : '',
      hofGender: familyData.hof_gender,
      hofAadhaar: familyData.hof_aadhaar,
      hofMobile: familyData.hof_mobile,
      hofAddress: familyData.hof_address,
      hofCategory: familyData.hof_category,
      householdId: familyData.household_id,
      aadhaarFrontPath: familyData.aadhaar_front_path,
      aadhaarBackPath: familyData.aadhaar_back_path,
      rationCardPath: familyData.ration_card_path,
      casteCertificatePath: familyData.caste_certificate_path || ''
    };

    const formattedMembers = membersRes.rows.map(m => ({
      name: m.name,
      dob: m.dob ? m.dob.toISOString().split('T')[0] : '',
      gender: m.gender,
      relation: m.relation,
      aadhaar: m.aadhaar,
      aadhaarPath: m.aadhaar_path
    }));

    const formattedBank = bankRes.rows.map(b => ({
      memberAadhaar: b.member_aadhaar,
      bankName: b.bank_name,
      accountNumber: b.account_number,
      ifsc: b.ifsc,
      passbookPath: b.passbook_path
    }));

    const epicData = epicRes.rows[0] || {};
    const formattedEpic = {
      epicNumber: epicData.epic_number,
      acPartNumber: epicData.ac_part_number,
      voterCardPath: epicData.voter_card_path
    };

    const panData = panRes.rows[0] || {};
    const formattedPan = {
      panNumber: panData.pan_number,
      panCardPath: panData.pan_card_path
    };

    const assetsData = assetsRes.rows[0] || {};
    const extraFields = assetsData.extra_fields ? JSON.parse(assetsData.extra_fields) : {};
    const formattedAssets = {
      ...extraFields,
      puccaRooms: assetsData.pucca_rooms,
      landOwnership: assetsData.land_ownership,
      landSize: assetsData.land_size,
      vehicleOwnership: assetsData.vehicle_ownership,
      vehicleNumber: assetsData.vehicle_number,
      vehicleModel: assetsData.vehicle_model,
      healthInsuranceType: assetsData.health_insurance_type,
      premium: assetsData.premium,
      sumAssured: assetsData.sum_assured
    };

    const formattedEdu = eduRes.rows.map(e => ({
      memberAadhaar: e.member_aadhaar,
      isLiterate: e.is_literate,
      highestQualification: e.highest_qualification
    }));

    const formattedChildren = childrenRes.rows.map(c => ({
      name: c.name,
      className: c.class_name,
      schoolName: c.school_name,
      schoolType: c.school_type,
      isVaccinated: c.is_vaccinated,
      vaccinationCardId: c.vaccination_card_id
    }));

    const schemesData = schemesRes.rows[0] || {};
    const formattedSchemes = {
      schemesList: schemesData.schemes_list || [],
      dbtReceiving: schemesData.dbt_receiving
    };

    const sigData = sigRes.rows[0] || {};
    const formattedSig = {
      signatureData: sigData.signature_data,
      signatureType: sigData.signature_type
    };

    return res.status(200).json({
      id: app.id,
      application_id: app.application_id,
      status: app.status,
      current_step: app.current_step,
      ocr_confidence: parseFloat(app.ocr_confidence),
      created_at: app.created_at,
      updated_at: app.updated_at,
      family: formattedFamily,
      members: formattedMembers,
      bankDetails: formattedBank,
      epicDetails: formattedEpic,
      panDetails: formattedPan,
      assets: formattedAssets,
      education: formattedEdu,
      children: formattedChildren,
      governmentSchemes: formattedSchemes,
      signature: formattedSig
    });
  } catch (error: any) {
    console.error('Error fetching application:', error);
    return res.status(500).json({ error: 'Failed to fetch application details' });
  }
};

// 4. Search and List Applications (Admin and Dashboard)
export const listApplications = async (req: AuthenticatedRequest, res: Response) => {
  const { query: searchQuery, status } = req.query;
  const isOperatorOnly = req.user?.role !== 'admin';
  const userId = req.user?.id;

  try {
    let applicationsList: any[] = [];

    if (isUsingMockDb()) {
      let filteredApps = getMockStore().applications;
      if (isOperatorOnly) {
        filteredApps = filteredApps.filter(a => a.user_id === userId);
      }
      applicationsList = filteredApps.map(a => ({
        id: a.id,
        application_id: a.application_id,
        hof_name: a.families?.hofName || a.families?.hof_name || 'N/A',
        hof_aadhaar: a.families?.hofAadhaar || a.families?.hof_aadhaar || 'N/A',
        hof_mobile: a.families?.hofMobile || a.families?.hof_mobile || 'N/A',
        status: a.status,
        updated_at: a.updated_at
      }));
    } else {
      let sql = `
        SELECT a.id, a.application_id, f.hof_name, f.hof_aadhaar, f.hof_mobile, a.status, a.updated_at
        FROM applications a
        LEFT JOIN families f ON f.application_id = a.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (isOperatorOnly) {
        params.push(userId);
        sql += ` AND a.user_id = $${params.length}`;
      }

      if (status) {
        params.push(status);
        sql += ` AND a.status = $${params.length}`;
      }

      if (searchQuery) {
        params.push(`%${searchQuery}%`);
        sql += ` AND (
          a.application_id ILIKE $${params.length} 
          OR f.hof_name ILIKE $${params.length} 
          OR f.hof_aadhaar ILIKE $${params.length} 
          OR f.hof_mobile ILIKE $${params.length}
        )`;
      }

      sql += ` ORDER BY a.updated_at DESC`;
      const dbRes = await query(sql, params);
      applicationsList = dbRes.rows;
    }

    // Filter in memory for Mock DB
    if (isUsingMockDb()) {
      if (status) {
        applicationsList = applicationsList.filter(a => a.status === status);
      }
      if (searchQuery) {
        const q = (searchQuery as string).toLowerCase();
        applicationsList = applicationsList.filter(a => 
          a.application_id.toLowerCase().includes(q) ||
          a.hof_name.toLowerCase().includes(q) ||
          a.hof_aadhaar.includes(q) ||
          a.hof_mobile.includes(q)
        );
      }
    }

    return res.status(200).json(applicationsList);
  } catch (error: any) {
    console.error('Error listing applications:', error);
    return res.status(500).json({ error: 'Failed to retrieve applications' });
  }
};

// 5. Export to Excel Spreadsheet
export const exportApplicationsExcel = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let rows: any[] = [];
    const isOperatorOnly = req.user?.role !== 'admin';
    const userId = req.user?.id;

    if (isUsingMockDb()) {
      rows = getMockStore().applications;
      if (isOperatorOnly) {
        rows = rows.filter(a => a.user_id === userId);
      }
    } else {
      let sql = `
        SELECT a.application_id, f.hof_name, f.hof_dob, f.hof_gender, f.hof_aadhaar, f.hof_mobile, f.hof_address, f.hof_category, f.household_id, e.epic_number, p.pan_number, a.status, a.ocr_confidence, a.created_at
        FROM applications a
        LEFT JOIN families f ON f.application_id = a.id
        LEFT JOIN epic_details e ON e.application_id = a.id
        LEFT JOIN pan_details p ON p.application_id = a.id
      `;
      const params: any[] = [];
      if (isOperatorOnly) {
        params.push(userId);
        sql += ` WHERE a.user_id = $1`;
      }
      const dbRes = await query(sql, params);
      rows = dbRes.rows.map(r => ({
        application_id: r.application_id,
        status: r.status,
        ocr_confidence: r.ocr_confidence,
        created_at: r.created_at,
        families: {
          hof_name: r.hof_name,
          hof_dob: r.hof_dob,
          hof_gender: r.hof_gender,
          hof_aadhaar: r.hof_aadhaar,
          hof_mobile: r.hof_mobile,
          hof_address: r.hof_address,
          hof_category: r.hof_category,
          household_id: r.household_id
        },
        epic_details: { epic_number: r.epic_number },
        pan_details: { pan_number: r.pan_number }
      }));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Annapurna Applications');

    // Define columns
    worksheet.columns = [
      { header: 'Application ID', key: 'appId', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'HOF Full Name', key: 'name', width: 25 },
      { header: 'DOB', key: 'dob', width: 15 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Aadhaar Number', key: 'aadhaar', width: 20 },
      { header: 'Mobile Number', key: 'mobile', width: 18 },
      { header: 'Ration household ID', key: 'rationId', width: 20 },
      { header: 'Voter EPIC Number', key: 'epic', width: 20 },
      { header: 'PAN Number', key: 'pan', width: 18 },
      { header: 'OCR Confidence (%)', key: 'ocrConf', width: 20 },
      { header: 'Submission Date', key: 'date', width: 25 }
    ];

    // Populate data
    rows.forEach(r => {
      worksheet.addRow({
        appId: r.application_id,
        status: r.status,
        name: r.families?.hofName || r.families?.hof_name || r.family?.hofName || 'N/A',
        dob: r.families?.hofDob || r.families?.hof_dob || r.family?.hofDob || 'N/A',
        gender: r.families?.hofGender || r.families?.hof_gender || r.family?.hofGender || 'N/A',
        aadhaar: r.families?.hofAadhaar || r.families?.hof_aadhaar || r.family?.hofAadhaar || 'N/A',
        mobile: r.families?.hofMobile || r.families?.hof_mobile || r.family?.hofMobile || 'N/A',
        rationId: r.families?.householdId || r.families?.household_id || r.family?.householdId || 'N/A',
        epic: r.epic_details?.epicNumber || r.epic_details?.epic_number || r.epicDetails?.epicNumber || 'N/A',
        pan: r.pan_details?.panNumber || r.pan_details?.pan_number || r.panDetails?.panNumber || 'N/A',
        ocrConf: r.ocr_confidence || r.ocrConfidence || 0,
        date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A'
      });
    });

    // Make header bold
    worksheet.getRow(1).font = { bold: true };

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'Annapurna_Applications.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Error exporting applications to Excel:', error);
    return res.status(500).json({ error: 'Failed to export data to Excel' });
  }
};
