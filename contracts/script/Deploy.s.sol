// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Pairwise} from "../src/Pairwise.sol";

contract Deploy is Script {
    function run() external returns (Pairwise pw) {
        uint64 revealWindow = uint64(vm.envOr("REVEAL_WINDOW", uint256(180)));
        uint32 minReveals = uint32(vm.envOr("MIN_REVEALS", uint256(1)));

        vm.startBroadcast();
        pw = new Pairwise(revealWindow, minReveals);
        vm.stopBroadcast();

        console.log("Pairwise deployed at", address(pw));
        console.log("revealWindow", revealWindow);
        console.log("minReveals", minReveals);
    }
}
