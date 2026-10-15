import { Resend } from 'resend';
import { render } from '@react-email/render';
import React from 'react';
import { LuxuryEmailTemplate } from '../emails/EmailTemplate'; 
import * as dotenv from 'dotenv'

dotenv.config()

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'rentalsafrica@gmail.com'; 

interface NotificationPayload {
  guestEmail: string;
  guestName: string;
  guestPhone?: string | undefined; // 
  hostEmail: string;
  hostName: string;
  hostPhone?: string | undefined;  // 
  assetTitle: string;
  bookingType: 'SHORTLET' | 'CAR' | 'HOTEL' | 'VIP';
  amount: number;
  datesOrTime: string;
  paystackReference?: string | undefined; 
}

interface HostWelcomePayload {
  to: string;
  firstName: string;
  dashboardUrl: string;
}

export interface EmailVerificationPayload {
  to: string;
  firstName: string;
  otpCode: string;
}

interface UserWelcomePayload {
  to: string;
  firstName: string;
  exploreUrl: string;
}

export interface PasswordResetPayload {
  to: string;
  firstName: string;
  resetUrl: string;
}

export class EmailService {
  
  static async sendBookingSuccess(data: NotificationPayload) {
    try {
      const guestHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'GUEST', eventType: 'BOOKING_SUCCESS', recipientName: data.guestName } as any)
      );
      
      const hostHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'HOST', eventType: 'BOOKING_SUCCESS', recipientName: data.hostName } as any)
      );

      const adminHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'ADMIN', eventType: 'BOOKING_SUCCESS', recipientName: 'Admin Team' } as any)
      );

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

  static async sendEscrowRelease(data: NotificationPayload) {
    try {
      const guestHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'GUEST', eventType: 'ESCROW_RELEASE', recipientName: data.guestName } as any)
      );
      
      const hostHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'HOST', eventType: 'ESCROW_RELEASE', recipientName: data.hostName } as any)
      );

      const adminHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'ADMIN', eventType: 'ESCROW_RELEASE', recipientName: 'Admin Team' } as any)
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

  static async sendHostWelcome(data: HostWelcomePayload) {
    try {
      const html = await render(
        React.createElement(LuxuryEmailTemplate, {
          recipientName: data.firstName,
          role: 'HOST',
          eventType: 'HOST_WELCOME',
          dashboardUrl: data.dashboardUrl
        })
      );

      await resend.emails.send({
        from: 'Rentals <noreply@rentalsafrica.com>',
        to: data.to,
        subject: 'Welcome to Rentals Africa Hosting',
        html: html
      });

      console.log(`[Email Service] Host Welcome email dispatched to ${data.to}`);
    } catch (error) {
      console.error('[Email Service] Failed to send Host Welcome email:', error);
    }
  }

  static async sendUserWelcome(data: UserWelcomePayload) {
    try {
      const html = await render(
        React.createElement(LuxuryEmailTemplate, {
          recipientName: data.firstName,
          role: 'GUEST', 
          eventType: 'USER_WELCOME',
          dashboardUrl: data.exploreUrl 
        })
      );

      await resend.emails.send({
        from: 'Rentals <noreply@rentalsafrica.com>',
        to: data.to,
        subject: 'Welcome to Rentals Africa',
        html: html
      });

      console.log(`[Email Service] User Welcome email dispatched to ${data.to}`);
    } catch (error) {
      console.error('[Email Service] Failed to send User Welcome email:', error);
    }
  }

  // --- NEW: PASSWORD RESET DISPATCHER ---
  static async sendPasswordReset(data: PasswordResetPayload) {
    try {
      const html = await render(
        React.createElement(LuxuryEmailTemplate, {
          recipientName: data.firstName,
          role: 'GUEST',
          eventType: 'PASSWORD_RESET',
          resetUrl: data.resetUrl
        })
      );

      await resend.emails.send({
        from: 'Rentals <noreply@rentalsafrica.com>',
        to: data.to,
        subject: 'Rentals Africa Password Reset Request',
        html: html
      });

      console.log(`[Email Service] Password Reset email dispatched to ${data.to}`);
    } catch (error) {
      console.error('[Email Service] Failed to send Password Reset email:', error);
    }
  }


  // --- NEW: CANCELLATION BROADCAST ---
  static async sendBookingCancellation(data: NotificationPayload) {
    try {
      const guestHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'GUEST', eventType: 'CANCELLATION', recipientName: data.guestName } as any)
      );
      
      const hostHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'HOST', eventType: 'CANCELLATION', recipientName: data.hostName } as any)
      );

      const adminHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'ADMIN', eventType: 'CANCELLATION', recipientName: 'Admin Team' } as any)
      );

      await Promise.all([
        resend.emails.send({ 
          from: 'Rentals <noreply@rentalsafrica.com>', 
          to: data.guestEmail, 
          subject: `Cancellation Acknowledged: ${data.assetTitle}`, 
          html: guestHtml 
        }),
        resend.emails.send({ 
          from: 'Rentals <noreply@rentalsafrica.com>', 
          to: data.hostEmail, 
          subject: `Reservation Cancelled: ${data.assetTitle}`, 
          html: hostHtml 
        }),
        resend.emails.send({ 
          from: 'Rentals <noreply@rentalsafrica.com>', 
          to: ADMIN_EMAIL, 
          subject: `Platform Alert: ${data.bookingType} Cancellation`, 
          html: adminHtml 
        })
      ]);

      console.log(`[Email Service] Cancellation broadcast successfully sent for ${data.assetTitle}`);
    } catch (error) {
      console.error('[Email Service] Failed to send Cancellation emails:', error);
    }
  }

  static async sendEmailVerification(data: EmailVerificationPayload) {
    try {
      const html = await render(
        React.createElement(LuxuryEmailTemplate, {
          recipientName: data.firstName,
          role: 'GUEST',
          eventType: 'EMAIL_VERIFICATION',
          otpCode: data.otpCode
        } as any)
      );

      await resend.emails.send({
        from: 'Rentals <noreply@rentalsafrica.com>',
        to: data.to,
        subject: 'Your Rentals Africa Verification Code',
        html: html
      });

      console.log(`[Email Service] Verification OTP sent to ${data.to}`);
    } catch (error) {
      console.error('[Email Service] Failed to send Verification email:', error);
    }
  }

}

