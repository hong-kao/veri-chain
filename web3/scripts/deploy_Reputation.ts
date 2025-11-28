import { ethers } from "hardhat";

async function main() {
    const Reputation = await ethers.getContractFactory("Reputation");
    const reputation = await Reputation.deploy();

    await reputation.waitForDeployment();

    console.log(`Reputation deployed to ${await reputation.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
