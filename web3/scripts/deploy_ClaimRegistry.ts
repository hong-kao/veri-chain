import { ethers } from "hardhat";

async function main() {
    const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
    const registry = await ClaimRegistry.deploy();

    await registry.waitForDeployment();

    console.log(`ClaimRegistry deployed to ${await registry.getAddress()}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
