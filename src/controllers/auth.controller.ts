import { Request, Response, NextFunction } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AuthService } from '../services/auth.service.js';
import { EmailService } from '../services/email.service.js'; 
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const FRONTEND_BASE_URL = process.env.FRONTEND_URL;


export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, 
  statusCode: 429,
  standardHeaders: true, 
  legacyHeaders: false, 

  keyGenerator: (req: Request) => {
    const email = req.body.email ? req.body.email.toLowerCase() : 'unknown';
    const clientIp = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
    return `${clientIp}_${email}`;
  },
  message: { status: 'fail', message: 'Too many login attempts. Please try again after 15 minutes.' }
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, 
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  
  keyGenerator: (req: Request) => {
    const email = req.body.email ? req.body.email.toLowerCase() : 'unknown';
    const clientIp = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
    return `register_${clientIp}_${email}`;
  },
  message: { status: 'fail', message: 'Too many accounts created from this IP. Please try again later.' }
});


export const registerUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, firstName, lastName, role, phoneNumber } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return next(new AppError('Please provide all required fields: email, password, firstName, and lastName.', 400));
  }

  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!\%*#?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return next(new AppError('Password must be at least 8 characters long and contain at least one letter and one number.', 400));
  }

  const assignedRole = role === 'ADMIN' ? 'USER' : role; 
  
  // 💡 Generate 6-digit OTP and 15-minute expiry
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString(); 
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); 

  const existingUser = await User.findOne({ email });

  if (existingUser) {
    if (existingUser.isVerified) {
      return next(new AppError('Email is already registered and verified.', 400));
    }
    
    // 💡 If unverified, update their details and send a fresh OTP so they don't get locked out
    existingUser.verificationCode = otpCode;
    existingUser.verificationCodeExpires = otpExpiry;
    existingUser.passwordHash = await AuthService.hashPassword(password);
    existingUser.firstName = firstName;
    existingUser.lastName = lastName;
    if (phoneNumber) existingUser.phoneNumber = phoneNumber;
    
    await existingUser.save();
    await EmailService.sendEmailVerification({ to: email, firstName, otpCode });

    return res.status(200).json({
      status: 'success',
      message: 'A new verification code has been sent to your email.'
    });
  }

  const passwordHash = await AuthService.hashPassword(password);

  const newUser = await User.create({
    email,
    passwordHash,
    firstName,
    lastName,
    phoneNumber, 
    role: assignedRole || 'USER',
    isVerified: false,
    verificationCode: otpCode,
    verificationCodeExpires: otpExpiry
  });

  // 💡 Send the OTP email immediately upon creation instead of the Welcome Email
  await EmailService.sendEmailVerification({ 
    to: newUser.email, 
    firstName: newUser.firstName, 
    otpCode 
  });

  // 💡 Return a pending status. No token is returned yet.
  res.status(201).json({
    status: 'pending',
    message: 'Registration initiated. Please check your email for the verification code.'
  });
});

export const loginUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !(await AuthService.comparePasswords(password, user.passwordHash))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  const token = AuthService.generateToken(user._id.toString()); 
  user.passwordHash = undefined as any;

  res.status(200).json({
    status: 'success',
    token,
    data: { user }
  });
});

// --- ACCOUNT RECOVERY ---
export const forgotPassword = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;
  if (!email) return next(new AppError('Please provide your email address.', 400));

  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError('There is no user with that email address.', 404));
  }

  const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '15m' });
  const resetUrl = `${FRONTEND_BASE_URL}/reset-password?token=${resetToken}`;

  try {
    EmailService.sendPasswordReset({ to: user.email, firstName: user.firstName, resetUrl }).catch(console.error);
    
    // 💡 AUDIT FIX: Removed `data: { resetToken }` to prevent token leakage. 
    // The token is now ONLY sent via the EmailService.
    res.status(200).json({
      status: 'success',
      message: 'Password reset link sent to email.'
    });
  } catch (err) {
    return next(new AppError('There was an error sending the email. Try again later!', 500));
  }
});

export const resetPassword = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return next(new AppError('Token and new password are required.', 400));
  }

  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!\%*#?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return next(new AppError('Password must be at least 8 characters long and contain at least one letter and one number.', 400));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id);

    if (!user) return next(new AppError('User not found.', 404));

    user.passwordHash = await AuthService.hashPassword(newPassword);
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset successfully. You can now log in.'
    });
  } catch (error) {
    return next(new AppError('Token is invalid or has expired.', 401));
  }
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, otpCode } = req.body;

  if (!email || !otpCode) {
    return next(new AppError('Please provide both email and verification code.', 400));
  }

  // Find user with matching email, exact OTP, and ensure OTP hasn't expired
  const user = await User.findOne({ 
    email: email.toLowerCase(),
    verificationCode: otpCode,
    verificationCodeExpires: { $gt: new Date() } 
  });

  if (!user) {
    return next(new AppError('Invalid or expired verification code.', 400));
  }

  // Mark as verified and clear OTP fields from the database
  user.isVerified = true;
  user.verificationCode = undefined as any;
  user.verificationCodeExpires = undefined as any;
  await user.save();

  // Now that they are verified, dispatch the Welcome Email
  EmailService.sendUserWelcome({
    to: user.email,
    firstName: user.firstName,
    exploreUrl: process.env.FRONTEND_URL || '' 
  }).catch(console.error); 

  // Generate auth token and log them in immediately
  const token = AuthService.generateToken(user.id);
  user.passwordHash = undefined as any;

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully.',
    token,
    data: { user }
  });
});