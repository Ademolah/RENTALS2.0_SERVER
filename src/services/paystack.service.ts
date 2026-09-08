import crypto from 'crypto';

// 🛑 REMOVED the global PAYSTACK_SECRET_KEY from here because it evaluates too early!

export class PaystackService {
  /**
   * Initializes a transaction to get the checkout URL.
   * Note: Paystack expects the amount in Kobo (Naira * 100).
   */
  static async initializeTransaction(email: string, amountInNaira: number, reference: string) {
    const amountInKobo = amountInNaira * 100;
    
    // ✅ THE CRITICAL FIX: Fetch the secret dynamically inside the function execution scope
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.error("🚨 CRITICAL CONFIG ERROR: process.env.PAYSTACK_SECRET_KEY is missing inside initializeTransaction!");
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
        reference,
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`, // Where React redirects after payment
      }),
    });

    const data = await response.json();
    if (!data.status) {
      throw new Error(`Paystack Initialization Failed: ${data.message}`);
    }
    return data.data; // Contains authorization_url and access_code
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
    return data.data; // Contains status ('success', 'failed', etc.)
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
