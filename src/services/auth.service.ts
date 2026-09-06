import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// 🛑 REMOVED the global variables from here because they run before dotenv loads!

export class AuthService {
  /**
   * Hashes a plain text password using bcrypt with a salt round of 12.
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  /**
   * Compares a provided password against the stored database hash.
   */
  static async comparePasswords(candidatePassword: string, userHash: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, userHash);
  }

  /**
   * Generates a signed JWT payload containing the user's ID.
   */
  static generateToken(userId: string): string {
    // ✅ Move environment variables inside the execution method!
    const secret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

    // Safety fallback check so you can pinpoint configuration setup issues instantly
    if (!secret) {
      console.error("🚨 CRITICAL ERROR: process.env.JWT_SECRET is undefined inside generateToken!");
      throw new Error('Secret key configurations are missing.');
    }

    return jwt.sign({ id: userId }, secret, {
      expiresIn: expiresIn as any, 
    });
  }
}
