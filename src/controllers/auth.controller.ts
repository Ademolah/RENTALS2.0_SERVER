import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { AuthService } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const registerUser = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, firstName, lastName, role } = req.body;

  // Prevent users from bypassing security to become ADMIN
  const assignedRole = role === 'ADMIN' ? 'USER' : role; 

  // Check if user already exists
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
    role: assignedRole || 'USER',
  });

  const token = AuthService.generateToken(newUser.id);

  // Remove password hash from response
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

  // Must explicitly select the passwordHash field because we set `select: false` in the schema
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !(await AuthService.comparePasswords(password, user.passwordHash))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  const token = AuthService.generateToken(user.id);
  user.passwordHash = undefined as any;

  res.status(200).json({
    status: 'success',
    token,
    data: { user }
  });
});