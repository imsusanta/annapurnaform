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

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

// A simple mock query parser/executer for standard SQL patterns used in this app
function mockQuery(text: string, params: any[]): any {
  const normalizedText = text.trim().replace(/\s+/g, ' ').toLowerCase();
  
  // Helper for table matching
  const getStoreKey = (table: string): string => {
    table = table.toLowerCase().trim();
    if (table === 'users') return 'users';
    if (table === 'applications') return 'applications';
    if (table === 'families') return 'families';
    if (table === 'members') return 'members';
    if (table === 'bank_details') return 'bank_details';
    if (table === 'epic_details') return 'epic_details';
    if (table === 'pan_details') return 'pan_details';
    if (table === 'assets') return 'assets';
    if (table === 'education') return 'education';
    if (table === 'children') return 'children';
    if (table === 'government_schemes') return 'government_schemes';
    if (table === 'signatures') return 'signatures';
    return table;
  };

  // Special case 1: users mobile login check
  if (normalizedText.includes('select') && normalizedText.includes('from users') && normalizedText.includes('mobile_number') && !normalizedText.includes('insert')) {
    const mobile = params[0];
    const user = mockStore.users.find(u => u.mobile_number === mobile);
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  // 1. DELETE query
  const deleteMatch = normalizedText.match(/delete\s+from\s+(\w+)\s+where\s+(\w+)\s*=\s*\$(\d+)/i);
  if (deleteMatch) {
    const table = deleteMatch[1];
    const whereCol = deleteMatch[2];
    const paramIdx = parseInt(deleteMatch[3]) - 1;
    const val = params[paramIdx];
    const storeKey = getStoreKey(table);
    const list = mockStore[storeKey as keyof typeof mockStore];
    if (list) {
      const remaining = list.filter((item: any) => {
        const itemVal = item[whereCol] !== undefined ? item[whereCol] : item[toCamelCase(whereCol)];
        return String(itemVal) !== String(val);
      });
      // Replace in place
      (mockStore as any)[storeKey] = remaining;
    }
    return { rows: [], rowCount: 1 };
  }

  // 2. INSERT query
  const insertMatch = normalizedText.match(/insert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const table = insertMatch[1];
    const columns = insertMatch[2].split(',').map(c => c.trim().toLowerCase());
    const storeKey = getStoreKey(table);
    const list = mockStore[storeKey as keyof typeof mockStore];
    if (list) {
      const newObj: any = { id: list.length + 1, created_at: new Date(), updated_at: new Date() };
      columns.forEach((col, idx) => {
        const paramVal = params[idx];
        newObj[col] = paramVal;
        newObj[toCamelCase(col)] = paramVal;
      });
      list.push(newObj);
      return { rows: [newObj], rowCount: 1 };
    }
  }

  // 3. UPDATE query
  const updateMatch = normalizedText.match(/update\s+(\w+)\s+set\s+(.+)\s+where\s+(\w+)\s*=\s*\$(\d+)/i);
  if (updateMatch) {
    const table = updateMatch[1];
    const setClause = updateMatch[2];
    const whereCol = updateMatch[3];
    const whereParamIdx = parseInt(updateMatch[4]) - 1;
    const whereVal = params[whereParamIdx];
    const storeKey = getStoreKey(table);
    const list = mockStore[storeKey as keyof typeof mockStore];
    
    if (list) {
      const updates: { col: string, paramIdx: number }[] = [];
      const regex = /(\w+)\s*=\s*\$(\d+)/g;
      let m;
      while ((m = regex.exec(setClause)) !== null) {
        updates.push({ col: m[1], paramIdx: parseInt(m[2]) - 1 });
      }
      
      let updatedCount = 0;
      const updatedRows: any[] = [];
      list.forEach((item: any) => {
        const itemVal = item[whereCol] !== undefined ? item[whereCol] : item[toCamelCase(whereCol)];
        if (String(itemVal) === String(whereVal)) {
          updates.forEach(u => {
            const val = params[u.paramIdx];
            item[u.col] = val;
            item[toCamelCase(u.col)] = val;
          });
          item.updated_at = new Date();
          updatedCount++;
          updatedRows.push(item);
        }
      });
      
      const upsertTables = ['families', 'epic_details', 'pan_details', 'assets', 'government_schemes', 'signatures'];
      if (updatedCount === 0 && upsertTables.includes(storeKey)) {
        const newObj: any = { id: list.length + 1, created_at: new Date(), updated_at: new Date() };
        newObj[whereCol] = whereVal;
        newObj[toCamelCase(whereCol)] = whereVal;
        updates.forEach(u => {
          const val = params[u.paramIdx];
          newObj[u.col] = val;
          newObj[toCamelCase(u.col)] = val;
        });
        list.push(newObj);
        updatedCount = 1;
        updatedRows.push(newObj);
      }
      
      return { rows: updatedRows, rowCount: updatedCount };
    }
  }

  // 4. SELECT query
  const selectMatch = normalizedText.match(/select\s+\*\s+from\s+(\w+)(?:\s+where\s+(\w+)\s*=\s*\$(\d+))?/i);
  if (selectMatch) {
    const table = selectMatch[1];
    const whereCol = selectMatch[2];
    const paramIdx = selectMatch[3] ? parseInt(selectMatch[3]) - 1 : -1;
    const storeKey = getStoreKey(table);
    const list = mockStore[storeKey as keyof typeof mockStore] || [];
    
    if (!whereCol || paramIdx === -1) {
      return { rows: list, rowCount: list.length };
    }
    
    const val = params[paramIdx];
    const filtered = list.filter((item: any) => {
      const itemVal = item[whereCol] !== undefined ? item[whereCol] : item[toCamelCase(whereCol)];
      return String(itemVal) === String(val);
    });
    return { rows: filtered, rowCount: filtered.length };
  }

  console.log(`Mock DB Query: ${text} | Params: ${JSON.stringify(params)}`);
  return { rows: [], rowCount: 0 };
}
