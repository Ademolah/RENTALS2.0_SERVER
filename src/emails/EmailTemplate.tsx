import React from 'react';
import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Row, Column
} from '@react-email/components';

interface EmailTemplateProps {
  recipientName: string;
  role: 'GUEST' | 'HOST' | 'ADMIN';
  eventType: 'BOOKING_SUCCESS' | 'ESCROW_RELEASE' | 'HOST_WELCOME';
  assetTitle?: string;
  bookingType?: 'PROPERTY' | 'SHORTLET' | 'CAR' | 'HOTEL' | 'VIP'; 
  amount?: number;
  datesOrTime?: string;
  dashboardUrl?: string; // Added for the welcome email
}

export const LuxuryEmailTemplate: React.FC<EmailTemplateProps> = ({
  recipientName,
  role,
  eventType,
  assetTitle,
  bookingType,
  amount,
  datesOrTime,
  dashboardUrl
}) => {
  const isBooking = eventType === 'BOOKING_SUCCESS';
  const isHostWelcome = eventType === 'HOST_WELCOME';
  
  const getHeadline = () => {
    if (isHostWelcome) return 'Welcome to the portfolio.';
    if (isBooking) {
      if (role === 'GUEST') return 'Reservation Secured.';
      if (role === 'HOST') return 'New Reservation.';
      return 'Platform Booking.';
    } else {
      if (role === 'GUEST') return 'Payment Released.';
      if (role === 'HOST') return 'Payout Authorized.';
      return 'Payment Cleared.';
    }
  };

  const getDisplayCategory = () => {
    switch (bookingType) {
      case 'PROPERTY':
      case 'SHORTLET': return 'Shortlet';
      case 'CAR': return 'Vehicle Rental';
      case 'HOTEL': return 'Hotel Suite';
      case 'VIP': return 'VIP Experience';
      default: return bookingType || 'Asset';
    }
  };

  const getSubtext = () => {
    if (isHostWelcome) return 'Your host application has been reviewed and approved. Your account is now verified, granting you full access to list properties, manage reservations, and curate exceptional experiences for our guests.';
    
    if (isBooking) {
      if (role === 'GUEST') return `Your payment for ${assetTitle} is safely held by Rentals Africa until you arrive.`;
      if (role === 'HOST') return `A guest has secured a reservation for ${assetTitle}. The payment is securely held and will be released upon check-in.`;
      return `A new ${getDisplayCategory()} reservation has been successfully processed.`;
    } else {
      if (role === 'GUEST') return `You have confirmed your arrival at ${assetTitle}. Your secure payment has now been released to the host.`;
      if (role === 'HOST') return `The guest has confirmed their arrival at ${assetTitle}. Your payout of ₦${amount?.toLocaleString()} is now processing.`;
      return `Confirmation handshake complete for ${assetTitle}. Payout authorized.`;
    }
  };

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          
          <Section style={header}>
            <Text style={brandText}>RENTALS AFRICA</Text>
          </Section>

          <Section style={bodyContent}>
            <Text style={greeting}>Hello {recipientName},</Text>
            <Heading style={headline}>{getHeadline()}</Heading>
            <Text style={subtext}>{getSubtext()}</Text>

            {/* Conditionally render the Receipt Details OR the Dashboard Button */}
            {!isHostWelcome ? (
              <Section style={detailsCard}>
                <Row style={detailRow}>
                  <Column><Text style={detailLabel}>Asset</Text></Column>
                  <Column><Text style={detailValue}>{assetTitle}</Text></Column>
                </Row>
                <Hr style={divider} />
                <Row style={detailRow}>
                  <Column><Text style={detailLabel}>Category</Text></Column>
                  <Column><Text style={detailValue}>{getDisplayCategory()}</Text></Column>
                </Row>
                <Hr style={divider} />
                <Row style={detailRow}>
                  <Column><Text style={detailLabel}>Schedule</Text></Column>
                  <Column><Text style={detailValue}>{datesOrTime}</Text></Column>
                </Row>
                <Hr style={divider} />
                <Row style={detailRow}>
                  <Column><Text style={detailLabel}>{isBooking ? 'Secure Deposit' : 'Payout Amount'}</Text></Column>
                  <Column><Text style={amountText}>₦{amount?.toLocaleString()}</Text></Column>
                </Row>
              </Section>
            ) : (
              <Section style={{ textAlign: 'left' }}>
                <a href={dashboardUrl} style={primaryButton}>
                  Access Host Dashboard
                </a>
              </Section>
            )}

            <Text style={footerMessage}>
              {role === 'HOST' && isBooking 
                ? 'Please ensure the asset is ready for the guest. Payment will be released upon guest check-in.'
                : 'Thank you for choosing Rentals Africa. For support, contact your concierge.'}
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerBrand}>© {new Date().getFullYear()} Rentals Africa.</Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
};

// --- STYLES: Monochromatic Editorial Luxury ---
const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' };
const container = { margin: '40px auto', maxWidth: '600px', border: '1px solid #e5e5e5', borderRadius: '0px' };
const header = { padding: '40px 40px 30px', textAlign: 'center' as const, borderBottom: '1px solid #e5e5e5' };
const brandText = { color: '#000000', fontSize: '12px', fontWeight: '700', letterSpacing: '6px', margin: 0, textTransform: 'uppercase' as const };
const bodyContent = { padding: '40px' };
const greeting = { color: '#737373', fontSize: '14px', marginBottom: '16px', fontWeight: '400' };
const headline = { color: '#000000', fontSize: '28px', fontWeight: '400', letterSpacing: '-0.5px', margin: '0 0 12px' };
const subtext = { color: '#525252', fontSize: '15px', lineHeight: '1.6', marginBottom: '40px', fontWeight: '400' };
const detailsCard = { backgroundColor: '#f9f9f9', padding: '32px', border: '1px solid #e5e5e5' };
const detailRow = { padding: '12px 0' };
const detailLabel = { color: '#737373', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '2px', fontWeight: '600', margin: 0 };
const detailValue = { color: '#000000', fontSize: '14px', fontWeight: '500', margin: 0, textAlign: 'right' as const };
const amountText = { color: '#000000', fontSize: '20px', fontWeight: '400', margin: 0, textAlign: 'right' as const, letterSpacing: '-0.5px' };
const divider = { borderColor: '#e5e5e5', margin: '0' };
const footerMessage = { color: '#a3a3a3', fontSize: '13px', lineHeight: '1.6', marginTop: '40px', textAlign: 'center' as const };
const footer = { padding: '0 40px 40px', textAlign: 'center' as const };
const footerBrand = { color: '#a3a3a3', fontSize: '11px', fontWeight: '400', letterSpacing: '1px' };

// Added explicit button style for the welcome email
const primaryButton = { 
  display: 'inline-block', 
  backgroundColor: '#111111', 
  color: '#ffffff', 
  textDecoration: 'none', 
  fontSize: '13px', 
  fontWeight: 'bold', 
  textTransform: 'uppercase' as const, 
  letterSpacing: '1px', 
  padding: '16px 32px', 
  borderRadius: '8px' 
};