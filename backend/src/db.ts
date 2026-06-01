import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

// Define the environment variables
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/annapurna';
const isProd = process.env.NODE_ENV === 'production';

let pool: Pool | null = null;
let useMock = false;

// Mock Store definition for In-Memory Fallback
const mockStore: {
  users: any[];
  applications: any[];
  families: any[];
  members: any[];
  bank_details: any[];
  epic_details: any[];
  pan_details: any[];
  assets: any[];
  education: any[];
  children: any[];
  government_schemes: any[];
  signatures: any[];
} = {
  users: [],
  applications: [],
  families: [],
  members: [],
  bank_details: [],
  epic_details: [],
  pan_details: [],
  assets: [],
  education: [],
  children: [],
  government_schemes: [],
  signatures: []
};

// Seed default users for testing
mockStore.users.push({ id: 1, mobile_number: '9876543210', role: 'admin', created_at: new Date() });
mockStore.users.push({ id: 2, mobile_number: '9999999999', role: 'operator', created_at: new Date() });

export async function initDb() {
  try {
    console.log('Connecting to PostgreSQL database...');
    pool = new Pool({
      connectionString: dbUrl,
      connectionTimeoutMillis: 5000 // 5 seconds timeout
    });

    // Test the connection
    const client = await pool.connect();
    console.log('PostgreSQL connected. Initializing tables...');
    
    // Read and run schema.sql
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(schemaSql);
      console.log('Database tables verified/created successfully.');
    } else {
      console.warn('Schema file not found at:', schemaPath);
    }
    client.release();
    useMock = false;
  } catch (err: any) {
    console.error('PostgreSQL connection failed:', err.message);
    console.warn('⚠️ FALLBACK: Starting in Mock In-Memory Database Mode.');
    useMock = true;
    pool = null;
  }
}

// Unified Query Handler
export async function query(text: string, params: any[] = []) {
  if (useMock || !pool) {
    return mockQuery(text, params);
  }
  return pool.query(text, params);
}

export function isUsingMockDb() {
  return useMock;
}

export function getMockStore() {
  return mockStore;
}

// A simple mock query parser/executer for standard SQL patterns used in this app
function mockQuery(text: string, params: any[]): any {
  const normalizedText = text.trim().replace(/\s+/g, ' ').toLowerCase();
  
  // 1. INSERT INTO users
  if (normalizedText.includes('insert into users')) {
    const mobile = params[0];
    let user = mockStore.users.find(u => u.mobile_number === mobile);
    if (!user) {
      user = { id: mockStore.users.length + 1, mobile_number: mobile, role: 'operator', created_at: new Date() };
      mockStore.users.push(user);
    }
    return { rows: [user], rowCount: 1 };
  }
  
  // 2. SELECT * FROM users WHERE mobile_number
  if (normalizedText.includes('select') && normalizedText.includes('from users') && normalizedText.includes('mobile_number')) {
    const mobile = params[0];
    const user = mockStore.users.find(u => u.mobile_number === mobile);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 3. SELECT * FROM users WHERE id
  if (normalizedText.includes('select') && normalizedText.includes('from users') && normalizedText.includes('id =')) {
    const id = params[0];
    const user = mockStore.users.find(u => u.id === Number(id));
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 4. INSERT INTO applications
  if (normalizedText.includes('insert into applications')) {
    // INSERT INTO applications (user_id, application_id, status, current_step, ocr_confidence) VALUES ($1, $2, $3, $4, $5) RETURNING *
    const app = {
      id: mockStore.applications.length + 1,
      user_id: params[0],
      application_id: params[1],
      status: params[2] || 'draft',
      current_step: params[3] || 1,
      ocr_confidence: params[4] || 0.00,
      created_at: new Date(),
      updated_at: new Date()
    };
    mockStore.applications.push(app);
    return { rows: [app], rowCount: 1 };
  }

  // 5. SELECT * FROM applications WHERE application_id / id
  if (normalizedText.includes('from applications') && normalizedText.includes('where')) {
    if (normalizedText.includes('application_id =')) {
      const appId = params[0];
      const app = mockStore.applications.find(a => a.application_id === appId);
      return { rows: app ? [app] : [], rowCount: app ? 1 : 0 };
    }
    if (normalizedText.includes('id =')) {
      const id = params[0];
      const app = mockStore.applications.find(a => a.id === Number(id));
      return { rows: app ? [app] : [], rowCount: app ? 1 : 0 };
    }
  }

  // Generic Mock Query Fallback (Return empty result or generic structures)
  console.log(`Mock DB Query: ${text} | Params: ${JSON.stringify(params)}`);
  return { rows: [], rowCount: 0 };
}
