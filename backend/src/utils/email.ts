import nodemailer from 'nodemailer';
import { env } from '../config/env.config.js';

// Global variable for voting page URL - to be updated with actual frontend URL
export const VOTING_PAGE_URL = "http://localhost:3000/vote"; // Dummy link for now

const transporter = nodemailer.createTransport({
    service: 'gmail', // Or use host/port for other providers
    auth: {
        user: env.NODEMAILER_USER,
        pass: env.NODEMAILER_PASSWORD
    }
});

export interface EmailPayload {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

export const sendEmail = async (emailPayload: EmailPayload) => {
    try {
        if (!env.NODEMAILER_USER || !env.NODEMAILER_PASSWORD) {
            console.warn('⚠️ Nodemailer credentials not found. Skipping email sending.');
            console.log('Would have sent email to:', emailPayload.to);
            console.log('Subject:', emailPayload.subject);
            return;
        }

        const info = await transporter.sendMail({
            from: `"VeriChain Protocol" <${env.NODEMAILER_USER}>`,
            to: emailPayload.to,
            subject: emailPayload.subject,
            text: emailPayload.text,
            html: emailPayload.html,
        });

        console.log(`📧 Email sent: ${info.messageId}`);
    } catch (error) {
        console.error('❌ Error sending email:', error);
        // Don't throw error to avoid breaking the main flow
    }
}