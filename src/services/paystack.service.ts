// paystack.service.ts
import axios from 'axios';
import crypto from 'crypto';
import { AppError } from '../utils/AppError';
import https from 'https';

export class PaystackService {
  private static baseURL = 'https://api.paystack.co';
  

  private static get headers() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.error("🚨 CRITICAL CONFIG ERROR: process.env.PAYSTACK_SECRET_KEY is missing!");
      throw new Error("Payment gateway configuration is missing.");
    }
    return {
      Authorization: `Bearer ${secretKey.trim()}`,
      'Content-Type': 'application/json',
    };
  }

  // 1. Fetch available banks for the dropdown
  static async getBanks() {
    try {
      const response = await axios.get(`${this.baseURL}/bank?currency=NGN`, {
        headers: this.headers,
      });
      return response.data.data; // Clean JSON payload array
    } catch (error: any) {
      throw new AppError(error.response?.data?.message || 'Failed to fetch banks from Paystack', error.response?.status || 500);
    }
  }

 

// 2. Resolve account number to confirm the real name
static async resolveAccountNumber(accountNumber: string, bankCode: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const cleanAccountNumber = String(accountNumber).trim();
    const cleanBankCode = String(bankCode).trim();
    
    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    if (!secretKey) {
      return reject(new AppError('Payment gateway configuration is missing.', 500));
    }

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: `/bank/resolve?account_number=${cleanAccountNumber}&bank_code=${cleanBankCode}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          
          // If Paystack returns status: false, reject with their exact message
          if (!parsedData.status) {
            return reject(new AppError(parsedData.message || 'Could not resolve account name.', res.statusCode || 400));
          }
          
          // Return the clean data object payload { account_number, account_name }
          resolve(parsedData.data);
        } catch (error) {
          reject(new AppError('Failed to parse response from payment gateway', 500));
        }
      });
    });

    req.on('error', (error) => {
      reject(new AppError(error.message || 'Network communication failure', 500));
    });

    req.end();
  });
}

  

// 3. Create Transfer Recipient (Using Axios statically)
static async createTransferRecipient(name: string, accountNumber: string, bankCode: string): Promise<any> {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    console.log(secretKey)
    if (!secretKey) {
      throw new AppError("Payment gateway configuration is missing.", 500);
    }

    const payload = {
      type: 'nuban',
      name: String(name).trim(),
      account_number: String(accountNumber).trim(),
      bank_code: String(bankCode).trim(),
      currency: 'NGN',
    };

    const response = await axios.post('https://api.paystack.co/transferrecipient', payload, {
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        'Content-Type': 'application/json',
      },
    });
    
    return response.data.data; // Returns the exact object containing your recipient_code
  } catch (error: any) {
    console.error("Paystack API Error:", error.response?.data || error.message);
    
    throw new AppError(
      error.response?.data?.message || 'Failed to create transfer recipient',
      error.response?.status || 400
    );
  }
}


static async initiateTransfer(amountInNaira: number, recipientCode: string, reference: string, reason: string) {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    
    if (!secretKey) {
      throw new AppError("Payment gateway configuration is missing.", 500);
    }

    // Paystack requires the amount in Kobo (base currency * 100)
    const amountInKobo = Math.round(amountInNaira * 100);

    const payload = {
      source: 'balance', 
      amount: amountInKobo,
      recipient: String(recipientCode).trim(),
      reference: String(reference).trim(), // Pass the booking ID as reference for easy reconciliation
      reason: String(reason).trim()
    };

    const response = await axios.post('https://api.paystack.co/transfer', payload, {
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Paystack Transfer Error:', error.response?.data || error.message);
    // Standardize the error response to match your backend error handling
    throw new AppError(
      error.response?.data?.message || 'Failed to initiate Paystack transfer',
      error.response?.status || 400
    );
  }
}

  // 4. Initialize Transaction
  static async initializeTransaction(
    email: string, 
    amountInNaira: number, 
    metadata: any,
    reference?: string 
  ) {
    try {
      const amountInKobo = amountInNaira * 100;
      const payload = {
        email,
        amount: amountInKobo,
        reference, 
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}`, 
        metadata 
      };

      const response = await axios.post(`${this.baseURL}/transaction/initialize`, payload, {
        headers: this.headers,
      });
      return response.data.data;
    } catch (error: any) {
      throw new AppError(error.response?.data?.message || 'Paystack Initialization Failed', error.response?.status || 400);
    }
  }

  // 5. Verify Transaction
  static async verifyTransaction(reference: string) {
    try {
      const response = await axios.get(`${this.baseURL}/transaction/verify/${reference}`, {
        headers: this.headers,
      });
      return response.data.data;
    } catch (error: any) {
      throw new AppError(error.response?.data?.message || 'Transaction verification failed', error.response?.status || 400);
    }
  }

  // 6. Verify Webhook Signature
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    const secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    const hash = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
    return hash === signature;
  }
}
