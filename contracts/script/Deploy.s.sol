// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Script.sol";
import "../src/AgentTab.sol";

/// forge script script/Deploy.s.sol --rpc-url hashkey --broadcast --private-key $DEPLOYER_PK
contract Deploy is Script {
    function run() external {
        vm.startBroadcast();
        AgentTab t = new AgentTab();
        vm.stopBroadcast();
        console.log("AgentTab deployed at", address(t), "chainId", block.chainid);
    }
}
