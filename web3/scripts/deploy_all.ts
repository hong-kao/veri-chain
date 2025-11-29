import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Deploy ClaimRegistry
    console.log("Deploying ClaimRegistry...");
    const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
    const claimRegistry = await ClaimRegistry.deploy();
    await claimRegistry.waitForDeployment();
    const claimRegistryAddress = await claimRegistry.getAddress();
    console.log("ClaimRegistry deployed to:", claimRegistryAddress);

    // 2. Deploy VerificationMarket
    console.log("Deploying VerificationMarket...");
    const VerificationMarket = await ethers.getContractFactory("VerificationMarket");
    const verificationMarket = await VerificationMarket.deploy(claimRegistryAddress);
    await verificationMarket.waitForDeployment();
    const verificationMarketAddress = await verificationMarket.getAddress();
    console.log("VerificationMarket deployed to:", verificationMarketAddress);

    // 3. Deploy Reputation
    console.log("Deploying Reputation...");
    const Reputation = await ethers.getContractFactory("Reputation");
    const reputation = await Reputation.deploy();
    await reputation.waitForDeployment();
    const reputationAddress = await reputation.getAddress();
    console.log("Reputation deployed to:", reputationAddress);

    // 4. Deploy VerifierBadge
    console.log("Deploying VerifierBadge...");
    const VerifierBadge = await ethers.getContractFactory("VerifierBadge");
    const verifierBadge = await VerifierBadge.deploy();
    await verifierBadge.waitForDeployment();
    const verifierBadgeAddress = await verifierBadge.getAddress();
    console.log("VerifierBadge deployed to:", verifierBadgeAddress);

    // --- Configuration ---
    console.log("Configuring contracts...");

    // Link Reputation to VerificationMarket
    const tx1 = await verificationMarket.setReputation(reputationAddress);
    await tx1.wait();
    console.log("Linked Reputation to VerificationMarket");

    // Authorize VerificationMarket to update Reputation
    const tx2 = await reputation.setAuthorizedUpdater(verificationMarketAddress, true);
    await tx2.wait();
    console.log("Authorized VerificationMarket to update Reputation");

    console.log("\nDeployment Complete! 🚀");
    console.log("----------------------------------------------------");
    console.log(`ClaimRegistry:      ${claimRegistryAddress}`);
    console.log(`VerificationMarket: ${verificationMarketAddress}`);
    console.log(`Reputation:         ${reputationAddress}`);
    console.log(`VerifierBadge:      ${verifierBadgeAddress}`);
    console.log("----------------------------------------------------");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
