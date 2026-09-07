import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { UserRole } from '../types/index.js';

interface JwtPayload {
  id: string;
}

// 🛑 REMOVED the global JWT_SECRET from here because it loads too early!

export const protect = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  let token;

  // 1. Check if token exists in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  // ✅ THE CRITICAL FIX: Fetch the secret dynamically inside the function block
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("🚨 CRITICAL ERROR: process.env.JWT_SECRET is undefined inside protect middleware!");
    return next(new AppError('Internal Server Error: Missing validation keys.', 500));
  }

  // 2. Verify token payload using our freshly read secret
  const decoded = jwt.verify(token, secret) as JwtPayload;

  // 3. Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  // 4. Grant access to protected route
  req.user = currentUser;
  next();
});

// Role-based Access Control (RBAC) Guard
export const restrictTo = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};
