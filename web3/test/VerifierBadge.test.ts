import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type Contract = any;

describe("VerifierBadge", () => {
    let badge: Contract;
    let owner: any;
    let orchestrator: any;
    let user: any;

    beforeEach(async () => {
        [owner, orchestrator, user] = await ethers.getSigners();

        const VerifierBadge = await ethers.getContractFactory("VerifierBadge");
        badge = await VerifierBadge.deploy();

        await badge.setOrchestrator(orchestrator.address);
    });

    it("Should mint a badge", async () => {
        await badge.connect(orchestrator).mintBadge(user.address, 1, 1); // Season 1, Rank 1
        expect(await badge.balanceOf(user.address)).to.equal(1);

        const metadata = await badge.badgeMetadata(0);
        expect(metadata.seasonId).to.equal(1);
        expect(metadata.rank).to.equal(1);
    });

    it("Should be soulbound (transfer failing)", async () => {
        await badge.connect(orchestrator).mintBadge(user.address, 1, 1);

        await expect(
            badge.connect(user).transferFrom(user.address, owner.address, 0)
        ).to.be.revertedWith("Soulbound: Transfer not allowed");
    });

    it("Should prevent unauthorized minting", async () => {
        await expect(
            badge.connect(user).mintBadge(user.address, 1, 1)
        ).to.be.revertedWith("Only orchestrator or owner");
    });
});
