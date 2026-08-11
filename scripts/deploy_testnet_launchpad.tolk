// Deploy one reviewed Priva testnet launchpad StateInit.
//
// The script is intentionally data-driven: immutable policy and settlement
// values are supplied as a reviewed data cell, never invented by this file.
// It performs all address/hash checks locally before it creates a message.
// Without --net it only runs in the Acton emulator. A broadcast requires
// --net testnet --tonconnect; local mnemonic wallets are rejected by design.

import "@acton/build"
import "@acton/env"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@acton/io"
import "@acton/prompts"
import "@acton/testing/assert"
import "@stdlib/strings"

const PRIVA_TESTNET_WORKCHAIN: int8 = 0;
const PRIVA_MIN_DEPLOY_VALUE: coins = 100000000; // 0.1 TON, below any intended funding reserve

fun main(
    data: cell,
    expectedAddress: address,
    expectedCodeHash: uint256,
    expectedDataHash: uint256,
    deployValue: coins,
) {
    if (expectedAddress.getWorkchain() != PRIVA_TESTNET_WORKCHAIN) {
        Assert.fail("Only basechain (workchain 0) testnet deployments are supported.");
    }
    if (deployValue < PRIVA_MIN_DEPLOY_VALUE) {
        Assert.fail("deployValue must be at least 0.1 TON to leave room for deployment gas.");
    }

    // The code is compiled from this checkout; callers cannot substitute an
    // arbitrary code cell. The reviewed manifest still supplies the expected
    // hash so a source/artifact drift fails before any wallet approval.
    val code = build("priva_testnet_launchpad");
    val actualCodeHash = code.hash();
    val actualDataHash = data.hash();
    Assert.equal(actualCodeHash, expectedCodeHash, "launchpad code hash differs from the reviewed manifest");
    Assert.equal(actualDataHash, expectedDataHash, "launchpad data hash differs from the reviewed initialization record");

    val stateInit = ContractState { code, data };
    val destination = AutoDeployAddress {
        workchain: PRIVA_TESTNET_WORKCHAIN,
        stateInit,
    };
    val derivedAddress = destination.calculateAddress();
    Assert.equal(derivedAddress, expectedAddress, "StateInit-derived address differs from the reviewed manifest");

    if (scripts.isContractDeployed(derivedAddress)) {
        Assert.fail("Refusing to send: the reviewed address is already deployed.");
    }

    val walletName = promptWallet("Select the testnet deployer wallet");
    val declaredNetwork = env<string>("PRIVA_DEPLOY_NETWORK");
    if (net.isBroadcasting() && (declaredNetwork == null || !declaredNetwork!.equalTo("testnet"))) {
        Assert.fail("Set PRIVA_DEPLOY_NETWORK=testnet; this script refuses an undeclared broadcast network.");
    }
    if (net.isBroadcasting() && walletName.hash() != "tonconnect".hash()) {
        Assert.fail("Broadcasts require --tonconnect; configured mnemonic wallets are disabled by this script.");
    }
    val deployer = scripts.wallet(walletName);

    println("network={}", net.isBroadcasting() ? "testnet-broadcast" : "emulation");
    println("deployer={}", deployer.address);
    println("launchpadAddress={}", derivedAddress);
    println("codeCellHash={:x}", actualCodeHash);
    println("dataCellHash={:x}", actualDataHash);
    println("stateInitHash={:x}", StateInit.calcHashCodeData(code, data));
    println("value={:ton}", deployValue);

    val deployMessage = createMessage({
        bounce: BounceMode.NoBounce,
        value: deployValue,
        dest: destination,
    });
    val result = net.send(deployer.address, deployMessage);
    result.giveName("priva-testnet-launchpad-deploy");

    val applied = result.waitForFirstTransaction(false, 30, 3000);
    if (applied == null) {
        Assert.fail("Deployment transaction was not observed.");
    }
    println("transactionHash={:x}", applied!.tx.hash());
    println("transactionLt={}", applied!.lt);
    if (!net.isBroadcasting()) {
        println("emulationOnly=true; no live testnet state was changed");
    }
}
