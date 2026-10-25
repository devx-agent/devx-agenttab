// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentTab — metered agent-to-agent (A2A) settlement on HashKey Chain
/// @notice A payer agent locks stablecoin (USDC/USDT) in a "tab" for a payee agent.
///         For every paid call the payer signs an off-chain EIP-712 voucher carrying the
///         CUMULATIVE amount owed. The payee redeems the latest voucher whenever it likes
///         (one tx settles thousands of calls). After expiry the payer reclaims the rest.
///         Signing a voucher is free and instant, so agents can pay per HTTP request
///         (HTTP 402) without one on-chain tx per call.
interface IERC20 {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract AgentTab {
    struct Tab {
        address payer;      // agent (or human wallet) funding the tab
        address signer;     // key allowed to sign vouchers (agent hot key; can differ from payer)
        address payee;      // service agent being paid
        address token;      // ERC-20 stablecoin
        uint128 deposit;    // total locked
        uint128 redeemed;   // total already paid to payee
        uint64 expiry;      // after this, payer may reclaim the unredeemed balance
        bool closed;
    }

    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("Voucher(uint256 tabId,uint256 cumulative)");
    bytes32 public immutable DOMAIN_SEPARATOR;
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    uint256 public nextTabId = 1;
    mapping(uint256 => Tab) public tabs;
    uint256 private _lock = 1;

    event TabOpened(uint256 indexed tabId, address indexed payer, address indexed payee, address token, address signer, uint256 deposit, uint64 expiry);
    event TabToppedUp(uint256 indexed tabId, uint256 amount, uint64 expiry);
    event Redeemed(uint256 indexed tabId, address indexed payee, uint256 cumulative, uint256 paid);
    event TabClosed(uint256 indexed tabId, uint256 paidToPayee, uint256 refundedToPayer);

    error NotPayer();
    error NotPayee();
    error BadTab();
    error BadSignature();
    error Exceeds();
    error NotExpired();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AgentTab"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // ---------------------------------------------------------------- payer side

    function openTab(address payee, address token, address signer, uint128 amount, uint64 expiry)
        external
        nonReentrant
        returns (uint256 tabId)
    {
        if (payee == address(0) || token == address(0) || signer == address(0) || expiry <= block.timestamp) revert BadTab();
        tabId = nextTabId++;
        tabs[tabId] = Tab(msg.sender, signer, payee, token, amount, 0, expiry, false);
        _pull(token, msg.sender, amount);
        emit TabOpened(tabId, msg.sender, payee, token, signer, amount, expiry);
    }

    /// @notice Add funds and/or extend expiry (expiry can only move forward).
    function topUp(uint256 tabId, uint128 amount, uint64 newExpiry) external nonReentrant {
        Tab storage t = tabs[tabId];
        if (t.payer != msg.sender) revert NotPayer();
        if (t.closed) revert BadTab();
        if (newExpiry > t.expiry) t.expiry = newExpiry;
        t.deposit += amount;
        if (amount > 0) _pull(t.token, msg.sender, amount);
        emit TabToppedUp(tabId, amount, t.expiry);
    }

    /// @notice After expiry, payer reclaims whatever the payee has not redeemed.
    ///         Payee should redeem its latest voucher before expiry.
    function reclaim(uint256 tabId) external nonReentrant {
        Tab storage t = tabs[tabId];
        if (t.payer != msg.sender) revert NotPayer();
        if (t.closed) revert BadTab();
        if (block.timestamp < t.expiry) revert NotExpired();
        t.closed = true;
        uint256 refund = t.deposit - t.redeemed;
        if (refund > 0) _push(t.token, t.payer, refund);
        emit TabClosed(tabId, 0, refund);
    }

    // ---------------------------------------------------------------- payee side

    /// @notice Redeem the latest voucher. Pays (cumulative - alreadyRedeemed).
    function redeem(uint256 tabId, uint128 cumulative, bytes calldata sig) public nonReentrant returns (uint256 paid) {
        paid = _redeem(tabId, cumulative, sig);
    }

    /// @notice Redeem and close: pays the voucher and refunds the remainder to the payer immediately.
    function redeemAndClose(uint256 tabId, uint128 cumulative, bytes calldata sig) external nonReentrant {
        Tab storage t = tabs[tabId];
        uint256 paid = cumulative > t.redeemed ? _redeem(tabId, cumulative, sig) : 0;
        if (t.payee != msg.sender) revert NotPayee();
        t.closed = true;
        uint256 refund = t.deposit - t.redeemed;
        if (refund > 0) _push(t.token, t.payer, refund);
        emit TabClosed(tabId, paid, refund);
    }

    /// @notice Settle many tabs in one tx (a service agent with many clients).
    function redeemBatch(uint256[] calldata tabIds, uint128[] calldata cumulatives, bytes[] calldata sigs)
        external
        nonReentrant
        returns (uint256 total)
    {
        if (tabIds.length != cumulatives.length || tabIds.length != sigs.length) revert BadTab();
        for (uint256 i; i < tabIds.length; ++i) {
            total += _redeem(tabIds[i], cumulatives[i], sigs[i]);
        }
    }

    // ---------------------------------------------------------------- views

    function voucherDigest(uint256 tabId, uint256 cumulative) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(VOUCHER_TYPEHASH, tabId, cumulative))));
    }

    function remaining(uint256 tabId) external view returns (uint256) {
        Tab storage t = tabs[tabId];
        return t.closed ? 0 : t.deposit - t.redeemed;
    }

    // ---------------------------------------------------------------- internals

    function _redeem(uint256 tabId, uint128 cumulative, bytes calldata sig) internal returns (uint256 paid) {
        Tab storage t = tabs[tabId];
        if (t.payee != msg.sender) revert NotPayee();
        if (t.closed) revert BadTab();
        if (cumulative > t.deposit) revert Exceeds();
        if (cumulative <= t.redeemed) return 0; // stale voucher: no-op, keeps batches robust
        if (_recover(voucherDigest(tabId, cumulative), sig) != t.signer) revert BadSignature();
        paid = cumulative - t.redeemed;
        t.redeemed = cumulative;
        _push(t.token, t.payee, paid);
        emit Redeemed(tabId, t.payee, cumulative, paid);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > SECP256K1N_HALF || (v != 27 && v != 28)) revert BadSignature();
        address a = ecrecover(digest, v, r, s);
        if (a == address(0)) revert BadSignature();
        return a;
    }

    function _pull(address token, address from, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _push(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
