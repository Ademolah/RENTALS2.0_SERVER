import crypto from 'crypto';

// 🛑 REMOVED the global PAYSTACK_SECRET_KEY from here because it evaluates too early!

export class PaystackService {
  /**
   * Initializes a transaction to get the checkout URL.
   * Note: Paystack expects the amount in Kobo (Naira * 100).
   */
  static async initializeTransaction(
    email: string, 
    amountInNaira: number, 
    metadata: any,
    reference?: string // 💡 Added the 4th parameter for the custom reference string
  ) {
    const amountInKobo = amountInNaira * 100;
    
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.error("🚨 CRITICAL CONFIG ERROR: process.env.PAYSTACK_SECRET_KEY is missing!");
      throw new Error("Payment gateway configuration is missing.");
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountInKobo,
        reference, // 💡 Maps your custom local tracking reference to the root of Paystack's endpoint
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}`, 
        metadata 
      }),
    });

    const data = await response.json();
    if (!data.status) {
      throw new Error(`Paystack Initialization Failed: ${data.message}`);
    }
    return data.data; 
  }

  /**
   * Verifies a transaction via Webhook or direct lookup.
   */
  static async verifyTransaction(reference: string) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const data = await response.json();
    return data.data; 
  }

  /**
   * Verifies the HMAC SHA512 signature sent by Paystack Webhooks to prevent spoofing.
   */
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    const hash = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
    return hash === signature;
  }
}
