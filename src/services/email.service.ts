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
  hostEmail: string;
  hostName: string;
  assetTitle: string;
  bookingType: 'SHORTLET' | 'CAR' | 'HOTEL' | 'VIP';
  amount: number;
  datesOrTime: string;
}

interface HostWelcomePayload {
  to: string;
  firstName: string;
  dashboardUrl: string;
}

export class EmailService {
  
  static async sendBookingSuccess(data: NotificationPayload) {
    try {
      const guestHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'GUEST', eventType: 'BOOKING_SUCCESS', recipientName: data.guestName })
      );
      
      const hostHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'HOST', eventType: 'BOOKING_SUCCESS', recipientName: data.hostName })
      );

      const adminHtml = await render(
        React.createElement(LuxuryEmailTemplate, { ...data, role: 'ADMIN', eventType: 'BOOKING_SUCCESS', recipientName: 'Admin Team' })
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

  // --- NEW: SURGICALLY INSERTED HOST WELCOME ---
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
}