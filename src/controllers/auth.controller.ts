import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AuthService } from '../services/auth.service.js';
import { EmailService } from '../services/email.service.js'; 
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const FRONTEND_BASE_URL = process.env.FRONTEND_URL;

// --- RATE LIMITERS (Audit Item 3.7 - Configured for RFC standard headers & 429 status) ---
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per window
  statusCode: 429,
  standardHeaders: true, // Return rate limit info in `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers
  legacyHeaders: false, // Disable legacy `X-RateLimit-*` headers
  message: { status: 'fail', message: 'Too many login attempts. Please try again after 15 minutes.' }
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 account creations per hour
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
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

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email is already registered.', 400));
  }

  const passwordHash = await AuthService.hashPassword(password);

  const newUser = await User.create({
    email,
    passwordHash,
    firstName,
    lastName,
    phoneNumber, 
    role: assignedRole || 'USER',
  });

  EmailService.sendUserWelcome({
    to: newUser.email,
    firstName: newUser.firstName,
    exploreUrl: FRONTEND_BASE_URL || '' 
  }).catch(console.error); 

  const token = AuthService.generateToken(newUser.id);

  newUser.passwordHash = undefined as any;

  res.status(201).json({
    status: 'success',
    token,
    data: { user: newUser }
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
    
    res.status(200).json({
      status: 'success',
      message: 'Password reset link sent to email.',
      data: { resetToken }
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