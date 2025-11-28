// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

interface IClaimRegistry {
    enum Verdict { PENDING, TRUE, FALSE, UNCLEAR }
    struct Claim {
        uint256 id;
        string claimUri;
        bytes32 claimHash;
        address submitter;
        uint256 timestamp;
        Verdict verdict;
        uint8 confidence;
        bool isResolved;
    }
    function getClaim(uint256 _id) external view returns (Claim memory);
}

interface IReputation {
    function updateReputation(address _user, int256 _delta) external;
}

contract VerificationMarket {
    IClaimRegistry public claimRegistry;
    IReputation public reputation;
    address public owner;
    address public orchestrator;

    struct Market {
        bool isOpen;
        uint256 stakesFor;
        uint256 stakesAgainst;
        uint256 totalStakes;
        mapping(address => uint256) userStakesFor;
        mapping(address => uint256) userStakesAgainst;
        bool isSettled;
    }

    mapping(uint256 => Market) public markets;
    mapping(address => uint256) public balances;
    mapping(address => uint256) public lockedBalances;

    event MarketOpened(uint256 indexed claimId);
    event Voted(uint256 indexed claimId, address indexed voter, bool support, uint256 amount);
    event ClaimSettled(uint256 indexed claimId, uint256 totalRewards, uint256 totalPenalties);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator || msg.sender == owner, "Only orchestrator or owner");
        _;
    }

    constructor(address _claimRegistry) {
        owner = msg.sender;
        orchestrator = msg.sender;
        claimRegistry = IClaimRegistry(_claimRegistry);
    }

    function setReputation(address _reputation) external onlyOwner {
        reputation = IReputation(_reputation);
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
    }

    function deposit() external payable {
        require(msg.value > 0, "Amount > 0");
        balances[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 _amount) external {
        require(balances[msg.sender] >= _amount, "Insufficient balance");
        require(balances[msg.sender] - lockedBalances[msg.sender] >= _amount, "Funds locked");
        
        balances[msg.sender] -= _amount;
        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Transfer failed");
        
        emit Withdraw(msg.sender, _amount);
    }

    function openVoting(uint256 _claimId) external onlyOrchestrator {
        require(!markets[_claimId].isOpen, "Already open");
        // Verify claim exists
        claimRegistry.getClaim(_claimId); 
        
        markets[_claimId].isOpen = true;
        emit MarketOpened(_claimId);
    }

    function vote(uint256 _claimId, bool _support, uint256 _amount) external {
        require(markets[_claimId].isOpen, "Voting not open");
        require(balances[msg.sender] - lockedBalances[msg.sender] >= _amount, "Insufficient available balance");
        require(_amount > 0, "Amount > 0");

        lockedBalances[msg.sender] += _amount;
        
        Market storage market = markets[_claimId];
        market.totalStakes += _amount;
        
        if (_support) {
            market.stakesFor += _amount;
            market.userStakesFor[msg.sender] += _amount;
        } else {
            market.stakesAgainst += _amount;
            market.userStakesAgainst[msg.sender] += _amount;
        }

        emit Voted(_claimId, msg.sender, _support, _amount);
    }

    function settleClaim(uint256 _claimId) external onlyOrchestrator {
        Market storage market = markets[_claimId];
        require(market.isOpen, "Market not open");
        require(!market.isSettled, "Already settled");

        IClaimRegistry.Claim memory claim = claimRegistry.getClaim(_claimId);
        require(claim.isResolved, "Claim not resolved in registry");

        market.isOpen = false;
        market.isSettled = true;

        // Logic: 
        // If Verdict TRUE: stakesFor win, stakesAgainst lose.
        // If Verdict FALSE: stakesAgainst win, stakesFor lose.
        // If Verdict UNCLEAR: everyone gets refund.

        // We can't iterate all users in O(1). 
        // So we just update the market state. Users must claim individually?
        // Or we assume the orchestrator passes a list of winners? 
        // For simplicity in this hackathon version, let's implement a 'claimReward' function for users 
        // similar to what I did in FactCheckRegistry, but here.
        
        // Wait, 'settleClaim' usually implies finalization. 
        // The user requirement says "distributes rewards/penalties".
        // Doing it in one go is gas expensive if many voters.
        // I'll stick to the 'claimReward' pattern for scalability, 
        // but 'settleClaim' will mark the market as ready for claiming.
        
        // However, to update reputation, we might need to know who voted correctly.
        // If we want to update reputation ON CHAIN, we need to do it when they claim.
        
        emit ClaimSettled(_claimId, 0, 0); // Actual amounts calculated on claim
    }

    function claimReward(uint256 _claimId) external {
        Market storage market = markets[_claimId];
        require(market.isSettled, "Not settled");
        
        IClaimRegistry.Claim memory claim = claimRegistry.getClaim(_claimId);
        
        uint256 userStakeFor = market.userStakesFor[msg.sender];
        uint256 userStakeAgainst = market.userStakesAgainst[msg.sender];
        
        require(userStakeFor > 0 || userStakeAgainst > 0, "No stake");

        uint256 reward = 0;
        uint256 penalty = 0;
        int256 reputationDelta = 0;

        // Reset stakes so they can't claim twice
        market.userStakesFor[msg.sender] = 0;
        market.userStakesAgainst[msg.sender] = 0;
        
        // Unlock the original stake amount first
        lockedBalances[msg.sender] -= (userStakeFor + userStakeAgainst);

        if (claim.verdict == IClaimRegistry.Verdict.UNCLEAR) {
            // Refund all
            // No reward, no penalty
        } else if (claim.verdict == IClaimRegistry.Verdict.TRUE) {
            if (userStakeFor > 0) {
                // Winner
                // Simple reward: 10% of stake (minted/from pool) or share of losers?
                // For hackathon: 10% inflation reward for simplicity
                reward = userStakeFor / 10;
                balances[msg.sender] += reward;
                reputationDelta += 10;
            }
            if (userStakeAgainst > 0) {
                // Loser
                penalty = userStakeAgainst / 2; // Lose 50%
                balances[msg.sender] -= penalty;
                reputationDelta -= 10;
            }
        } else if (claim.verdict == IClaimRegistry.Verdict.FALSE) {
            if (userStakeAgainst > 0) {
                // Winner
                reward = userStakeAgainst / 10;
                balances[msg.sender] += reward;
                reputationDelta += 10;
            }
            if (userStakeFor > 0) {
                // Loser
                penalty = userStakeFor / 2;
                balances[msg.sender] -= penalty;
                reputationDelta -= 10;
            }
        }

        if (address(reputation) != address(0) && reputationDelta != 0) {
            reputation.updateReputation(msg.sender, reputationDelta);
        }
    }
}
