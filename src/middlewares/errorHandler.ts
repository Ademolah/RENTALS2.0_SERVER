import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';

export const globalErrorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const status = err instanceof AppError ? err.status : 'error';

  // In production, we don't want to leak error details to the client
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    status,
    message: err.message || 'Internal Server Error',
    ...( !isProduction && { stack: err.stack } ) // Only show stack trace in dev
  });
};