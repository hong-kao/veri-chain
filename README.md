# VeriChain: Decentralized Claim Verification with Incentivized Community & AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](https://soliditylang.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org/)

**A Decentralized, Agentic AI-Powered Misinformation Detection Platform**

VeriChain combines agentic AI with community-driven verification to create an immutable, decentralized database of verified information. Built on blockchain technology, it serves as a verification layer that platforms can query via API rather than being a standalone social platform.

## 📸 Screenshots

<table>
  <tr>
    <td align="center">
      <img src="docs/home_page.png" alt="Home Page" width="300"/><br/>
      <b>Home Page</b><br/>
      <em>Beautiful landing with water animation</em>
    </td>
    <td align="center">
      <img src="docs/profile_page.png" alt="Profile Page" width="300"/><br/>
      <b>Profile Dashboard</b><br/>
      <em>Manage account & social profiles</em>
    </td>
    <td align="center">
      <img src="docs/submit_page.png" alt="Submit Claim" width="300"/><br/>
      <b>Submit Claim</b><br/>
      <em>AI-powered claim verification</em>
    </td>
  </tr>
</table>

---

## 🌟 Overview

VeriChain is a decentralized verification protocol combining community consensus, economic incentives, and AI analysis to create a portable verification layer. Rather than building another social platform, VeriChain serves as verification infrastructure that any platform can integrate via API.

### The Problem
- **Verification Gap**: Misinformation spreads before fact-checking catches it. No universal trust mechanism exists across platforms.
- **Incentive Misalignment**: Fact-checkers aren't compensated. Platforms profit from engagement, not accuracy.
- **Fragmentation**: Every platform fact-checks independently, duplicating work and creating inconsistent trust models.

### The Solution
VeriChain creates a decentralized marketplace where specialized AI agents verify claims and communities stake capital to vote on accuracy. Agents earn compensation for accurate work, creating sustainable economic incentives.

## 🚀 How It Works

1. **Claim Submission**: Users stake ETH to submit claims, preventing spam.
2. **AI Verification**: Specialized agents analyze claims (text logic, image authenticity, source credibility, citation accuracy). Each agent gets compensated.
3. **Community Voting**: Users stake ETH to vote TRUE/FALSE. Correct voters earn rewards; incorrect voters lose a small penalty.
4. **Consensus**: Final verdict weighs community votes 70% and AI analysis 30%. If they conflict, result = UNCLEAR.
5. **Immutable Record**: Verdict stored on blockchain. Any platform queries via API instead of fact-checking independently.
6. **Rewards**: Correct voters and accurate agents earn from verification fees. Protocol takes a cut for infrastructure.

## 🏗️ Architecture

### Smart Contracts
- **FactCheckRegistry**: Manages claims, AI analysis, and verdicts
- **StakePool**: Handles token deposits, staking, rewards, and penalties

### Backend Services
- **Express.js API**: RESTful endpoints for claim analysis
- **Gemini AI Integration**: Google's Gemini 2.5 Pro for fact-checking
- **TypeScript**: Full type safety and modern development

### Frontend Application
- **React 19**: Modern UI with hooks and functional components
- **Ethers.js**: Web3 integration for blockchain interactions
- **Tailwind CSS**: Responsive design with gradient themes
- **MetaMask Integration**: Wallet connection and transaction signing

## 📁 Project Structure

