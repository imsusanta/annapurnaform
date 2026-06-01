-- Database schema for Annapurna Auto Form Fill Application

-- Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  mobile_number VARCHAR(15) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'operator', -- operator, admin
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Applications Table
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  application_id VARCHAR(50) UNIQUE NOT NULL, -- Format: APN-YYYYMMDD-XXXX
  status VARCHAR(20) DEFAULT 'draft', -- draft, submitted, approved, rejected
  current_step INTEGER DEFAULT 1,
  ocr_confidence NUMERIC(5,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Head of Family (HOF) & Family Info Table
CREATE TABLE IF NOT EXISTS families (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  hof_name VARCHAR(100),
  hof_dob DATE,
  hof_gender VARCHAR(20),
  hof_aadhaar VARCHAR(12) UNIQUE,
  hof_mobile VARCHAR(15),
  hof_address TEXT,
  hof_category VARCHAR(50),
  household_id VARCHAR(50), -- Digital Ration Card Household ID
  aadhaar_front_path TEXT,
  aadhaar_back_path TEXT,
  ration_card_path TEXT,
  caste_certificate_path TEXT
);

-- Family Members Table
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  name VARCHAR(100),
  dob DATE,
  gender VARCHAR(20),
  relation VARCHAR(50),
  aadhaar VARCHAR(12),
  aadhaar_path TEXT
);

-- Bank Details Table
CREATE TABLE IF NOT EXISTS bank_details (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  member_aadhaar VARCHAR(12), -- links to member or HOF Aadhaar
  bank_name VARCHAR(100),
  account_number VARCHAR(30),
  ifsc VARCHAR(20),
  passbook_path TEXT
);

-- EPIC (Voter ID) Details Table
CREATE TABLE IF NOT EXISTS epic_details (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  epic_number VARCHAR(30),
  ac_part_number VARCHAR(30),
  voter_card_path TEXT
);

-- PAN Details Table
CREATE TABLE IF NOT EXISTS pan_details (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  pan_number VARCHAR(20),
  pan_holder_name VARCHAR(100),
  pan_card_path TEXT
);

-- Assets Table
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  pucca_rooms BOOLEAN DEFAULT FALSE,
  land_ownership BOOLEAN DEFAULT FALSE,
  land_size VARCHAR(50),
  vehicle_ownership BOOLEAN DEFAULT FALSE,
  vehicle_number VARCHAR(30),
  vehicle_model VARCHAR(50),
  health_insurance_type VARCHAR(50),
  premium NUMERIC(10,2) DEFAULT 0.00,
  sum_assured NUMERIC(10,2) DEFAULT 0.00,
  extra_fields TEXT
);

-- Education Table
CREATE TABLE IF NOT EXISTS education (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  member_aadhaar VARCHAR(12),
  is_literate BOOLEAN DEFAULT TRUE,
  highest_qualification VARCHAR(50)
);

-- Children Details Table
CREATE TABLE IF NOT EXISTS children (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  name VARCHAR(100),
  class_name VARCHAR(30),
  school_name VARCHAR(100),
  school_type VARCHAR(50),
  is_vaccinated BOOLEAN DEFAULT FALSE,
  vaccination_card_id VARCHAR(50)
);

-- Government Schemes Table
CREATE TABLE IF NOT EXISTS government_schemes (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  schemes_list TEXT[] DEFAULT '{}',
  dbt_receiving BOOLEAN DEFAULT FALSE
);

-- Signatures Table
CREATE TABLE IF NOT EXISTS signatures (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
  signature_data TEXT, -- Base64 string of signature image (drawn/uploaded)
  signature_type VARCHAR(20), -- drawn, uploaded
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Fast Searches
CREATE INDEX IF NOT EXISTS idx_hof_aadhaar ON families(hof_aadhaar);
CREATE INDEX IF NOT EXISTS idx_member_aadhaar ON members(aadhaar);
CREATE INDEX IF NOT EXISTS idx_app_id ON applications(application_id);
CREATE INDEX IF NOT EXISTS idx_user_mobile ON users(mobile_number);

-- Startup migration to ensure extra_fields column is added to existing database tables
ALTER TABLE assets ADD COLUMN IF NOT EXISTS extra_fields TEXT;
ALTER TABLE pan_details ADD COLUMN IF NOT EXISTS pan_holder_name VARCHAR(100);
ALTER TABLE families ADD COLUMN IF NOT EXISTS caste_certificate_path TEXT;
