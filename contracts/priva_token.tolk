// Tolk 1.4 TEP-74 Jetton Master Smart Contract for PrivaLaunch

struct JettonMasterStorage {
    totalSupply: coins,
    adminAddress: address,
    contentCell: cell,
    jettonWalletCode: cell
}

@inline
fun loadStorage(): JettonMasterStorage {
    var cs = contract.getData().beginParse();
    return JettonMasterStorage{
        totalSupply: cs.loadCoins(),
        adminAddress: cs.loadAddress(),
        contentCell: cs.loadRef(),
        jettonWalletCode: cs.loadRef()
    };
}

@inline
fun saveStorage(storage: JettonMasterStorage) {
    var b = beginCell();
    b.storeCoins(storage.totalSupply);
    b.storeAddress(storage.adminAddress);
    b.storeRef(storage.contentCell);
    b.storeRef(storage.jettonWalletCode);
    contract.setData(b.endCell());
}

fun onInternalMessage(_msgValue: int, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) {
        return;
    }

    val op = inMsgBody.loadUint(32);
    var _queryId = inMsgBody.loadUint(64);

    if (op == 21) { // op: mint_jetton
        var _toAddress = inMsgBody.loadAddress();
        var _tonAmount = inMsgBody.loadCoins();
        val jettonAmount = inMsgBody.loadCoins();

        var storage = loadStorage();
        storage.totalSupply += jettonAmount;
        saveStorage(storage);
        return;
    }

    throw 0xffff;
}

get fun getJettonData(): (int, int, address, cell, cell) {
    val storage = loadStorage();
    return (-1, storage.totalSupply, storage.adminAddress, storage.contentCell, storage.jettonWalletCode);
}