```
VeriChain/
├── docs/                        # Documentation and screenshots
│   ├── home_page.png            # Landing page screenshot
│   ├── profile_page.png         # Profile dashboard screenshot
│   └── submit_page.png          # Submit claim page screenshot
│
├── web3/                        # Smart contracts and blockchain logic
│   ├── contracts/               # Solidity smart contracts
│   │   ├── ClaimRegistry.sol    # Claim submission & management
│   │   ├── VerificationMarket.sol # Staking & voting marketplace
│   │   ├── Reputation.sol       # User reputation tracking
│   │   └── VerifierBadge.sol    # NFT badges for verifiers
│   ├── scripts/                 # Deployment scripts
│   │   ├── deploy_all.ts        # Deploy all contracts
│   │   ├── deploy_ClaimRegistry.ts
│   │   ├── deploy_VerificationMarket.ts
│   │   ├── deploy_Reputation.ts
│   │   ├── deploy_VerifierBadge.ts
│   │   └── checkOwner.ts
│   ├── test/                    # Contract tests
│   │   ├── ClaimRegistry.test.ts
│   │   ├── VerificationMarket.test.ts
│   │   ├── Reputation.test.ts
│   │   └── VerifierBadge.test.ts
│   ├── artifacts/               # Compiled contracts
│   ├── typechain-types/         # TypeScript bindings
│   ├── hardhat.config.ts
│   └── package.json
│
├── backend/                     # API server and AI agents
│   ├── src/
│   │   ├── agents/              # AI verification agents
│   │   │   ├── resultAgentOrchestrator.ts  # Main orchestrator
│   │   │   ├── claimIntakeAgent.ts         # Claim preprocessing
│   │   │   ├── citationAgent.ts            # Source citation verification
│   │   │   ├── textForensicsAgent.ts       # Text analysis
│   │   │   ├── mediaForensicsAgent.ts      # Image/video analysis
│   │   │   ├── sourceCredAgent.ts          # Source credibility scoring
│   │   │   ├── socialEvidenceAgent.ts      # Social media evidence
│   │   │   ├── communityRoutingAgent.ts    # Community routing
│   │   │   ├── patternAgent.ts             # Pattern detection
│   │   │   └── scoringAgent.ts             # Final scoring
│   │   ├── routes/              # API endpoints
│   │   │   ├── auth.routes.ts   # Authentication routes
│   │   │   ├── claim.routes.ts  # Claim CRUD operations
│   │   │   └── analyze.routes.ts # AI analysis endpoints
│   │   ├── config/              # Configuration
│   │   │   ├── env.config.ts    # Environment variables
│   │   │   └── db.config.ts     # Database configuration
│   │   ├── services/            # Business logic
│   │   │   └── gemini.service.ts # Google Gemini AI integration
│   │   ├── utils/               # Utility functions
│   │   │   ├── scraper.ts       # Web scraping utilities
│   │   │   ├── socialFetcher.ts # Social media data fetching
│   │   │   ├── email.ts         # Email utilities
│   │   │   └── llm.ts           # LLM helper functions
│   │   ├── abis/                # Contract ABIs
│   │   │   ├── ClaimRegistry.json
│   │   │   ├── VerificationMarket.json
│   │   │   ├── Reputation.json
│   │   │   └── VerifierBadge.json
│   │   ├── types/               # TypeScript definitions
│   │   │   ├── agent.types.ts
│   │   │   └── index.ts
│   │   ├── middleware/          # Express middleware
│   │   └── index.ts             # Express server entry
│   ├── prisma/                  # Database ORM
│   │   └── schema.prisma        # Database schema
│   ├── uploads/                 # File uploads directory
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/                    # React frontend application
    ├── src/
    │   ├── components/          # Reusable UI components
    │   │   ├── Nav.tsx          # Landing page navigation
    │   │   ├── AppNav.tsx       # In-app navigation sidebar
    │   │   ├── WaterCanvas.tsx  # Animated water background
    │   │   ├── WaterFillLoader.tsx # Page loading animation
    │   │   ├── TerminalLoader.tsx  # Terminal-style loader
    │   │   ├── ProtectedRoute.tsx  # Auth route guard
    │   │   ├── ErrorBoundary.tsx   # Error handling
    │   │   └── AppFooter.tsx    # Footer component
    │   ├── pages/               # Application pages
    │   │   ├── Home.tsx         # Landing page with water animation
    │   │   ├── Auth.tsx         # Authentication (OAuth/Email/Wallet)
    │   │   ├── Onboarding.tsx   # User onboarding flow
    │   │   ├── Profile.tsx      # Profile dashboard
    │   │   ├── SubmitClaim.tsx  # Chat-based claim submission
    │   │   ├── ViewClaims.tsx   # Active/completed claims list
    │   │   ├── ClaimsSubmit.tsx # Alternative claim submission
    │   │   ├── Claims.tsx       # Claims management
    │   │   ├── Dashboard.tsx    # User dashboard
    │   │   ├── Explore.tsx      # Explore trending claims
    │   │   ├── Leaderboard.tsx  # User rankings
    │   │   └── Notifications.tsx # User notifications
    │   ├── context/             # React context providers
    │   │   └── AuthContext.tsx  # Authentication state
    │   ├── services/            # API service layer
    │   │   ├── api.ts           # Backend API client
    │   │   └── walletService.ts # Wallet integration
    │   ├── config/              # Frontend configuration
    │   │   └── contracts.ts     # Contract addresses
    │   ├── styles/              # CSS stylesheets
    │   │   ├── AppPages.css     # Main page styles
    │   │   └── TerminalStyles.css
    │   ├── lib/                 # Utility libraries
    │   │   └── shaders.ts       # WebGL shaders
    │   ├── assets/              # Static assets
    │   ├── App.tsx              # Main application router
    │   ├── App.css              # App-level styles
    │   ├── index.css            # Global styles
    │   └── main.jsx             # React entry point
    ├── public/                  # Static public assets
    ├── index.html               # HTML entry point
    ├── vite.config.js           # Vite configuration
    ├── tailwind.config.js       # Tailwind CSS config
    ├── postcss.config.js        # PostCSS configuration
    └── package.json
```

## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm or yarn
- MetaMask wallet
- Sepolia ETH for testing
- Google Gemini API key

### 1. Clone the Repository
```bash
git clone <repository-url>
cd veriChain
```

### 2. Environment Setup

Create `.env` files in `web3/`, `backend/`, and `frontend/` directories:

**web3/.env**
```env
RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=your_wallet_private_key
```

