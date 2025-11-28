import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type Contract = any;

describe("ClaimRegistry", () => {
    let registry: Contract;
    let owner: SignerWithAddress;
    let orchestrator: SignerWithAddress;
    let user: SignerWithAddress;

    beforeEach(async () => {
        [owner, orchestrator, user] = await ethers.getSigners();

        const ClaimRegistry = await ethers.getContractFactory("ClaimRegistry");
        registry = await ClaimRegistry.deploy();

        await registry.setOrchestrator(orchestrator.address);
    });

    it("Should register a claim", async () => {
        const uri = "ipfs://QmHash";
        const hash = ethers.keccak256(ethers.toUtf8Bytes("Claim Text"));

        const tx = await registry.connect(user).registerClaim(uri, hash);
        const receipt = await tx.wait();

        const claim = await registry.getClaim(0);
        expect(claim.claimUri).to.equal(uri);
        expect(claim.claimHash).to.equal(hash);
        expect(claim.submitter).to.equal(user.address);
        expect(claim.verdict).to.equal(0); // PENDING
        expect(claim.isResolved).to.be.false;
    });

    it("Should allow orchestrator to resolve a claim", async () => {
        const uri = "ipfs://QmHash";
        const hash = ethers.keccak256(ethers.toUtf8Bytes("Claim Text"));
        await registry.connect(user).registerClaim(uri, hash);

        await registry.connect(orchestrator).resolveClaim(0, 1, 95); // TRUE, 95%

        const claim = await registry.getClaim(0);
        expect(claim.verdict).to.equal(1); // TRUE
        expect(claim.confidence).to.equal(95);
        expect(claim.isResolved).to.be.true;
    });

    it("Should prevent non-orchestrator from resolving", async () => {
        const uri = "ipfs://QmHash";
        const hash = ethers.keccak256(ethers.toUtf8Bytes("Claim Text"));
        await registry.connect(user).registerClaim(uri, hash);

        await expect(
            registry.connect(user).resolveClaim(0, 1, 95)
        ).to.be.revertedWith("Only orchestrator or owner");
    });

    it("Should prevent resolving already resolved claims", async () => {
        const uri = "ipfs://QmHash";
        const hash = ethers.keccak256(ethers.toUtf8Bytes("Claim Text"));
        await registry.connect(user).registerClaim(uri, hash);

        await registry.connect(orchestrator).resolveClaim(0, 1, 95);

        await expect(
            registry.connect(orchestrator).resolveClaim(0, 2, 10)
        ).to.be.revertedWith("Claim already resolved");
    });

    it("Should validate confidence score", async () => {
        const uri = "ipfs://QmHash";
        const hash = ethers.keccak256(ethers.toUtf8Bytes("Claim Text"));
        await registry.connect(user).registerClaim(uri, hash);

        await expect(
            registry.connect(orchestrator).resolveClaim(0, 1, 101)
        ).to.be.revertedWith("Confidence must be 0-100");
    });
});
