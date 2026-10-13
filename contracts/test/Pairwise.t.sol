// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Pairwise} from "../src/Pairwise.sol";

contract PairwiseTest is Test {
    Pairwise internal pw;

    uint64 internal constant REVEAL_WINDOW = 180;
    uint64 internal constant COMMIT = 10 minutes;
    bytes32 internal constant ROOM = bytes32("purdue");

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal v1 = makeAddr("v1");
    address internal v2 = makeAddr("v2");
    address internal v3 = makeAddr("v3");

    function setUp() public {
        pw = new Pairwise(REVEAL_WINDOW, 1);
        address[7] memory who = [creator, alice, bob, carol, v1, v2, v3];
        for (uint256 i; i < who.length; i++) {
            vm.deal(who[i], 100 ether);
        }
    }

    // ---------------------------------------------------------------- helpers

    function _create() internal returns (uint256 id) {
        vm.prank(creator);
        id = pw.createDuel(ROOM, "Sunset study", "https://x/a.png", "https://x/b.png", keccak256("a"), keccak256("b"), COMMIT);
    }

    function _salt(address voter) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", voter));
    }

    function _commit(uint256 id, address voter, Pairwise.Side side) internal {
        // Compute before vm.prank: the external commitmentFor call would otherwise consume the prank.
        bytes32 c = pw.commitmentFor(id, side, _salt(voter), voter);
        vm.prank(voter);
        pw.commitVote(id, c);
    }

    function _reveal(uint256 id, address voter, Pairwise.Side side) internal {
        vm.prank(voter);
        pw.revealVote(id, side, _salt(voter));
    }

    function _predict(uint256 id, address user, Pairwise.Side side, uint256 amount) internal {
        vm.prank(user);
        pw.predict{value: amount}(id, side);
    }

    function _toReveal(uint256 id) internal {
        vm.warp(pw.getDuel(id).commitEnd);
    }

    function _toSettle(uint256 id) internal {
        vm.warp(pw.getDuel(id).revealEnd);
    }

    // ---------------------------------------------------------------- lifecycle

    function test_FullLifecyclePayoutMath() public {
        uint256 id = _create();
        // Pool 4 MON: A has 1 + 1, B has 2.
        _predict(id, alice, Pairwise.Side.A, 1 ether);
        _predict(id, bob, Pairwise.Side.A, 1 ether);
        _predict(id, carol, Pairwise.Side.B, 2 ether);
        _commit(id, v1, Pairwise.Side.A);
        _commit(id, v2, Pairwise.Side.A);
        _commit(id, v3, Pairwise.Side.B);

        Pairwise.Duel memory d = pw.getDuel(id);
        assertEq(d.poolA, 2 ether);
        assertEq(d.poolB, 2 ether);

        _toReveal(id);
        _reveal(id, v1, Pairwise.Side.A);
        _reveal(id, v2, Pairwise.Side.A);
        _reveal(id, v3, Pairwise.Side.B);

        _toSettle(id);
        pw.settle(id);
        assertEq(uint8(pw.getDuel(id).outcome), uint8(Pairwise.Outcome.A));

        // 7% fees on 4 MON = 0.28; net 3.72 split across 2 MON of winning stake.
        uint256 before = alice.balance;
        vm.prank(alice);
        pw.claim(id);
        assertEq(alice.balance - before, 1.86 ether);

        before = bob.balance;
        vm.prank(bob);
        pw.claim(id);
        assertEq(bob.balance - before, 1.86 ether);

        vm.prank(carol);
        vm.expectRevert(Pairwise.NothingOwed.selector);
        pw.claim(id);

        before = creator.balance;
        pw.claimCreator(id);
        assertEq(creator.balance - before, 0.2 ether);
        vm.expectRevert(Pairwise.AlreadyDone.selector);
        pw.claimCreator(id);

        vm.prank(alice);
        vm.expectRevert(Pairwise.AlreadyDone.selector);
        pw.claim(id);
    }

    function test_VoterRewardSplit() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.A, 3 ether);
        _commit(id, v1, Pairwise.Side.A);
        _commit(id, v2, Pairwise.Side.A);
        _commit(id, v3, Pairwise.Side.B);
        _toReveal(id);
        _reveal(id, v1, Pairwise.Side.A);
        _reveal(id, v2, Pairwise.Side.A);
        _reveal(id, v3, Pairwise.Side.B);
        _toSettle(id);
        pw.settle(id);

        // 2% of 3 MON = 0.06, split across 3 revealed voters, losing side included.
        address[3] memory voters = [v1, v2, v3];
        for (uint256 i; i < 3; i++) {
            uint256 before = voters[i].balance;
            vm.prank(voters[i]);
            pw.claimVoterReward(id);
            assertEq(voters[i].balance - before, 0.02 ether);
        }

        vm.prank(v1);
        vm.expectRevert(Pairwise.AlreadyDone.selector);
        pw.claimVoterReward(id);

        // Committed but never revealed: nothing owed.
        uint256 id2 = _create();
        _predict(id2, alice, Pairwise.Side.A, 1 ether);
        _commit(id2, v1, Pairwise.Side.A);
        _commit(id2, v2, Pairwise.Side.A);
        _toReveal(id2);
        _reveal(id2, v1, Pairwise.Side.A);
        _toSettle(id2);
        pw.settle(id2);
        vm.prank(v2);
        vm.expectRevert(Pairwise.NothingOwed.selector);
        pw.claimVoterReward(id2);
    }

    function test_EarlierCallEarnsMoreRep() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.A, 1 ether); // at createdAt
        vm.warp(block.timestamp + COMMIT / 2);
        _predict(id, bob, Pairwise.Side.A, 1 ether); // halfway
        _commit(id, v1, Pairwise.Side.A);
        _toReveal(id);
        _reveal(id, v1, Pairwise.Side.A);
        _toSettle(id);
        pw.settle(id);

        vm.prank(alice);
        pw.claim(id);
        vm.prank(bob);
        pw.claim(id);

        assertEq(pw.tasteRep(alice), 100);
        assertEq(pw.tasteRep(bob), 55);
        assertGt(pw.tasteRep(alice), pw.tasteRep(bob));
    }

    // ---------------------------------------------------------------- conflicts

    function test_PredictorCannotVote() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.A, 1 ether);
        bytes32 c = pw.commitmentFor(id, Pairwise.Side.A, _salt(alice), alice);
        vm.prank(alice);
        vm.expectRevert(Pairwise.Conflict.selector);
        pw.commitVote(id, c);
    }

    function test_VoterCannotPredict() public {
        uint256 id = _create();
        _commit(id, v1, Pairwise.Side.A);
        vm.prank(v1);
        vm.expectRevert(Pairwise.Conflict.selector);
        pw.predict{value: 1 ether}(id, Pairwise.Side.A);
    }

    function test_CreatorConflict() public {
        uint256 id = _create();
        vm.prank(creator);
        vm.expectRevert(Pairwise.Conflict.selector);
        pw.predict{value: 1 ether}(id, Pairwise.Side.A);

        bytes32 c = pw.commitmentFor(id, Pairwise.Side.A, _salt(creator), creator);
        vm.prank(creator);
        vm.expectRevert(Pairwise.Conflict.selector);
        pw.commitVote(id, c);
    }

    function test_NoHedging() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.A, 1 ether);
        _predict(id, alice, Pairwise.Side.A, 1 ether); // topping up the same side is fine
        vm.prank(alice);
        vm.expectRevert(Pairwise.Conflict.selector);
        pw.predict{value: 1 ether}(id, Pairwise.Side.B);

        (Pairwise.Side side, uint128 stake,,) = pw.positions(id, alice);
        assertEq(uint8(side), uint8(Pairwise.Side.A));
        assertEq(stake, 2 ether);
    }

    function test_OneVotePerAddress() public {
        uint256 id = _create();
        _commit(id, v1, Pairwise.Side.A);
        bytes32 c = pw.commitmentFor(id, Pairwise.Side.B, _salt(v1), v1);
        vm.prank(v1);
        vm.expectRevert(Pairwise.AlreadyDone.selector);
        pw.commitVote(id, c);
    }

    // ---------------------------------------------------------------- reveal

    function test_WrongRevealFails() public {
        uint256 id = _create();
        _commit(id, v1, Pairwise.Side.A);
        _toReveal(id);

        // Wrong side.
        vm.prank(v1);
        vm.expectRevert(Pairwise.BadInput.selector);
        pw.revealVote(id, Pairwise.Side.B, _salt(v1));

        // Wrong salt.
        vm.prank(v1);
        vm.expectRevert(Pairwise.BadInput.selector);
        pw.revealVote(id, Pairwise.Side.A, bytes32(uint256(1)));

        // Someone else replaying v1's reveal.
        vm.prank(v2);
        vm.expectRevert(Pairwise.NothingOwed.selector);
        pw.revealVote(id, Pairwise.Side.A, _salt(v1));

        _reveal(id, v1, Pairwise.Side.A);
        assertEq(pw.getDuel(id).votesA, 1);
    }

    function test_PhaseGuards() public {
        uint256 id = _create();
        _commit(id, v1, Pairwise.Side.A);

        vm.prank(v1);
        vm.expectRevert(Pairwise.BadPhase.selector);
        pw.revealVote(id, Pairwise.Side.A, _salt(v1));

        vm.expectRevert(Pairwise.BadPhase.selector);
        pw.settle(id);

        _toReveal(id);
        vm.prank(alice);
        vm.expectRevert(Pairwise.BadPhase.selector);
        pw.predict{value: 1 ether}(id, Pairwise.Side.A);

        _toSettle(id);
        vm.prank(v1);
        vm.expectRevert(Pairwise.BadPhase.selector);
        pw.revealVote(id, Pairwise.Side.A, _salt(v1));
    }

    // ---------------------------------------------------------------- refunds

    function test_TieRefunds() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.A, 1 ether);
        _predict(id, bob, Pairwise.Side.B, 3 ether);
        _commit(id, v1, Pairwise.Side.A);
        _commit(id, v2, Pairwise.Side.B);
        _toReveal(id);
        _reveal(id, v1, Pairwise.Side.A);
        _reveal(id, v2, Pairwise.Side.B);
        _toSettle(id);
        pw.settle(id);
        assertEq(uint8(pw.getDuel(id).outcome), uint8(Pairwise.Outcome.Refund));

        uint256 before = alice.balance;
        vm.prank(alice);
        pw.claim(id);
        assertEq(alice.balance - before, 1 ether);

        before = bob.balance;
        vm.prank(bob);
        pw.claim(id);
        assertEq(bob.balance - before, 3 ether);
        assertEq(pw.tasteRep(bob), 0);

        vm.expectRevert(Pairwise.BadPhase.selector);
        pw.claimCreator(id);
        vm.prank(v1);
        vm.expectRevert(Pairwise.BadPhase.selector);
        pw.claimVoterReward(id);
    }

    function test_RefundBelowMinReveals() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.A, 1 ether);
        _commit(id, v1, Pairwise.Side.A); // never revealed
        _toSettle(id);
        pw.settle(id);
        assertEq(uint8(pw.getDuel(id).outcome), uint8(Pairwise.Outcome.Refund));
    }

    function test_RefundWhenWinningPoolEmpty() public {
        uint256 id = _create();
        _predict(id, alice, Pairwise.Side.B, 1 ether);
        _commit(id, v1, Pairwise.Side.A);
        _toReveal(id);
        _reveal(id, v1, Pairwise.Side.A);
        _toSettle(id);
        pw.settle(id);
        assertEq(uint8(pw.getDuel(id).outcome), uint8(Pairwise.Outcome.Refund));

        uint256 before = alice.balance;
        vm.prank(alice);
        pw.claim(id);
        assertEq(alice.balance - before, 1 ether);
    }

    function test_SettleOnce() public {
        uint256 id = _create();
        _toSettle(id);
        pw.settle(id);
        vm.expectRevert(Pairwise.AlreadyDone.selector);
        pw.settle(id);
    }

    // ---------------------------------------------------------------- create

    function test_CreateDuelValidation() public {
        vm.startPrank(creator);
        vm.expectRevert(Pairwise.BadInput.selector);
        pw.createDuel(ROOM, "t", "a", "b", keccak256("same"), keccak256("same"), COMMIT);

        vm.expectRevert(Pairwise.BadInput.selector);
        pw.createDuel(ROOM, "t", "a", "b", keccak256("a"), keccak256("b"), 1 minutes);

        vm.expectRevert(Pairwise.BadInput.selector);
        pw.createDuel(ROOM, "t", "a", "b", keccak256("a"), keccak256("b"), 8 days);
        vm.stopPrank();

        uint256 id = _create();
        Pairwise.Duel memory d = pw.getDuel(id);
        assertEq(d.creator, creator);
        assertEq(d.room, ROOM);
        assertEq(d.commitEnd, d.createdAt + COMMIT);
        assertEq(d.revealEnd, d.commitEnd + REVEAL_WINDOW);
        assertEq(pw.duelCount(), 1);

        vm.expectRevert(Pairwise.BadInput.selector);
        pw.getDuel(1);
    }

    function test_CommitmentMatchesAbiEncode() public view {
        bytes32 salt = bytes32(uint256(0xbeef));
        bytes32 expected = keccak256(abi.encode(uint256(7), uint8(2), salt, alice));
        assertEq(pw.commitmentFor(7, Pairwise.Side.B, salt, alice), expected);
    }
}
