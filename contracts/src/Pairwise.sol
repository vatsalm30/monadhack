// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Pairwise: taste markets for creators.
/// @notice A creator posts two artworks. Predictors stake MON on the side the crowd will pick
/// (parimutuel). A separate group of voters commit blind ballots, then reveal. The revealed
/// majority decides the outcome. Winners split the pool minus 7% (5% creator, 2% revealed voters).
contract Pairwise {
    enum Side {
        None,
        A,
        B
    }

    enum Outcome {
        Open,
        A,
        B,
        Refund
    }

    struct Duel {
        address creator;
        uint64 createdAt;
        uint64 commitEnd;
        uint64 revealEnd;
        Outcome outcome;
        bytes32 room;
        bytes32 hashA;
        bytes32 hashB;
        uint128 poolA;
        uint128 poolB;
        uint32 votesA;
        uint32 votesB;
        string uriA;
        string uriB;
        string title;
    }

    struct Position {
        Side side;
        uint128 stake;
        uint64 firstAt;
        bool claimed;
    }

    struct Ballot {
        bytes32 commitment;
        Side revealed;
        bool rewardClaimed;
    }

    uint256 public constant CREATOR_BPS = 500;
    uint256 public constant VOTER_BPS = 200;
    uint256 public constant BPS = 10_000;
    uint64 public constant MIN_COMMIT = 2 minutes;
    uint64 public constant MAX_COMMIT = 7 days;

    uint64 public immutable revealWindow;
    uint32 public immutable minReveals;

    uint256 public duelCount;
    mapping(uint256 => Duel) internal _duels;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(uint256 => mapping(address => Ballot)) public ballots;
    mapping(uint256 => bool) public creatorPaid;
    mapping(address => uint256) public tasteRep;

    event DuelCreated(
        uint256 indexed id,
        address indexed creator,
        bytes32 indexed room,
        string title,
        string uriA,
        string uriB,
        bytes32 hashA,
        bytes32 hashB,
        uint64 commitEnd,
        uint64 revealEnd
    );
    event Predicted(uint256 indexed id, address indexed user, Side side, uint256 amount, uint128 poolA, uint128 poolB);
    event VoteCommitted(uint256 indexed id, address indexed voter);
    event VoteRevealed(uint256 indexed id, address indexed voter, Side side);
    event DuelSettled(uint256 indexed id, Outcome outcome, uint32 votesA, uint32 votesB, uint128 poolA, uint128 poolB);
    event Claimed(uint256 indexed id, address indexed user, uint256 amount, uint256 repGained);
    event VoterRewardClaimed(uint256 indexed id, address indexed voter, uint256 amount);
    event CreatorPaid(uint256 indexed id, address indexed creator, uint256 amount);

    error BadPhase();
    error BadInput();
    error Conflict();
    error AlreadyDone();
    error NothingOwed();
    error TransferFailed();

    constructor(uint64 revealWindow_, uint32 minReveals_) {
        if (revealWindow_ == 0) revert BadInput();
        revealWindow = revealWindow_;
        minReveals = minReveals_;
    }

    // ---------------------------------------------------------------- create

    function createDuel(
        bytes32 room,
        string calldata title,
        string calldata uriA,
        string calldata uriB,
        bytes32 hashA,
        bytes32 hashB,
        uint64 commitDuration
    ) external returns (uint256 id) {
        if (room == bytes32(0) || bytes(title).length == 0) revert BadInput();
        if (bytes(uriA).length == 0 || bytes(uriB).length == 0) revert BadInput();
        if (hashA == bytes32(0) || hashB == bytes32(0) || hashA == hashB) revert BadInput();
        if (commitDuration < MIN_COMMIT || commitDuration > MAX_COMMIT) revert BadInput();

        id = duelCount++;
        uint64 commitEnd = uint64(block.timestamp) + commitDuration;
        uint64 revealEnd = commitEnd + revealWindow;

        Duel storage d = _duels[id];
        d.creator = msg.sender;
        d.createdAt = uint64(block.timestamp);
        d.commitEnd = commitEnd;
        d.revealEnd = revealEnd;
        d.room = room;
        d.hashA = hashA;
        d.hashB = hashB;
        d.uriA = uriA;
        d.uriB = uriB;
        d.title = title;

        emit DuelCreated(id, msg.sender, room, title, uriA, uriB, hashA, hashB, commitEnd, revealEnd);
    }

    // ---------------------------------------------------------------- commit phase

    function predict(uint256 id, Side side) external payable {
        Duel storage d = _commitPhase(id);
        if (side == Side.None || msg.value == 0) revert BadInput();
        if (msg.sender == d.creator) revert Conflict();
        if (ballots[id][msg.sender].commitment != bytes32(0)) revert Conflict();

        Position storage p = positions[id][msg.sender];
        if (p.side == Side.None) {
            p.side = side;
            p.firstAt = uint64(block.timestamp);
        } else if (p.side != side) {
            revert Conflict();
        }
        p.stake += _toU128(msg.value);

        if (side == Side.A) d.poolA += _toU128(msg.value);
        else d.poolB += _toU128(msg.value);

        emit Predicted(id, msg.sender, side, msg.value, d.poolA, d.poolB);
    }

    function commitVote(uint256 id, bytes32 commitment) external {
        Duel storage d = _commitPhase(id);
        if (commitment == bytes32(0)) revert BadInput();
        if (msg.sender == d.creator) revert Conflict();
        if (positions[id][msg.sender].stake != 0) revert Conflict();

        Ballot storage b = ballots[id][msg.sender];
        if (b.commitment != bytes32(0)) revert AlreadyDone();
        b.commitment = commitment;

        emit VoteCommitted(id, msg.sender);
    }

    // ---------------------------------------------------------------- reveal phase

    function revealVote(uint256 id, Side side, bytes32 salt) external {
        Duel storage d = _duel(id);
        if (block.timestamp < d.commitEnd || block.timestamp >= d.revealEnd) revert BadPhase();
        if (side == Side.None) revert BadInput();

        Ballot storage b = ballots[id][msg.sender];
        if (b.commitment == bytes32(0)) revert NothingOwed();
        if (b.revealed != Side.None) revert AlreadyDone();
        if (commitmentFor(id, side, salt, msg.sender) != b.commitment) revert BadInput();

        b.revealed = side;
        if (side == Side.A) d.votesA++;
        else d.votesB++;

        emit VoteRevealed(id, msg.sender, side);
    }

    function commitmentFor(uint256 id, Side side, bytes32 salt, address voter) public pure returns (bytes32) {
        return keccak256(abi.encode(id, side, salt, voter));
    }

    // ---------------------------------------------------------------- settlement

    function settle(uint256 id) external {
        Duel storage d = _duel(id);
        if (block.timestamp < d.revealEnd) revert BadPhase();
        if (d.outcome != Outcome.Open) revert AlreadyDone();

        Outcome outcome;
        uint256 reveals = uint256(d.votesA) + d.votesB;
        if (reveals < minReveals || d.votesA == d.votesB) {
            outcome = Outcome.Refund;
        } else {
            outcome = d.votesA > d.votesB ? Outcome.A : Outcome.B;
            uint256 winPool = outcome == Outcome.A ? d.poolA : d.poolB;
            if (winPool == 0 && uint256(d.poolA) + d.poolB > 0) outcome = Outcome.Refund;
        }
        d.outcome = outcome;

        emit DuelSettled(id, outcome, d.votesA, d.votesB, d.poolA, d.poolB);
    }

    function claim(uint256 id) external {
        Duel storage d = _duel(id);
        Outcome outcome = d.outcome;
        if (outcome == Outcome.Open) revert BadPhase();

        Position storage p = positions[id][msg.sender];
        if (p.stake == 0) revert NothingOwed();
        if (p.claimed) revert AlreadyDone();

        uint256 amount;
        uint256 rep;
        if (outcome == Outcome.Refund) {
            amount = p.stake;
        } else {
            if (uint8(p.side) != uint8(outcome)) revert NothingOwed();
            uint256 pool = uint256(d.poolA) + d.poolB;
            uint256 net = pool - _creatorCut(pool) - _voterCut(pool);
            uint256 winPool = outcome == Outcome.A ? d.poolA : d.poolB;
            amount = uint256(p.stake) * net / winPool;
            rep = 10 + 90 * uint256(d.commitEnd - p.firstAt) / uint256(d.commitEnd - d.createdAt);
            tasteRep[msg.sender] += rep;
        }
        p.claimed = true;

        emit Claimed(id, msg.sender, amount, rep);
        _send(msg.sender, amount);
    }

    function claimVoterReward(uint256 id) external {
        Duel storage d = _duel(id);
        if (d.outcome != Outcome.A && d.outcome != Outcome.B) revert BadPhase();

        Ballot storage b = ballots[id][msg.sender];
        if (b.revealed == Side.None) revert NothingOwed();
        if (b.rewardClaimed) revert AlreadyDone();

        uint256 amount = _voterCut(uint256(d.poolA) + d.poolB) / (uint256(d.votesA) + d.votesB);
        if (amount == 0) revert NothingOwed();
        b.rewardClaimed = true;

        emit VoterRewardClaimed(id, msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// @notice Pays the creator's 5%. Anyone may trigger it; funds always go to the creator.
    function claimCreator(uint256 id) external {
        Duel storage d = _duel(id);
        if (d.outcome != Outcome.A && d.outcome != Outcome.B) revert BadPhase();
        if (creatorPaid[id]) revert AlreadyDone();

        uint256 amount = _creatorCut(uint256(d.poolA) + d.poolB);
        if (amount == 0) revert NothingOwed();
        creatorPaid[id] = true;

        emit CreatorPaid(id, d.creator, amount);
        _send(d.creator, amount);
    }

    // ---------------------------------------------------------------- views

    function getDuel(uint256 id) external view returns (Duel memory) {
        return _duel(id);
    }

    // ---------------------------------------------------------------- internal

    function _duel(uint256 id) internal view returns (Duel storage d) {
        if (id >= duelCount) revert BadInput();
        d = _duels[id];
    }

    function _commitPhase(uint256 id) internal view returns (Duel storage d) {
        d = _duel(id);
        if (block.timestamp >= d.commitEnd) revert BadPhase();
    }

    function _creatorCut(uint256 pool) internal pure returns (uint256) {
        return pool * CREATOR_BPS / BPS;
    }

    function _voterCut(uint256 pool) internal pure returns (uint256) {
        return pool * VOTER_BPS / BPS;
    }

    function _toU128(uint256 x) internal pure returns (uint128) {
        if (x > type(uint128).max) revert BadInput();
        return uint128(x);
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
