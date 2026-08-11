import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/build"
import "@stdlib/tvm-dicts"
import "@contracts/priva_testnet_launchpad"
import "PrivaTestnetLaunchpad.gen"

/// Builds StateInit data using the exact nested reference layout required by
/// the candidate. Values are intentionally non-production test values.
fun configuredCandidate(): PrivaTestnetLaunchpad {
    val saleTerms = beginCell()
        .storeAddress(address("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"))
        .storeCoins(1000000)
        .storeUint(1000, 64)
        .storeCoins(1000000000)
        .storeCoins(100000000)
        .storeRef(
            beginCell()
                .storeRef(createEmptyCell())
                .storeCoins(50000000)
                .storeCoins(50000000)
                .storeCoins(50000000)
                .endCell()
        )
        .endCell();
    val policy = beginCell()
        .storeUint(1, 256)
        .storeUint(2, 256)
        .storeUint(3, 256)
        .storeUint(86400, 32)
        .storeUint(300, 32)
        .storeUint(600, 32)
        .storeBool(false)
        .storeRef(saleTerms)
        .endCell();
    val settlement = beginCell().storeDict(createEmptyDict()).storeDict(createEmptyDict()).endCell();
    val accounting = beginCell()
        .storeUint(0, 64)
        .storeUint(0, 64)
        .storeCoins(0)
        .storeCoins(0)
        .storeDict(createEmptyDict())
        .storeDict(createEmptyDict())
        .storeDict(createEmptyDict())
        .storeRef(settlement)
        .endCell();
    val stateInit = ContractState {
        code: build("priva_testnet_launchpad"),
        data: beginCell().storeRef(policy).storeRef(accounting).endCell(),
    };
    val address = AutoDeployAddress { stateInit }.calculateAddress();
    return PrivaTestnetLaunchpad { address, stateInit };
}

get fun `test configured candidate deploys and rejects unknown ABI`() {
    val deployer = testing.treasury("candidate-deployer");
    val contract = configuredCandidate();
    val deployed = contract.deploy(deployer.address, { value: ton("1") });
    expect(deployed).toHaveSuccessfulDeploy({ to: contract.address });
    val malformed = contract.sendAny(deployer.address, beginCell().storeUint(0x12345678, 32).endCell(), { value: ton("0.1") });
    expect(malformed).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: 902,
    });
}

get fun `test candidate rejects unauthenticated settlement callbacks`() {
    val deployer = testing.treasury("candidate-callback-attacker");
    val contract = configuredCandidate();
    val deployed = contract.deploy(deployer.address, { value: ton("1") });
    expect(deployed).toHaveSuccessfulDeploy({ to: contract.address });

    val initial = contract.getPrivaTestnetAccounting();
    expect(initial.soldSaleUnits).toEqual(0);
    expect(initial.pendingSaleUnits).toEqual(0);
    expect(initial.acceptedNanoTon).toEqual(0);

    val forgedSuccess = contract.sendPrivaJettonExcesses(deployer.address, 77, { value: ton("0.1") });
    expect(forgedSuccess).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: 923,
    });

    val forgedFailure = contract.sendPrivaMintFailure(deployer.address, 77, { value: ton("0.1") });
    expect(forgedFailure).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: 924,
    });

    val final = contract.getPrivaTestnetAccounting();
    expect(final.soldSaleUnits).toEqual(0);
    expect(final.pendingSaleUnits).toEqual(0);
    expect(final.acceptedNanoTon).toEqual(0);
}

get fun `test authenticated excesses finalizes exactly one pending mint`() {
    val deployer = testing.treasury("candidate-settlement-wallet");
    val recipient = testing.treasury("candidate-settlement-recipient");
    val authorization = PrivaPendingMintAuthorization {
        identityNullifier: 7,
        actionNullifier: 8,
    }.toCell();
    val amounts = PrivaPendingMintAmounts {
        rawJettonAmount: 3000,
        acceptedNanoTon: 3000000,
        excessNanoTon: 0,
        refundNanoTon: 0,
    }.toCell();
    val pending = PrivaPendingMint {
        sender: deployer.address,
        recipient: recipient.address,
        expectedJettonWallet: deployer.address,
        saleUnits: 3,
        authorization,
        amounts,
        state: 1,
    }.toCell();
    var pendingMints: map<uint64, Cell<PrivaPendingMint>> = [];
    pendingMints.set(77, pending);
    val settlement = PrivaTestnetLaunchpadSettlementStorage {
        pendingMints,
        userRefunds: [],
    }.toCell();
    var usedActions: map<uint256, bool> = [];
    usedActions.set(8, true);
    var usedQueries: map<uint64, bool> = [];
    usedQueries.set(77, true);
    var identityTotals: map<uint256, coins> = [];
    identityTotals.set(7, 3000000);
    val accounting = PrivaTestnetLaunchpadAccountingStorage {
        soldSaleUnits: 0,
        pendingSaleUnits: 3,
        acceptedNanoTon: 0,
        pendingAcceptedNanoTon: 3000000,
        usedActionNullifiers: usedActions,
        usedQueryIds: usedQueries,
        identityPurchaseTotals: identityTotals,
        settlement,
    }.toCell();
    val saleTerms = PrivaTestnetSaleTerms {
        jettonMinter: deployer.address,
        priceNanoTonPerSaleUnit: 1000000,
        totalSaleUnits: 100,
        rawJettonPerSaleUnit: 1000,
        identityCapNanoTon: 10000000,
        settlement: PrivaTestnetSettlementTerms {
            jettonWalletCode: createEmptyCell(),
            walletFundingNanoTon: 50000000,
            mintMessageValueNanoTon: 50000000,
            refundGasReserveNanoTon: 50000000,
        }.toCell(),
    }.toCell();
    val policy = PrivaTestnetLaunchpadPolicy {
        appDomainHash: 1,
        issuerKeyHash: 2,
        launchIdHash: 3,
        maxTokenAgeSec: 86400,
        maxClockSkewSec: 300,
        maxAuthorizationTtlSec: 600,
        requirePremium: false,
        saleTerms,
    }.toCell();
    val state = PrivaTestnetLaunchpadStorage { policy, accounting };
    val contract = PrivaTestnetLaunchpad.fromStorage(state);
    val deployed = contract.deploy(deployer.address, { value: ton("1") });
    expect(deployed).toHaveSuccessfulDeploy({ to: contract.address });

    val settled = contract.sendPrivaJettonExcesses(deployer.address, 77, { value: ton("0.1") });
    expect(settled).toHaveSuccessfulTx({
        from: deployer.address,
        to: contract.address,
    });
    val final = contract.getPrivaTestnetAccounting();
    expect(final.soldSaleUnits).toEqual(3);
    expect(final.pendingSaleUnits).toEqual(0);
    expect(final.acceptedNanoTon).toEqual(3000000);
    expect(final.pendingAcceptedNanoTon).toEqual(0);
    expect(contract.getPrivaTestnetQueryState(77)).toEqual(2);
}