**backend/.env**
```env
# Server
PORT=8080
NODE_ENV=development

# AI/LLM APIs (Not all are required - see notes in .env.example)
GEMINI_API_KEY=your_gemini_api_key          # Required - Primary AI engine
PERPLEXITY_API_KEY=your_perplexity_key      # Optional - Enhanced search
OPENAI_API_KEY=                              # Optional
DEEPSEEK_API_KEY=                            # Optional
QWEN_API_KEY=                                # Optional

# LangSmith Tracing (Optional - for debugging)
LANGSMITH_TRACING=true
LANGSMITH_ENDPOINT=
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=

# Web Scraping & Search
SCRAPER_API_URL=http://localhost:3000/v1/
BRAVE_API_KEY=
SERP_API_KEY=

# Fact-Checking APIs
GOOGLE_FACTCHECK_API_KEY=
CLAIMBUSTER_API_KEY=
WORDLIFT_API=

# Social Media
NEYNAR_API_KEY=                              # Farcaster integration

# Media Analysis
HIVE_ACCESS_ID=
HIVE_SECRET_KEY=
SIGHTENGINE_API_USER=
SIGHTENGINE_API_SECRET=

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Email
NODEMAILER_USER=
NODEMAILER_PASSWORD=

# Blockchain
RPC_URL=
PRIVATE_KEY=
CLAIM_REGISTRY_ADDRESS=
STAKING_VOTING_ADDRESS=

# Auth
JWT_SECRET=your_jwt_secret
```

> **Note**: Not all API keys are required. See `backend/.env.example` for details on which are actively used.

**frontend/.env**
```env
VITE_API_URL=http://localhost:8080
VITE_CLAIM_REGISTRY_ADDRESS=your_deployed_registry_address
VITE_VERIFICATION_MARKET_ADDRESS=your_deployed_market_address
```

### 3. Smart Contracts Setup

```bash
cd web3
npm install
npx hardhat compile
npx hardhat test
```

### 4. Deploy Contracts

```bash
# Deploy to Sepolia testnet
npx hardhat run scripts/deploy.ts --network sepolia
```

Save the deployed contract addresses for your frontend configuration.

### 5. Backend Setup

```bash
cd ../backend
npm install
npm run build
npm start
```

The backend will start on `http://localhost:3001`

### 6. Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5173`

## 🧪 Testing

### Smart Contract Tests
```bash
cd web3
npx hardhat test
```

### Backend API Tests
```bash
cd backend
# Start the server
npm start

# Test endpoints
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"claim": "The Earth is flat"}'
```

### Frontend Testing
```bash
cd frontend
npm run dev
# Open http://localhost:5173 in your browser
```

## 🛠️ Setup

### Quick Start Commands

```bash
# Clone and install all dependencies
git clone <repository-url>
cd VeriChain

# Backend
cd backend && npm install && npm run build && npm start

# Frontend (new terminal)
cd frontend && npm install && npm run dev

# Smart Contracts (new terminal)
cd web3 && npm install && npx hardhat compile
npx hardhat run scripts/deploy_all.ts --network sepolia
```

## 🔄 Workflow

### AI Verification Agents

VeriChain uses a multi-agent architecture where specialized AI agents analyze claims from different perspectives:

| Agent | Purpose |
|-------|---------|
| **Claim Intake Agent** | Preprocesses and structures incoming claims for analysis |
| **Citation Agent** | Verifies sources and cross-references cited information |
| **Text Forensics Agent** | Analyzes linguistic patterns and logical consistency |
| **Media Forensics Agent** | Detects manipulated images, videos, and audio |
| **Source Credibility Agent** | Evaluates the trustworthiness of information sources |
| **Social Evidence Agent** | Gathers corroborating evidence from social platforms |
| **Community Routing Agent** | Routes claims to appropriate community experts |
| **Pattern Agent** | Identifies known misinformation patterns |
| **Scoring Agent** | Aggregates agent outputs into final confidence score |
| **Result Orchestrator** | Coordinates all agents and produces the final verdict |

### Verification Process

1. **AI Inference**: Claims are processed through our multi-agent system for comprehensive analysis
2. **Community Voting**: When needed, verified community members stake tokens to vote on claim accuracy
3. **Consensus**: Final verdict combines AI confidence score with community consensus
4. **Rewards**: Correct voters earn rewards from their stake, while incorrect voters face penalties
5. **On-Chain Recording**: All verdicts are permanently stored on the blockchain

### Leaderboard & Incentives

- **Rankings**: Users are ranked based on their verification accuracy and participation
- **Rewards**: Winners of votes receive token rewards proportional to their stake
- **NFT Badges**: **Top 5 verifiers** on the leaderboard get minted exclusive Verifier Badge NFTs

## 💰 Business Model

- **Verification Fees**: Per-claim analysis fees
- **Agent Compensation**: Based on accuracy and performance
- **Enterprise API**: Licensing for large-scale integrations
- **Data Access**: Research and analytics for academic institutions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by Team Baked**