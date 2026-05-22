// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MonergeRuns
/// @notice Lightweight on-chain proof layer for Monerge score reveals.
contract MonergeRuns {
    address public immutable owner;
    uint256 public totalRuns;
    bool public paused;

    mapping(bytes32 => bool) public runSubmitted;

    event RunSubmitted(
        address indexed player,
        bytes32 indexed runId,
        uint256 score,
        uint256 actual,
        uint16 maxTile,
        uint16 moves,
        uint8 difficulty,
        bytes32 profileHash,
        uint256 timestamp
    );

    event PauseSet(bool paused);

    error NotOwner();
    error Paused();
    error RunAlreadySubmitted();
    error InvalidRun();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setPaused(bool nextPaused) external onlyOwner {
        paused = nextPaused;
        emit PauseSet(nextPaused);
    }

    function submitRun(
        bytes32 runId,
        uint256 score,
        uint256 actual,
        uint16 maxTile,
        uint16 moves,
        uint8 difficulty,
        bytes32 profileHash
    ) external {
        if (paused) revert Paused();
        if (runId == bytes32(0) || score == 0 || maxTile == 0) revert InvalidRun();
        if (runSubmitted[runId]) revert RunAlreadySubmitted();

        runSubmitted[runId] = true;
        unchecked {
            totalRuns += 1;
        }

        emit RunSubmitted(
            msg.sender,
            runId,
            score,
            actual,
            maxTile,
            moves,
            difficulty,
            profileHash,
            block.timestamp
        );
    }
}
