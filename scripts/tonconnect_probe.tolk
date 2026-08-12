// Safe TON Connect smoke test for the Brave/Tonkeeper development path.
// It only asks the wallet for its address and never creates or sends a
// transaction. Do not use this as deployment evidence.

import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@acton/io"
import "@acton/prompts"

fun main() {
    val walletName = promptWallet("Connect Brave/Tonkeeper testnet wallet (no transaction)");
    val wallet = scripts.wallet(walletName);
    println("connectedWallet={}", wallet.address);
    println("network={}", net.isBroadcasting() ? "testnet" : "emulation");
    println("No transaction was created or sent.");
}
