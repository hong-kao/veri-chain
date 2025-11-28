// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract ClaimRegistry {
    enum Verdict { PENDING, TRUE, FALSE, UNCLEAR }

    struct Claim {
        uint256 id;
        string claimUri; // IPFS CID or URL to full claim details
        bytes32 claimHash; // Hash of the claim text for verification
        address submitter;
        uint256 timestamp;
        Verdict verdict;
        uint8 confidence;
        bool isResolved;
    }

    mapping(uint256 => Claim) public claims;
    uint256 public claimCount = 0;
    address public owner;
    address public orchestrator;

    event ClaimRegistered(uint256 indexed id, string claimUri, bytes32 claimHash, address indexed submitter);
    event ClaimResolved(uint256 indexed id, Verdict verdict, uint8 confidence);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator || msg.sender == owner, "Only orchestrator or owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        orchestrator = msg.sender; // Default to owner, can be updated
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
    }

    function registerClaim(string memory _claimUri, bytes32 _claimHash) external returns (uint256) {
        uint256 id = claimCount++;
        
        claims[id] = Claim({
            id: id,
            claimUri: _claimUri,
            claimHash: _claimHash,
            submitter: msg.sender,
            timestamp: block.timestamp,
            verdict: Verdict.PENDING,
            confidence: 0,
            isResolved: false
        });

        emit ClaimRegistered(id, _claimUri, _claimHash, msg.sender);
        return id;
    }

    function resolveClaim(uint256 _id, Verdict _verdict, uint8 _confidence) external onlyOrchestrator {
        require(_id < claimCount, "Invalid claim ID");
        require(!claims[_id].isResolved, "Claim already resolved");
        require(_confidence <= 100, "Confidence must be 0-100");

        Claim storage claim = claims[_id];
        claim.verdict = _verdict;
        claim.confidence = _confidence;
        claim.isResolved = true;

        emit ClaimResolved(_id, _verdict, _confidence);
    }

    function getClaim(uint256 _id) external view returns (Claim memory) {
        require(_id < claimCount, "Invalid claim ID");
        return claims[_id];
    }
}