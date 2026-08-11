// Deploy the reviewed Priva settlement minter StateInit to TON testnet.
//
// This script is deliberately separate from compilation. Run
// `npm run compile:settlement-minter` first; it writes the exact code BoC that
// this script loads. The immutable data cell and expected address/hash values
// must come from a real reviewed initialization manifest. Without --net this
// only runs in the Acton emulator. A broadcast requires --net testnet
// --tonconnect and PRIVA_DEPLOY_NETWORK=testnet.

import "@acton/build"
import "@acton/env"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@acton/io"
import "@acton/prompts"
import "@acton/testing/assert"
import "@stdlib/strings"

const PRIVA_TESTNET_WORKCHAIN: int8 = 0;
const PRIVA_MIN_DEPLOY_VALUE: coins = 200000000; // 0.2 TON, review the reserve separately

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
        Assert.fail("deployValue must be at least 0.2 TON to leave room for minter deployment gas.");
    }

    // This path loads the compiler output, never source-selected or
    // user-supplied code. The checked-in lock and compile step bind it to the
    // reviewed FunC source and pinned upstream jetton implementation.
    val code = build("priva_settlement_minter", "build/priva_settlement_minter.boc");
    val actualCodeHash = code.hash();
    val actualDataHash = data.hash();
    Assert.equal(actualCodeHash, expectedCodeHash, "settlement minter code hash differs from the reviewed manifest");
    Assert.equal(actualDataHash, expectedDataHash, "settlement minter data hash differs from the reviewed initialization record");

    val stateInit = ContractState { code, data };
    val destination = AutoDeployAddress {
        workchain: PRIVA_TESTNET_WORKCHAIN,
        stateInit,
    };
    val derivedAddress = destination.calculateAddress();
    Assert.equal(derivedAddress, expectedAddress, "StateInit-derived address differs from the reviewed manifest");

    if (scripts.isContractDeployed(derivedAddress)) {
        Assert.fail("Refusing to send: the reviewed minter address is already deployed.");
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
    println("settlementMinterAddress={}", derivedAddress);
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
    result.giveName("priva-testnet-settlement-minter-deploy");

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
