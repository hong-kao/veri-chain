import { ethers } from "hardhat";

async function main() {
    // NOTE: This requires ClaimRegistry address. 
    // In a real deployment, we would read this from a config or previous deployment.
    // For now, we'll assume it's passed as an env var or we deploy a fresh one for demo.

    const CLAIM_REGISTRY_ADDRESS = process.env.CLAIM_REGISTRY_ADDRESS;

    if (!CLAIM_REGISTRY_ADDRESS) {
        console.error("Please set CLAIM_REGISTRY_ADDRESS env var");
        return;
    }

    const VerificationMarket = await ethers.getContractFactory("VerificationMarket");
    const market = await VerificationMarket.deploy(CLAIM_REGISTRY_ADDRESS);

    await market.waitForDeployment();

    console.log(`VerificationMarket deployed to ${await market.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
