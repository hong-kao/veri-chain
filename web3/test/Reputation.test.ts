import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type Contract = any;

describe("Reputation", () => {
    let reputation: Contract;
    let owner: SignerWithAddress;
    let market: SignerWithAddress; // Simulating the market contract
    let user: SignerWithAddress;

    beforeEach(async () => {
        [owner, market, user] = await ethers.getSigners();

        const Reputation = await ethers.getContractFactory("Reputation");
        reputation = await Reputation.deploy();

        // Authorize 'market' to update reputation
        await reputation.setAuthorizedUpdater(market.address, true);
    });

    it("Should update reputation", async () => {
        await reputation.connect(market).updateReputation(user.address, 10);
        expect(await reputation.getReputation(user.address)).to.equal(10);

        await reputation.connect(market).updateReputation(user.address, -5);
        expect(await reputation.getReputation(user.address)).to.equal(5);
    });

    it("Should prevent unauthorized updates", async () => {
        await expect(
            reputation.connect(user).updateReputation(user.address, 100)
        ).to.be.revertedWith("Not authorized");
    });
});
