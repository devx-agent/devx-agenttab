// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/AgentTab.sol";
import "../src/MockUSD.sol";

contract AgentTabTest is Test {
    AgentTab tab; MockUSD usd;
    address payer = address(0xA11CE); address payee = address(0xB0B);
    uint256 signerPk = 0x5157; address signer;

    function setUp() public {
        tab = new AgentTab(); usd = new MockUSD(); signer = vm.addr(signerPk);
        usd.mint(payer, 1_000e6);
        vm.prank(payer); usd.approve(address(tab), type(uint256).max);
    }
    function _open(uint128 amt) internal returns (uint256 id) {
        vm.prank(payer); id = tab.openTab(payee, address(usd), signer, amt, uint64(block.timestamp + 1 days));
    }
    function _sig(uint256 pk, uint256 id, uint256 cum) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, tab.voucherDigest(id, cum)); return abi.encodePacked(r, s, v);
    }

    function test_openRedeemIncremental() public {
        uint256 id = _open(10e6);
        vm.startPrank(payee);
        assertEq(tab.redeem(id, 1e6, _sig(signerPk, id, 1e6)), 1e6);
        assertEq(tab.redeem(id, 3e6, _sig(signerPk, id, 3e6)), 2e6);
        assertEq(tab.redeem(id, 2e6, _sig(signerPk, id, 2e6)), 0); // stale -> noop
        vm.stopPrank();
        assertEq(usd.balanceOf(payee), 3e6); assertEq(tab.remaining(id), 7e6);
    }
    function test_rejectsWrongSigner() public {
        uint256 id = _open(10e6);
        bytes memory bad = _sig(0xBAD, id, 1e6);
        vm.prank(payee); vm.expectRevert(AgentTab.BadSignature.selector); tab.redeem(id, 1e6, bad);
    }
    function test_rejectsCrossTabReplay() public {
        uint256 a = _open(10e6); uint256 b = _open(10e6);
        bytes memory s = _sig(signerPk, a, 1e6);
        vm.prank(payee); vm.expectRevert(AgentTab.BadSignature.selector); tab.redeem(b, 1e6, s);
    }
    function test_rejectsOverDeposit() public {
        uint256 id = _open(10e6); bytes memory s = _sig(signerPk, id, 11e6);
        vm.prank(payee); vm.expectRevert(AgentTab.Exceeds.selector); tab.redeem(id, 11e6, s);
    }
    function test_onlyPayeeRedeems() public {
        uint256 id = _open(10e6); bytes memory s = _sig(signerPk, id, 1e6);
        vm.prank(address(0xE5E)); vm.expectRevert(AgentTab.NotPayee.selector); tab.redeem(id, 1e6, s);
    }
    function test_redeemAndClose() public {
        uint256 id = _open(10e6); bytes memory s = _sig(signerPk, id, 4e6);
        vm.prank(payee); tab.redeemAndClose(id, 4e6, s);
        assertEq(usd.balanceOf(payee), 4e6); assertEq(usd.balanceOf(payer), 996e6);
        bytes memory s5 = _sig(signerPk, id, 5e6);
        vm.prank(payee); vm.expectRevert(AgentTab.BadTab.selector); tab.redeem(id, 5e6, s5);
    }
    function test_reclaimAfterExpiry() public {
        uint256 id = _open(10e6);
        bytes memory s2 = _sig(signerPk, id, 2e6);
        vm.prank(payee); tab.redeem(id, 2e6, s2);
        vm.prank(payer); vm.expectRevert(AgentTab.NotExpired.selector); tab.reclaim(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(payer); tab.reclaim(id);
        assertEq(usd.balanceOf(payer), 998e6);
    }
    function test_topUpExtends() public {
        uint256 id = _open(1e6);
        vm.prank(payer); tab.topUp(id, 4e6, uint64(block.timestamp + 7 days));
        bytes memory s5 = _sig(signerPk, id, 5e6);
        vm.prank(payee); tab.redeem(id, 5e6, s5);
        assertEq(usd.balanceOf(payee), 5e6);
    }
    function test_batch() public {
        uint256 a = _open(5e6); uint256 b = _open(5e6);
        uint256[] memory ids = new uint256[](2); ids[0] = a; ids[1] = b;
        uint128[] memory c = new uint128[](2); c[0] = 1e6; c[1] = 2e6;
        bytes[] memory s = new bytes[](2); s[0] = _sig(signerPk, a, 1e6); s[1] = _sig(signerPk, b, 2e6);
        vm.prank(payee); assertEq(tab.redeemBatch(ids, c, s), 3e6);
    }
    function testFuzz_neverPaysMoreThanDeposit(uint128 dep, uint128 c1, uint128 c2) public {
        dep = uint128(bound(dep, 1, 1_000e6));
        uint256 id = _open(dep);
        c1 = uint128(bound(c1, 0, dep)); c2 = uint128(bound(c2, 0, dep));
        vm.startPrank(payee);
        if (c1 > 0) tab.redeem(id, c1, _sig(signerPk, id, c1));
        if (c2 > 0) tab.redeem(id, c2, _sig(signerPk, id, c2));
        vm.stopPrank();
        assertLe(usd.balanceOf(payee), dep);
        assertEq(usd.balanceOf(payee), c1 > c2 ? c1 : c2);
    }
}
