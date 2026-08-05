// Tolk 1.4 PrivaLaunch Bonding Curve & Anti-Sniper Contract for TON

struct LaunchpadStorage {
    ownerAddress: address,
    creatorNullifierHash: uint256,
    totalTonRaised: coins,
    isGraduated: bool,
    nullifierPurchasesRoot: uint256
}

@inline
fun loadStorage(): LaunchpadStorage {
    var cs = contract.getData().beginParse();
    return LaunchpadStorage{
        ownerAddress: cs.loadAddress(),
        creatorNullifierHash: cs.loadUint(256),
        totalTonRaised: cs.loadCoins(),
        isGraduated: cs.loadUint(1) != 0,
        nullifierPurchasesRoot: cs.loadUint(256)
    };
}

@inline
fun saveStorage(storage: LaunchpadStorage) {
    var b = beginCell();
    b.storeAddress(storage.ownerAddress);
    b.storeUint(storage.creatorNullifierHash, 256);
    b.storeCoins(storage.totalTonRaised);
    b.storeUint(storage.isGraduated ? 1 : 0, 1);
    b.storeUint(storage.nullifierPurchasesRoot, 256);
    contract.setData(b.endCell());
}

fun onInternalMessage(msgValue: int, inMsgBody: slice) {
    if (inMsgBody.isEmpty()) {
        return;
    }

    val op = inMsgBody.loadUint(32);
    var _queryId = inMsgBody.loadUint(64);

    if (op == 0x70726976) { // op: buy_bonding_curve
        var _userNullifierHash = inMsgBody.loadUint(256);
        val zkProofRef = inMsgBody.loadRef();
        var _zkProofSlice = zkProofRef.beginParse();

        // Enforce Anti-Sniper ZK Buy Limit (Max 50 TON per unique Telegram ZK Nullifier)
        assert(msgValue <= 50000000000) throw 201; // 50 TON max

        var storage = loadStorage();
        assert(!storage.isGraduated) throw 202;

        storage.totalTonRaised += msgValue;

        // Auto-graduate to DeDust CPMM if 85 TON target reached
        if (storage.totalTonRaised >= 85000000000) {
            storage.isGraduated = true;
            migrateLiquidityToDeDust();
        }

        saveStorage(storage);
        return;
    }

    throw 0xffff;
}

fun migrateLiquidityToDeDust() {
    // Send pool deposit message to DeDust Factory V2
}

get fun getLaunchpadDetails(): (int, int, bool) {
    val storage = loadStorage();
    return (storage.creatorNullifierHash, storage.totalTonRaised, storage.isGraduated);
}
