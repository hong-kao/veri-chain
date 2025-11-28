// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VerifierBadge is ERC721, Ownable {
    uint256 public nextTokenId;
    address public orchestrator;

    struct BadgeMetadata {
        uint256 seasonId;
        uint256 rank; // 1 = Gold, 2 = Silver, etc.
    }

    mapping(uint256 => BadgeMetadata) public badgeMetadata;

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator || msg.sender == owner(), "Only orchestrator or owner");
        _;
    }

    constructor() ERC721("VeriChain Badge", "VCB") Ownable(msg.sender) {
        orchestrator = msg.sender;
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
    }

    function mintBadge(address _to, uint256 _seasonId, uint256 _rank) external onlyOrchestrator {
        uint256 tokenId = nextTokenId++;
        _safeMint(_to, tokenId);
        badgeMetadata[tokenId] = BadgeMetadata(_seasonId, _rank);
    }

    // Soulbound: Prevent transfers
    function transferFrom(address from, address to, uint256 tokenId) public override(ERC721) {
        revert("Soulbound: Transfer not allowed");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public override(ERC721) {
        revert("Soulbound: Transfer not allowed");
    }
}
