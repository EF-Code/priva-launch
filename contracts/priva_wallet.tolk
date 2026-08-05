// Tolk 1.2 TEP-74 Jetton Wallet Smart Contract for PrivaLaunch

struct JettonWalletStorage {
    balance: coins,
    ownerAddress: address,
    jettonMasterAddress: address,
    jettonWalletCode: cell
}

@inline
fun loadStorage(): JettonWalletStorage {
    var cs = getContractData().beginParse();
    return JettonWalletStorage{
        balance: cs.loadCoins(),
        ownerAddress: cs.loadAddress(),
        jettonMasterAddress: cs.loadAddress(),
        jettonWalletCode: cs.loadRef()
    };
}

fun onInternalMessage(msgValue: int, inMsgBody: slice) {
    if (inMsgBody.isSliceEmpty()) return;

    var op = inMsgBody.loadUint(32);
    if (op == 0x0f817053) { // op: transfer_jetton
        var storage = loadStorage();
        var amount = inMsgBody.loadCoins();
        assert(storage.balance >= amount) throw 705;
        storage.balance -= amount;
        setContractData(getContractData());
    }
}

get fun getWalletData(): (int, address, address, cell) {
    var storage = loadStorage();
    return (storage.balance, storage.ownerAddress, storage.jettonMasterAddress, storage.jettonWalletCode);
}
