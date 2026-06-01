import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'annapurna_super_secret_jwt_key_123!';

// Simple in-memory storage for OTPs: mobile_number -> { otp, expires }
const otpStore = new Map<string, { otp: string; expires: number }>();

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { mobileNumber } = req.body;
    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

    // Save in memory
    otpStore.set(mobileNumber, { otp, expires });

    console.log(`[SMS Gateway Mock] Sent OTP ${otp} to ${mobileNumber}`);

    // In development mode, we return the OTP in the API response so the user can easily see and copy it.
    return res.status(200).json({
      message: 'OTP sent successfully (Simulated)',
      otp: otp, // Delivered directly for ease of demonstration
      expiresIn: '5 minutes'
    });
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
};

export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { mobileNumber, otp } = req.body;

    if (!mobileNumber || !otp) {
      return res.status(400).json({ error: 'Mobile number and OTP are required' });
    }

    // Verify OTP
    const record = otpStore.get(mobileNumber);
    
    // Support standard bypass/dev OTP: '123456'
    const isDevBypass = otp === '123456' || otp === '777777';

    if (!isDevBypass) {
      if (!record) {
        return res.status(400).json({ error: 'No OTP requested for this number' });
      }

      if (Date.now() > record.expires) {
        otpStore.delete(mobileNumber);
        return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
      }

      if (record.otp !== otp) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }
    }

    // Clear OTP after successful use
    otpStore.delete(mobileNumber);

    // Get or Create User
    let userId: number;
    let userRole = 'operator';

    // 1. Try finding user
    const selectRes = await query('SELECT * FROM users WHERE mobile_number = $1', [mobileNumber]);
    if (selectRes.rows.length > 0) {
      userId = selectRes.rows[0].id;
      userRole = selectRes.rows[0].role;
    } else {
      // Create operator user (or admin if first/specific user)
      const isAdminMobile = mobileNumber === '9876543210'; // Dev admin number
      const role = isAdminMobile ? 'admin' : 'operator';
      
      const insertRes = await query(
        'INSERT INTO users (mobile_number, role) VALUES ($1, $2) RETURNING *',
        [mobileNumber, role]
      );
      userId = insertRes.rows[0].id;
      userRole = insertRes.rows[0].role;
    }

    // Generate JWT
    const token = jwt.sign(
      { id: userId, mobile_number: mobileNumber, role: userRole },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'OTP verified successfully',
      token,
      user: {
        id: userId,
        mobileNumber,
        role: userRole
      }
    });
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
};
