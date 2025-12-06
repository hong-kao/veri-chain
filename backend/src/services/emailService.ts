import nodemailer from 'nodemailer';
import { env } from '../config/env.config.js';
import prisma from '../config/db.config.js';

// Create transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: env.NODEMAILER_USER,
        pass: env.NODEMAILER_PASSWORD
    }
});

// Email template for voting notifications
function createVotingEmailHtml(claimId: number, claimText: string, voteUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #111; color: #fff; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border-radius: 12px; padding: 30px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #fff; }
        .claim-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 20px; margin: 20px 0; }
        .claim-text { font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9); }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .footer { text-align: center; color: rgba(255,255,255,0.5); font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">⚡ VeriChain</div>
            <h2 style="color: #f59e0b;">New Claim Needs Your Vote!</h2>
        </div>
        
        <p>A new claim has been submitted that requires community voting to determine its validity.</p>
        
        <div class="claim-box">
            <p style="color: rgba(255,255,255,0.5); font-size: 12px; margin-bottom: 10px;">CLAIM #${claimId}</p>
            <p class="claim-text">"${claimText.substring(0, 300)}${claimText.length > 300 ? '...' : ''}"</p>
        </div>
        
        <p>Your vote matters! Help the community verify the truth.</p>
        
        <center>
            <a href="${voteUrl}" class="cta-button">Vote Now →</a>
        </center>
        
        <div class="footer">
            <p>You're receiving this because you're a verified voter on VeriChain.</p>
            <p>© 2025 VeriChain - Decentralized Fact Verification</p>
        </div>
    </div>
</body>
</html>
    `;
}

/**
 * Send voting notification emails to all users with email addresses
 */
export async function sendVotingNotifications(
    claimId: number,
    claimText: string,
    excludeUserId?: number
): Promise<{ sent: number; failed: number }> {
    const results = { sent: 0, failed: 0 };

    // Check if email is configured
    if (!env.NODEMAILER_USER || !env.NODEMAILER_PASSWORD) {
        console.log('[EmailService] No email credentials configured, skipping notifications');
        return results;
    }

    try {
        // Get all users with email addresses (exclude the submitter)
        const users = await prisma.user.findMany({
            where: {
                email: { not: null },
                ...(excludeUserId ? { id: { not: excludeUserId } } : {})
            },
            select: {
                id: true,
                email: true,
                full_name: true
            }
        });

        if (users.length === 0) {
            console.log('[EmailService] No users with email addresses found');
            return results;
        }

        console.log(`[EmailService] Sending voting notifications to ${users.length} users...`);

        const voteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/claims`;

        // Send emails to all users
        for (const user of users) {
            if (!user.email) continue;

            try {
                await transporter.sendMail({
                    from: `"VeriChain" <${env.NODEMAILER_USER}>`,
                    to: user.email,
                    subject: `🗳️ New Claim Needs Your Vote - VeriChain`,
                    html: createVotingEmailHtml(claimId, claimText, voteUrl)
                });

                // Record notification in database
                await prisma.notification.create({
                    data: {
                        user_id: user.id,
                        claim_id: claimId,
                        notif_type: 'email',
                        status: 'sent',
                        sent_at: new Date(),
                        payload: JSON.stringify({ type: 'voting_request', claimId })
                    }
                });

                results.sent++;
                console.log(`[EmailService] ✓ Sent to ${user.email}`);
            } catch (error: any) {
                results.failed++;
                console.error(`[EmailService] ✗ Failed to send to ${user.email}:`, error.message);

                // Record failed notification
                await prisma.notification.create({
                    data: {
                        user_id: user.id,
                        claim_id: claimId,
                        notif_type: 'email',
                        status: 'failed',
                        payload: JSON.stringify({ type: 'voting_request', claimId, error: error.message })
                    }
                });
            }
        }

        console.log(`[EmailService] Completed: ${results.sent} sent, ${results.failed} failed`);
        return results;

    } catch (error: any) {
        console.error('[EmailService] Error fetching users:', error.message);
        return results;
    }
}

/**
 * Verify email configuration is working
 */
export async function verifyEmailConfig(): Promise<boolean> {
    if (!env.NODEMAILER_USER || !env.NODEMAILER_PASSWORD) {
        console.log('[EmailService] Email not configured');
        return false;
    }

    try {
        await transporter.verify();
        console.log('[EmailService] Email configuration verified ✓');
        return true;
    } catch (error: any) {
        console.error('[EmailService] Email configuration failed:', error.message);
        return false;
    }
}

export default {
    sendVotingNotifications,
    verifyEmailConfig
};
