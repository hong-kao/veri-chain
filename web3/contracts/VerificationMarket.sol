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
    event ClaimSettled(uint256 indexed claimId);
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

        // settlement only marks the market as resolved.
        // each voter calls claimReward() individually (pull pattern).
        // this avoids o(n) gas iteration over all voters.
        emit ClaimSettled(_claimId);
    }

    // voters call this to collect their outcome after settlement.
    //
    // winners: get stake back + proportional share of the losing pool.
    //   reward = userStake + (losePool * userStake / winPool)
    //
    // losers: get nothing -- their stake stays in the contract as the prize pool.
    //
    // unclear verdict: everyone gets a full refund.
    function claimReward(uint256 _claimId) external {
        Market storage market = markets[_claimId];
        require(market.isSettled, "Not settled");

        IClaimRegistry.Claim memory claim = claimRegistry.getClaim(_claimId);

        uint256 userStakeFor = market.userStakesFor[msg.sender];
        uint256 userStakeAgainst = market.userStakesAgainst[msg.sender];

        require(userStakeFor > 0 || userStakeAgainst > 0, "No stake");

        // reset before any balance changes -- reentrancy protection
        market.userStakesFor[msg.sender] = 0;
        market.userStakesAgainst[msg.sender] = 0;
        lockedBalances[msg.sender] -= (userStakeFor + userStakeAgainst);

        if (claim.verdict == IClaimRegistry.Verdict.UNCLEAR) {
            // full refund -- nothing redistributed
            balances[msg.sender] += (userStakeFor + userStakeAgainst);
            return;
        }

        bool verdictTrue = claim.verdict == IClaimRegistry.Verdict.TRUE;
        uint256 userStake = verdictTrue ? userStakeFor    : userStakeAgainst;
        uint256 winPool   = verdictTrue ? market.stakesFor : market.stakesAgainst;
        uint256 losePool  = verdictTrue ? market.stakesAgainst : market.stakesFor;
        bool userWon      = userStake > 0;

        if (userWon) {
            // winner gets stake back + proportional share of the losing pool
            uint256 reward = userStake + (losePool * userStake / winPool);
            balances[msg.sender] += reward;
            if (address(reputation) != address(0)) {
                reputation.updateReputation(msg.sender, 10);
            }
        } else {
            // loser forfeits -- stake stays in contract funding winners
            if (address(reputation) != address(0)) {
                reputation.updateReputation(msg.sender, -10);
            }
        }
    }
}
