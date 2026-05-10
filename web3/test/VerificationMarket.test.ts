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

        const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
        registry = await ClaimRegistry.deploy();
        await registry.setOrchestrator(orchestrator.address);

        const VerificationMarket = await ethers.getContractFactory("VerificationMarket");
        market = await VerificationMarket.deploy(await registry.getAddress());
        await market.setOrchestrator(orchestrator.address);

        // register a claim
        await registry.connect(alice).registerClaim("ipfs://test", ethers.keccak256(ethers.toUtf8Bytes("test")));
    });

    it("should allow deposits", async () => {
        await market.connect(alice).deposit({ value: ethers.parseEther("10") });
        expect(await market.balances(alice.address)).to.equal(ethers.parseEther("10"));
    });

    it("should allow voting on open markets", async () => {
        await market.connect(orchestrator).openVoting(0);
        await market.connect(alice).deposit({ value: ethers.parseEther("10") });
        await market.connect(alice).vote(0, true, ethers.parseEther("5"));

        const m = await market.markets(0);
        expect(m.stakesFor).to.equal(ethers.parseEther("5"));
        expect(await market.lockedBalances(alice.address)).to.equal(ethers.parseEther("5"));
    });

    // proportional reward math:
    // alice stakes 50 for TRUE, bob stakes 50 against (for FALSE).
    // verdict is TRUE.
    // winPool = 50, losePool = 50.
    // alice reward = 50 + (50 * 50 / 50) = 100. balance: 50 unused + 100 = 150.
    // bob gets nothing. balance stays at 50 unused.
    it("should distribute rewards proportionally (TRUE verdict)", async () => {
        await market.connect(orchestrator).openVoting(0);

        await market.connect(alice).deposit({ value: ethers.parseEther("100") });
        await market.connect(alice).vote(0, true, ethers.parseEther("50"));

        await market.connect(bob).deposit({ value: ethers.parseEther("100") });
        await market.connect(bob).vote(0, false, ethers.parseEther("50"));

        // resolve TRUE
        await registry.connect(orchestrator).resolveClaim(0, 1, 90);
        await market.connect(orchestrator).settleClaim(0);

        // alice: deposited 100, staked 50 (locked, not subtracted from balances).
        // after claim: 100 (existing) + 100 (stake 50 + full losePool share 50) = 200
        await market.connect(alice).claimReward(0);
        expect(await market.balances(alice.address)).to.equal(ethers.parseEther("200"));

        // bob: deposited 100, staked 50. lost -- gets nothing back.
        // balances stays at 100 (the 50 staked was locked, now just stays lost in contract)
        await market.connect(bob).claimReward(0);
        expect(await market.balances(bob.address)).to.equal(ethers.parseEther("100"));
    });

    // mirror case: alice votes FALSE (wrong), bob votes TRUE (wait no -- let's do FALSE verdict)
    // alice stakes 40 against (for FALSE), bob stakes 60 against (for FALSE), charlie votes for TRUE.
    // use simple 2-party case for FALSE verdict.
    it("should distribute rewards proportionally (FALSE verdict)", async () => {
        await market.connect(orchestrator).openVoting(0);

        // alice bets FALSE (against)
        await market.connect(alice).deposit({ value: ethers.parseEther("100") });
        await market.connect(alice).vote(0, false, ethers.parseEther("40"));

        // bob bets TRUE (for) -- the loser
        await market.connect(bob).deposit({ value: ethers.parseEther("100") });
        await market.connect(bob).vote(0, true, ethers.parseEther("60"));

        // resolve FALSE
        await registry.connect(orchestrator).resolveClaim(0, 2, 85);
        await market.connect(orchestrator).settleClaim(0);

        // alice won: winPool=40, losePool=60
        // reward = 40 + (60 * 40 / 40) = 40 + 60 = 100.
        // balance: 100 (existing deposit, stake only locked) + 100 (reward) = 200
        await market.connect(alice).claimReward(0);
        expect(await market.balances(alice.address)).to.equal(ethers.parseEther("200"));

        // bob lost: gets nothing. balance stays at 100 (100 deposited, 60 just forfeited from lock)
        await market.connect(bob).claimReward(0);
        expect(await market.balances(bob.address)).to.equal(ethers.parseEther("100"));
    });

    it("should refund everyone on UNCLEAR verdict", async () => {
        await market.connect(orchestrator).openVoting(0);

        await market.connect(alice).deposit({ value: ethers.parseEther("100") });
        await market.connect(alice).vote(0, true, ethers.parseEther("50"));

        await market.connect(bob).deposit({ value: ethers.parseEther("100") });
        await market.connect(bob).vote(0, false, ethers.parseEther("50"));

        // resolve UNCLEAR (verdict enum index 3)
        await registry.connect(orchestrator).resolveClaim(0, 3, 50);
        await market.connect(orchestrator).settleClaim(0);

        // both get full refund -- staked amounts returned on top of existing balance.
        // alice: 100 (deposit) + 50 (refunded stake) = 150
        // bob:   100 (deposit) + 50 (refunded stake) = 150
        await market.connect(alice).claimReward(0);
        expect(await market.balances(alice.address)).to.equal(ethers.parseEther("150"));

        await market.connect(bob).claimReward(0);
        expect(await market.balances(bob.address)).to.equal(ethers.parseEther("150"));
    });

    it("should prevent double claiming", async () => {
        await market.connect(orchestrator).openVoting(0);

        await market.connect(alice).deposit({ value: ethers.parseEther("100") });
        await market.connect(alice).vote(0, true, ethers.parseEther("50"));

        await market.connect(bob).deposit({ value: ethers.parseEther("100") });
        await market.connect(bob).vote(0, false, ethers.parseEther("50"));

        await registry.connect(orchestrator).resolveClaim(0, 1, 90);
        await market.connect(orchestrator).settleClaim(0);

        await market.connect(alice).claimReward(0);
        // second claim should revert -- no stake remaining
        await expect(market.connect(alice).claimReward(0)).to.be.revertedWith("No stake");
    });
});
