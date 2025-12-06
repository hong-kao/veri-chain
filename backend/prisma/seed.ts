import { PrismaClient } from '../src/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
    adapter,
    log: ['query', 'info', 'warn', 'error'],
});

// Sample claim statements for diverse testing
const claimStatements = [
    "The Earth is flat and NASA has been hiding the truth for decades.",
    "Drinking 8 glasses of water a day is scientifically proven to improve health.",
    "Vaccines cause autism according to multiple peer-reviewed studies.",
    "Climate change is a natural cycle and not caused by human activity.",
    "5G networks are responsible for the spread of coronavirus.",
    "Eating carrots significantly improves night vision.",
    "The moon landing in 1969 was filmed in a Hollywood studio.",
    "Coffee is proven to prevent Alzheimer's disease and dementia.",
    "Quantum computers will replace traditional computers by 2025.",
    "Wearing a copper bracelet can cure arthritis pain.",
    "The Great Wall of China is visible from space with the naked eye.",
    "Cracking your knuckles causes arthritis in later life.",
    "Lightning never strikes the same place twice.",
    "Reading in dim light damages your eyesight permanently.",
    "Goldfish only have a 3-second memory span.",
    "Humans only use 10% of their brain capacity.",
    "Sugar makes children hyperactive and difficult to control.",
    "Antibiotics are effective against viral infections like the flu.",
    "Electric cars produce zero emissions and are completely carbon-neutral.",
    "The Bermuda Triangle has a mysterious force that causes ships to disappear."
];

// Corresponding verdicts and confidences (mix of true, false, unclear)
const claimData = [
    { verdict: 'false_', confidence: 95.5, explanation: 'Scientific consensus and satellite imagery prove Earth is spherical.' },
    { verdict: 'unclear', confidence: 62.3, explanation: 'While hydration is important, the "8 glasses" rule lacks strong scientific backing.' },
    { verdict: 'false_', confidence: 98.2, explanation: 'Multiple large-scale studies have thoroughly debunked any link between vaccines and autism.' },
    { verdict: 'false_', confidence: 91.7, explanation: 'Scientific evidence overwhelmingly shows human activity as the primary driver of recent climate change.' },
    { verdict: 'false_', confidence: 99.1, explanation: 'No credible scientific evidence supports any connection between 5G and COVID-19.' },
    { verdict: 'unclear', confidence: 58.9, explanation: 'Carrots contain vitamin A which supports eye health, but claims of night vision improvement are exaggerated.' },
    { verdict: 'false_', confidence: 96.4, explanation: 'Extensive evidence including physical samples and third-party verification confirms the moon landing occurred.' },
    { verdict: 'unclear', confidence: 71.2, explanation: 'Some studies show correlation between coffee consumption and reduced dementia risk, but causation is not established.' },
    { verdict: 'false_', confidence: 88.6, explanation: 'Quantum computers serve specialized purposes and will not replace traditional computers by 2025.' },
    { verdict: 'false_', confidence: 93.8, explanation: 'No scientific evidence supports copper bracelets as an effective treatment for arthritis.' },
    { verdict: 'false_', confidence: 87.5, explanation: 'The Great Wall is not visible from space with the naked eye, contrary to popular belief.' },
    { verdict: 'false_', confidence: 89.3, explanation: 'No scientific evidence links knuckle cracking to arthritis development.' },
    { verdict: 'false_', confidence: 92.1, explanation: 'Lightning can and does strike the same location multiple times, especially tall structures.' },
    { verdict: 'false_', confidence: 85.7, explanation: 'Dim lighting may cause eye strain but does not cause permanent damage.' },
    { verdict: 'false_', confidence: 94.6, explanation: 'Research shows goldfish have memory capabilities spanning several months.' },
    { verdict: 'false_', confidence: 97.2, explanation: 'Brain imaging studies show we use virtually all parts of our brain regularly.' },
    { verdict: 'unclear', confidence: 64.8, explanation: 'Studies on sugar and hyperactivity show mixed results; placebo effects may be significant.' },
    { verdict: 'false_', confidence: 96.9, explanation: 'Antibiotics only work against bacterial infections, not viral infections.' },
    { verdict: 'false_', confidence: 83.4, explanation: 'While EVs produce no tailpipe emissions, manufacturing and electricity generation have carbon footprints.' },
    { verdict: 'false_', confidence: 90.2, explanation: 'The Bermuda Triangle has no higher rate of disappearances than other heavily-traveled ocean areas.' }
];

async function main() {
    console.log('🗑️  Wiping database...');

    // Delete all data in reverse order of dependencies
    await prisma.notification.deleteMany();
    await prisma.onchainEvent.deleteMany();
    await prisma.vote.deleteMany();
    await prisma.votingSession.deleteMany();
    await prisma.agentResult.deleteMany();
    await prisma.claim.deleteMany();
    await prisma.user.deleteMany();

    console.log('✅ Database wiped clean!');
    console.log('');
    console.log('👤 Creating test user...');

    // Create a test user as submitter
    const testUser = await prisma.user.create({
        data: {
            wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
            full_name: 'Test User',
            email: 'test@verichain.com',
            reputation_score: 150,
            notif_type: 'standard',
            interests: ['tech', 'health', 'politics']
        }
    });

    console.log(`✅ Created user: ${testUser.full_name}`);
    console.log('');
    console.log('📝 Creating 20 finished claims...');

    // Create 20 claims with various verdicts
    for (let i = 0; i < 20; i++) {
        const data = claimData[i];
        const hoursAgo = Math.floor(Math.random() * 168); // Random time within last week
        const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
        const resolvedAt = new Date(createdAt.getTime() + Math.random() * 24 * 60 * 60 * 1000);

        const claim = await prisma.claim.create({
            data: {
                submitter_id: testUser.id,
                raw_input: claimStatements[i],
                normalized_text: claimStatements[i],
                claim_type: 'text',
                platform: 'other',
                ai_verdict: data.verdict,
                ai_confidence: data.confidence,
                ai_explanation: data.explanation,
                final_verdict: data.verdict,
                final_confidence: data.confidence,
                status: 'resolved',
                created_at: createdAt,
                resolved_at: resolvedAt
            }
        });

        console.log(`  ✓ Claim #${claim.id}: ${data.verdict.toUpperCase()} (${data.confidence}% confidence)`);
    }

    console.log('');
    console.log('🎉 Successfully created 20 finished claims!');
    console.log('');
    console.log('📊 Summary:');
    const totalClaims = await prisma.claim.count();
    const trueClaims = await prisma.claim.count({ where: { ai_verdict: 'true_' } });
    const falseClaims = await prisma.claim.count({ where: { ai_verdict: 'false_' } });
    const unclearClaims = await prisma.claim.count({ where: { ai_verdict: 'unclear' } });

    console.log(`  Total claims: ${totalClaims}`);
    console.log(`  TRUE verdicts: ${trueClaims}`);
    console.log(`  FALSE verdicts: ${falseClaims}`);
    console.log(`  UNCLEAR verdicts: ${unclearClaims}`);
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
