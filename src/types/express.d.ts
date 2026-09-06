import { IUserDocument } from './index.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
    }
  }
}