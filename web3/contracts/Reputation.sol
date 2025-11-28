// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract Reputation {
    mapping(address => int256) public scores;
    address public owner;
    address public orchestrator;
    mapping(address => bool) public authorizedUpdaters;

    event ReputationUpdated(address indexed user, int256 newScore, int256 delta);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == orchestrator || authorizedUpdaters[msg.sender], "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        orchestrator = msg.sender;
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
    }

    function setAuthorizedUpdater(address _updater, bool _authorized) external onlyOwner {
        authorizedUpdaters[_updater] = _authorized;
    }

    function updateReputation(address _user, int256 _delta) external onlyAuthorized {
        scores[_user] += _delta;
        emit ReputationUpdated(_user, scores[_user], _delta);
    }

    function getReputation(address _user) external view returns (int256) {
        return scores[_user];
    }
}
