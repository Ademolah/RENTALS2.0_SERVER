import React from 'react';
import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Img, Row, Column
} from '@react-email/components';

interface EmailTemplateProps {
  recipientName: string;
  role: 'GUEST' | 'HOST' | 'ADMIN';
  eventType: 'BOOKING_SUCCESS' | 'ESCROW_RELEASE';
  assetTitle: string;
  bookingType: 'SHORTLET' | 'CAR' | 'HOTEL' | 'VIP';
  amount: number;
  datesOrTime: string;
}

export const LuxuryEmailTemplate: React.FC<EmailTemplateProps> = ({
  recipientName,
  role,
  eventType,
  assetTitle,
  bookingType,
  amount,
  datesOrTime
}) => {
  const isBooking = eventType === 'BOOKING_SUCCESS';
  
  // Dynamic Messaging Engine
  const getHeadline = () => {
    if (isBooking) {
      if (role === 'GUEST') return 'Reservation Secured.';
      if (role === 'HOST') return 'New Reservation.';
      return 'New Platform Booking.';
    } else {
      if (role === 'GUEST') return 'Escrow Released.';
      if (role === 'HOST') return 'Payout Authorized.';
      return 'Escrow Cleared.';
    }
  };

  const getSubtext = () => {
    if (isBooking) {
      if (role === 'GUEST') return `Your deposit for ${assetTitle} is securely held in escrow until your arrival.`;
      if (role === 'HOST') return `A new guest has secured a reservation for ${assetTitle}. The funds are locked in escrow.`;
      return `A new ${bookingType} reservation has been successfully processed.`;
    } else {
      if (role === 'GUEST') return `You have confirmed your arrival at ${assetTitle}. The escrow hold has been released to the host.`;
      if (role === 'HOST') return `The guest has confirmed their arrival at ${assetTitle}. Your payout of ₦${amount.toLocaleString()} is now processing.`;
      return `Escrow double-handshake complete for ${assetTitle}. Payout authorized.`;
    }
  };

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          
          <Section style={header}>
            <Text style={brandText}>RENTALS LUXURY</Text>
          </Section>

          <Section style={bodyContent}>
            <Text style={greeting}>Hello {recipientName},</Text>
            <Heading style={headline}>{getHeadline()}</Heading>
            <Text style={subtext}>{getSubtext()}</Text>

            <Section style={detailsCard}>
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Asset</Text></Column>
                <Column><Text style={detailValue}>{assetTitle}</Text></Column>
              </Row>
              <Hr style={divider} />
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Category</Text></Column>
                <Column><Text style={detailValue}>{bookingType}</Text></Column>
              </Row>
              <Hr style={divider} />
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>Schedule</Text></Column>
                <Column><Text style={detailValue}>{datesOrTime}</Text></Column>
              </Row>
              <Hr style={divider} />
              <Row style={detailRow}>
                <Column><Text style={detailLabel}>{isBooking ? 'Escrow Deposit' : 'Payout Amount'}</Text></Column>
                <Column><Text style={amountText}>₦{amount.toLocaleString()}</Text></Column>
              </Row>
            </Section>

            <Text style={footerText}>
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

// --- STYLES (Inline CSS mapping for email clients) ---
const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' };
const container = { backgroundColor: '#ffffff', margin: '40px auto', borderRadius: '12px', overflow: 'hidden', maxWidth: '600px', border: '1px solid #eaeaea' };
const header = { backgroundColor: '#0a0a0a', padding: '30px 40px', textAlign: 'center' as const };
const brandText = { color: '#ffffff', fontSize: '14px', fontWeight: '800', letterSpacing: '4px', margin: 0 };
const bodyContent = { padding: '40px' };
const greeting = { color: '#666666', fontSize: '14px', marginBottom: '8px' };
const headline = { color: '#0a0a0a', fontSize: '32px', fontWeight: '900', letterSpacing: '-1px', margin: '0 0 16px', lineHeight: '1.2' };
const subtext = { color: '#444444', fontSize: '16px', lineHeight: '1.6', marginBottom: '32px' };
const detailsCard = { backgroundColor: '#fafafa', borderRadius: '8px', padding: '24px', border: '1px solid #eaeaea' };
const detailRow = { padding: '8px 0' };
const detailLabel = { color: '#888888', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '1px', fontWeight: '700', margin: 0 };
const detailValue = { color: '#0a0a0a', fontSize: '14px', fontWeight: '600', margin: 0, textAlign: 'right' as const };
const amountText = { color: '#0a0a0a', fontSize: '18px', fontWeight: '900', margin: 0, textAlign: 'right' as const };
const divider = { borderColor: '#eaeaea', margin: '12px 0' };
const footerText = { color: '#666666', fontSize: '14px', lineHeight: '1.6', marginTop: '32px' };
const footer = { backgroundColor: '#fafafa', padding: '24px 40px', borderTop: '1px solid #eaeaea', textAlign: 'center' as const };
const footerBrand = { color: '#999999', fontSize: '12px', fontWeight: '600', letterSpacing: '1px' };