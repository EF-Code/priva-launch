// Complete the reviewed two-stage settlement-minter admin handoff.
//
// The minter must first nominate the exact launchpad as next_admin, then the
// launchpad must emit claim_admin back to that same minter. This script binds
// both destinations to reviewed arguments, requires the approving wallet to
// be the reviewed initial admin during a real testnet broadcast, and checks
// the nomination getter before sending the claim. It never accepts a caller-
// supplied opcode or wallet mnemonic.
//
// Without --net this runs only in Acton's emulator. A real broadcast requires
// --net testnet --tonconnect and PRIVA_DEPLOY_NETWORK=testnet.

import "@acton/env"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@acton/io"
import "@acton/prompts"
import "@acton/testing/assert"
import "@contracts/priva_testnet_launchpad"
import "@stdlib/strings"

const PRIVA_TESTNET_WORKCHAIN: int8 = 0;
const MINTER_CHANGE_ADMIN_OPCODE: int = 0x6501f354;
const MINTER_MIN_HANDOFF_VALUE: coins = 200000000; // 0.2 TON per reference flow

fun main(
    minterAddress: address,
    launchpadAddress: address,
    expectedInitialAdminAddress: address,
    changeQueryId: uint64,
    claimQueryId: uint64,
    changeValue: coins,
    claimValue: coins,
) {
    if (minterAddress.getWorkchain() != PRIVA_TESTNET_WORKCHAIN) {
        Assert.fail("Settlement minter must be a basechain testnet address.");
    }
    if (launchpadAddress.getWorkchain() != PRIVA_TESTNET_WORKCHAIN) {
        Assert.fail("Launchpad must be a basechain testnet address.");
    }
    if (expectedInitialAdminAddress.getWorkchain() != PRIVA_TESTNET_WORKCHAIN) {
        Assert.fail("Initial admin must be a basechain testnet address.");
    }
    if (changeQueryId == 0 || claimQueryId == 0 || changeQueryId == claimQueryId) {
        Assert.fail("Use two distinct non-zero handoff query IDs.");
    }
    if (changeValue < MINTER_MIN_HANDOFF_VALUE || claimValue < MINTER_MIN_HANDOFF_VALUE) {
        Assert.fail("Both handoff messages must carry at least 0.2 TON for gas and action reserve.");
    }
    if (!scripts.isContractDeployed(minterAddress)) {
        Assert.fail("Refusing handoff: the reviewed settlement minter is not deployed.");
    }
    if (!scripts.isContractDeployed(launchpadAddress)) {
        Assert.fail("Refusing handoff: the reviewed launchpad is not deployed.");
    }

    val walletName = promptWallet("Select the testnet handoff wallet");
    val declaredNetwork = env<string>("PRIVA_DEPLOY_NETWORK");
    if (net.isBroadcasting() && (declaredNetwork == null || !declaredNetwork!.equalTo("testnet"))) {
        Assert.fail("Set PRIVA_DEPLOY_NETWORK=testnet; this script refuses an undeclared broadcast network.");
    }
    if (net.isBroadcasting() && walletName.hash() != "tonconnect".hash()) {
        Assert.fail("Broadcasts require --tonconnect; configured mnemonic wallets are disabled by this script.");
    }
    val admin = scripts.wallet(walletName);
    if (net.isBroadcasting()) {
        Assert.equal(admin.address, expectedInitialAdminAddress, "TonConnect wallet must equal the reviewed initial minter admin");
    }

    println("network={}", net.isBroadcasting() ? "testnet-broadcast" : "emulation");
    println("approver={}", admin.address);
    println("settlementMinterAddress={}", minterAddress);
    println("launchpadAddress={}", launchpadAddress);
    println("changeQueryId={}", changeQueryId);
    println("claimQueryId={}", claimQueryId);
    println("changeValue={:ton}", changeValue);
    println("claimValue={:ton}", claimValue);

    // Stage 1: only the current minter admin may nominate the launchpad.
    val changeBody = beginCell()
        .storeUint(MINTER_CHANGE_ADMIN_OPCODE, 32)
        .storeUint(changeQueryId, 64)
        .storeAddress(launchpadAddress)
        .endCell();
    val changeMessage = createMessage({
        bounce: BounceMode.RichBounce,
        value: changeValue,
        dest: minterAddress,
        body: changeBody,
    });
    val changeResult = net.send(admin.address, changeMessage);
    changeResult.giveName("priva-testnet-minter-change-admin");
    val changeApplied = changeResult.waitForFirstTransaction(false, 30, 3000);
    if (changeApplied == null) {
        Assert.fail("The minter change_admin trace was not observed.");
    }
    changeResult.waitForTrace();
    println("changeAdminTransactionHash={:x}", changeApplied!.tx.hash());

    // Fail closed if the minter did not persist the exact nominated address.
    val nominatedAdmin: address? = net.runGetMethod(minterAddress, "get_next_admin_address");
    Assert.equal(nominatedAdmin, launchpadAddress, "minter next_admin_address is not the reviewed launchpad");

    // Stage 2: this trigger is permissionless, but the launchpad itself emits
    // claim_admin to the pinned minter. The generated ABI fixes the opcode.
    val claimBody = PrivaClaimMinterAdmin { queryId: claimQueryId }.toCell();
    val claimMessage = createMessage({
        bounce: BounceMode.RichBounce,
        value: claimValue,
        dest: launchpadAddress,
        body: claimBody,
    });
    val claimResult = net.send(admin.address, claimMessage);
    claimResult.giveName("priva-testnet-launchpad-claim-minter-admin");
    val claimApplied = claimResult.waitForFirstTransaction(false, 30, 3000);
    if (claimApplied == null) {
        Assert.fail("The launchpad claim_admin trace was not observed.");
    }
    claimResult.waitForTrace();
    println("claimTransactionHash={:x}", claimApplied!.tx.hash());

    // A successful claim clears next_admin in the reference minter. If the
    // getter is still populated, do not describe the handoff as complete.
    val remainingAdmin: address? = net.runGetMethod(minterAddress, "get_next_admin_address");
    if (remainingAdmin != null) {
        Assert.fail("minter next_admin_address remains populated; admin handoff is incomplete.");
    }
    println("handoff=complete");
    if (!net.isBroadcasting()) {
        println("emulationOnly=true; no live testnet state was changed");
    }
}
