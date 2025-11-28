import { ethers } from "hardhat";

async function main() {
    const VerifierBadge = await ethers.getContractFactory("VerifierBadge");
    const badge = await VerifierBadge.deploy();

    await badge.waitForDeployment();

    console.log(`VerifierBadge deployed to ${await badge.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
