import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type Contract = any;

describe("VerificationMarket", () => {
    let registry: Contract;
    let market: Contract;
    let owner: SignerWithAddress;
    let orchestrator: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    beforeEach(async () => {
        [owner, orchestrator, alice, bob] = await ethers.getSigners();

        // Deploy Registry
        const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
        registry = await ClaimRegistry.deploy();
        await registry.setOrchestrator(orchestrator.address);

        // Deploy Market
        const VerificationMarket = await ethers.getContractFactory("VerificationMarket");
        market = await VerificationMarket.deploy(await registry.getAddress());
        await market.setOrchestrator(orchestrator.address);

        // Register a claim
        await registry.connect(alice).registerClaim("ipfs://test", ethers.keccak256(ethers.toUtf8Bytes("test")));
    });

    it("Should allow deposits", async () => {
        await market.connect(alice).deposit({ value: ethers.parseEther("10") });
        expect(await market.balances(alice.address)).to.equal(ethers.parseEther("10"));
    });

    it("Should allow voting on open markets", async () => {
        await market.connect(orchestrator).openVoting(0);
        await market.connect(alice).deposit({ value: ethers.parseEther("10") });

        await market.connect(alice).vote(0, true, ethers.parseEther("5"));

        const m = await market.markets(0);
        expect(m.stakesFor).to.equal(ethers.parseEther("5"));
        expect(await market.lockedBalances(alice.address)).to.equal(ethers.parseEther("5"));
    });

    it("Should settle and distribute rewards (TRUE verdict)", async () => {
        // Setup
        await market.connect(orchestrator).openVoting(0);

        // Alice votes TRUE (Winner)
        await market.connect(alice).deposit({ value: ethers.parseEther("100") });
        await market.connect(alice).vote(0, true, ethers.parseEther("50"));

        // Bob votes FALSE (Loser)
        await market.connect(bob).deposit({ value: ethers.parseEther("100") });
        await market.connect(bob).vote(0, false, ethers.parseEther("50"));

        // Resolve Claim as TRUE
        await registry.connect(orchestrator).resolveClaim(0, 1, 90); // TRUE

        // Settle
        await market.connect(orchestrator).settleClaim(0);

        // Claim Rewards - Alice
        const aliceBalanceBefore = await market.balances(alice.address); // 100
        // Alice staked 50. Locked 50. Available 50.
        // Reward: 10% of 50 = 5.
        // Unlock 50.
        // New Balance = 100 + 5 = 105.
        await market.connect(alice).claimReward(0);
        expect(await market.balances(alice.address)).to.equal(ethers.parseEther("105"));

        // Claim Rewards - Bob
        // Bob staked 50.
        // Penalty: 50% of 50 = 25.
        // Unlock 50.
        // New Balance = 100 - 25 = 75.
        await market.connect(bob).claimReward(0);
        expect(await market.balances(bob.address)).to.equal(ethers.parseEther("75"));
    });
});
