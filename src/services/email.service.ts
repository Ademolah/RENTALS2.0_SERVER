import { Resend } from 'resend';
import { render } from '@react-email/render';
import React from 'react';
import { LuxuryEmailTemplate } from '../emails/EmailTemplate'; 
import * as dotenv from 'dotenv'

dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'rentalsafrica@gmail.com'; // Hardcoded admin email

interface NotificationPayload {
  guestEmail: string;
  guestName: string;
  hostEmail: string;
  hostName: string;
  assetTitle: string;
  bookingType: 'SHORTLET' | 'CAR' | 'HOTEL' | 'VIP';
  amount: number;
  datesOrTime: string;
}

export class EmailService {
  
  /**
   * Fires when Paystack webhook confirms successful deposit
   */
  static async sendBookingSuccess(data: NotificationPayload) {
    try {
      // 1. Render HTML for Guest
      const guestHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'GUEST', eventType: 'BOOKING_SUCCESS', recipientName: data.guestName })
      );
      
      // 2. Render HTML for Host
      const hostHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'HOST', eventType: 'BOOKING_SUCCESS', recipientName: data.hostName })
      );

      // 3. Render HTML for Admin
      const adminHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'ADMIN', eventType: 'BOOKING_SUCCESS', recipientName: 'Admin Team' })
      );

      // Batch send to avoid blocking (Fire and Forget)
      await Promise.all([
        resend.emails.send({ from: 'Rentals <noreply@rentalsafrica.com>', to: data.guestEmail, subject: `Reservation Confirmed: ${data.assetTitle}`, html: guestHtml }),
        resend.emails.send({ from: 'Rentals <noreply@rentalsafrica.com>', to: data.hostEmail, subject: `Action Required: New Booking for ${data.assetTitle}`, html: hostHtml }),
        resend.emails.send({ from: 'Rentals <noreply@rentalsafrica.com>', to: ADMIN_EMAIL, subject: `Platform Ledger: New ${data.bookingType} Booking`, html: adminHtml })
      ]);

      console.log(`[Email Service] Booking Success emails broadcasted for ${data.assetTitle}`);
    } catch (error) {
      console.error('[Email Service] Failed to send Booking Success emails:', error);
    }
  }

  /**
   * Fires when double-handshake is completed and funds are released
   */
  static async sendEscrowRelease(data: NotificationPayload) {
    try {
      const guestHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'GUEST', eventType: 'ESCROW_RELEASE', recipientName: data.guestName })
      );
      
      const hostHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'HOST', eventType: 'ESCROW_RELEASE', recipientName: data.hostName })
      );

      const adminHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'ADMIN', eventType: 'ESCROW_RELEASE', recipientName: 'Admin Team' })
      );

      await Promise.all([
        resend.emails.send({ from: 'Rentals <noreply@rentalsafrica.com>', to: data.guestEmail, subject: `Escrow Released: ${data.assetTitle}`, html: guestHtml }),
        resend.emails.send({ from: 'Rentals <noreply@rentalsafrica.com>', to: data.hostEmail, subject: `Payout Authorized: ₦${data.amount.toLocaleString()}`, html: hostHtml }),
        resend.emails.send({ from: 'Rentals <noreply@rentalsafrica.com>', to: ADMIN_EMAIL, subject: `Escrow Cleared: ${data.assetTitle}`, html: adminHtml })
      ]);

      console.log(`[Email Service] Escrow Release emails broadcasted for ${data.assetTitle}`);
    } catch (error) {
      console.error('[Email Service] Failed to send Escrow Release emails:', error);
    }
  }
}