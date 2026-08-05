// Tolk 1.4 TEP-74 Jetton Wallet Smart Contract for PrivaLaunch

struct JettonWalletStorage {
    balance: coins,
    ownerAddress: address,
    jettonMasterAddress: address,
    jettonWalletCode: cell
}

@inline
fun loadStorage(): JettonWalletStorage {
    var cs = contract.getData().beginParse();
    return JettonWalletStorage{
        balance: cs.loadCoins(),
        ownerAddress: cs.loadAddress(),
        jettonMasterAddress: cs.loadAddress(),
        jettonWalletCode: cs.loadRef()
    };
}

fun onInternalMessage(_msgValue: int, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) {
        return;
    }

    val op = inMsgBody.loadUint(32);
    if (op == 0x0f817053) { // op: transfer_jetton
        var storage = loadStorage();
        val amount = inMsgBody.loadCoins();
        assert(storage.balance >= amount) throw 705;
        storage.balance -= amount;
        contract.setData(contract.getData());
    }
}

get fun getWalletData(): (int, address, address, cell) {
    val storage = loadStorage();
    return (storage.balance, storage.ownerAddress, storage.jettonMasterAddress, storage.jettonWalletCode);
}
