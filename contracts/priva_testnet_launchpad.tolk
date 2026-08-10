import "@zk_tele_auth/priva_purchase_auth_verifier"
import "@stdlib/exotic-cells"
import "@stdlib/tvm-dicts"

// Typed, testnet-candidate launchpad ABI.
//
// This is deliberately not registered as an active value-handling contract.
// It freezes the message shape and query identifiers that the eventual
// verifier-inlined implementation must support. Buy messages still fail before
// touching balances or nullifier state.

const PrivaTestnetLaunchpadVersion: int = 1;
const PrivaTestnetBuyOpcode: int = 0x50525642; // "PRVB"

// TEP-74 values pinned to vendor/ton-token-contract at the revision recorded
// in contracts/vendor/tep74-reference.lock.json. Keep these builders separate
// from the state transition until the minter, funding amount, and bounce path
// are part of the immutable launch configuration.
const Tep74MintOpcode: int = 21;
const Tep74InternalTransferOpcode: int = 0x178d4519;

enum PrivaTestnetLaunchpadErrors {
    PolicyAndStateNotImplemented = 901,
    MalformedMessage = 902,
    WrongProof = 903,
    Unauthorized = 904,
    WrongOperation = 905,
    ExpiredAuthorization = 906,
    WrongCircuitVersion = 907,
    WrongRecipientAddress = 908,
    WrongLaunchpadAddress = 909,
    UnconfiguredLaunchPolicy = 910,
    WrongAppDomain = 911,
    WrongIssuer = 912,
    WrongLaunch = 913,
    WrongCredentialPolicy = 914,
    FutureAuthorization = 915,
    AuthorizationTtlExceeded = 916,
    InvalidSaleTerms = 917,
    InvalidPurchaseValue = 918,
    SoldOut = 919,
    IdentityCapExceeded = 920,
    ActionAlreadyUsed = 921,
    QueryAlreadyPending = 922,
    UnknownPendingMint = 923,
    UnauthorizedBounce = 924,
    UnknownRefund = 925,
    UnauthorizedRefundClaim = 926
}

const PrivaRefundClaimOpcode: int = 0x50525652; // "PRVR"
const PrivaRefundTransferOpcode: int = 0x50524644; // "PRFD"

/// Immutable economic and settlement values. This is a StateInit reference,
/// never a mutable administrator-managed configuration message.
struct PrivaTestnetSaleTerms {
    jettonMinter: address
    priceNanoTonPerSaleUnit: coins
    totalSaleUnits: uint64
    rawJettonPerSaleUnit: coins
    identityCapNanoTon: coins
    walletFundingNanoTon: coins
    mintMessageValueNanoTon: coins
}

/// Immutable proof policy serialized in StateInit. No message can configure or
/// rotate this policy: the contract address itself commits to these values.
struct PrivaTestnetLaunchpadPolicy {
    appDomainHash: uint256
    issuerKeyHash: uint256
    launchIdHash: uint256
    maxTokenAgeSec: uint32
    maxClockSkewSec: uint32
    maxAuthorizationTtlSec: uint32
    requirePremium: bool
    saleTerms: Cell<PrivaTestnetSaleTerms>
}

/// Persistent layout for the eventual settled-buy path. It is intentionally
/// separate from the currently closed handler: state must only be saved in the
/// same transaction that either mints the exact quoted amount or records a
/// recoverable pending operation/refund.
struct PrivaTestnetLaunchpadSettlementStorage {
    pendingMints: map<uint64, Cell<PrivaPendingMint>>
    userRefunds: map<uint64, Cell<PrivaPendingMint>>
}

struct PrivaTestnetLaunchpadAccountingStorage {
    soldSaleUnits: uint64
    acceptedNanoTon: coins
    usedActionNullifiers: map<uint256, bool>
    identityPurchaseTotals: map<uint256, coins>
    settlement: Cell<PrivaTestnetLaunchpadSettlementStorage>
}

struct PrivaTestnetLaunchpadStorage {
    // Two typed refs keep the accounting root beneath both TON's 1023-bit and
    // four-reference cell limits as dictionaries become populated.
    policy: Cell<PrivaTestnetLaunchpadPolicy>
    accounting: Cell<PrivaTestnetLaunchpadAccountingStorage>
}

/// Record serialized under the buy query ID before a TEP-74 mint request.
/// The explicit `state` prevents a callback/bounce from being applied twice.
struct PrivaPendingMintAuthorization {
    identityNullifier: uint256
    actionNullifier: uint256
}

struct PrivaPendingMintAmounts {
    rawJettonAmount: coins
    acceptedNanoTon: coins
    excessNanoTon: coins
    refundNanoTon: coins
}

struct PrivaPendingMint {
    sender: address
    recipient: address
    authorization: Cell<PrivaPendingMintAuthorization>
    amounts: Cell<PrivaPendingMintAmounts>
    state: uint8
}

const PendingMintState: uint8 = 1;
const RefundPendingState: uint8 = 2;

fun PrivaTestnetLaunchpadStorage.load(): PrivaTestnetLaunchpadStorage {
    val data = contract.getData();
    val payload = data.beginParse();
    if (payload.remainingBitsCount() == 0 && payload.remainingRefsCount() == 0) {
        return PrivaTestnetLaunchpadStorage {
            policy: PrivaTestnetLaunchpadPolicy {
                appDomainHash: 0,
                issuerKeyHash: 0,
                launchIdHash: 0,
                maxTokenAgeSec: 0,
                maxClockSkewSec: 0,
                maxAuthorizationTtlSec: 0,
                requirePremium: false,
                saleTerms: PrivaTestnetSaleTerms {
                    jettonMinter: address("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"),
                    priceNanoTonPerSaleUnit: 0,
                    totalSaleUnits: 0,
                    rawJettonPerSaleUnit: 0,
                    identityCapNanoTon: 0,
                    walletFundingNanoTon: 0,
                    mintMessageValueNanoTon: 0,
                }.toCell(),
            }.toCell(),
            accounting: PrivaTestnetLaunchpadAccountingStorage {
                soldSaleUnits: 0,
                acceptedNanoTon: 0,
                usedActionNullifiers: [],
                identityPurchaseTotals: [],
                settlement: PrivaTestnetLaunchpadSettlementStorage {
                    pendingMints: [],
                    userRefunds: [],
                }.toCell(),
            }.toCell(),
        };
    }
    return PrivaTestnetLaunchpadStorage.fromCell(data);
}

fun PrivaTestnetLaunchpadStorage.save(self) {
    contract.setData(self.toCell());
}

struct (0x50525642) PrivaTestnetBuy {
    queryId: uint64
    maxValue: coins
    recipient: address
    proof: cell
    publicInputs: cell
}

struct (0x50525652) PrivaRefundClaim {
    queryId: uint64
}

struct (0x50524644) PrivaRefundTransfer {
    queryId: uint64
    refundNanoTon: coins
}

/// Decode the exact 17-element public-input envelope checked by the pinned
/// verifier core. Parsing the same canonical envelope avoids a policy check on
/// a differently serialized set of values.
fun parsePrivaPublicInputs(pubInputsCell: cell): array<int> {
    val (initialPayload, payloadIsExotic) = pubInputsCell.beginParseSpecial();
    if (payloadIsExotic || initialPayload.remainingBitsCount() < 8) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    var payload = initialPayload;
    if (payload.loadUint(8) != 17) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    PrivaPurchaseAuthVerifier.checkPublicInputsPayloadShape(payload);

    var out: array<int> = [];
    repeat (17) {
        out.push(PrivaPurchaseAuthVerifier.loadNextPubInput(mutate payload));
    }
    if (payload.remainingBitsCount() != 0 || payload.remainingRefsCount() != 0) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    return out;
}

fun checkAddressBinding(inputs: array<int>, recipient: address) {
    // priva_purchase_auth/v2 exposes canonical basechain account IDs as
    // high/low 128-bit limbs: launchpad=[9,10], recipient=[12,13].
    val (launchpadWorkchain, launchpadAccountId) = contract.getAddress().getWorkchainAndHash();
    val launchpadId = launchpadAccountId as int;
    assert (launchpadWorkchain == 0) throw PrivaTestnetLaunchpadErrors.WrongLaunchpadAddress;
    assert (inputs.get(9) == (launchpadId >> 128)) throw PrivaTestnetLaunchpadErrors.WrongLaunchpadAddress;
    assert (inputs.get(10) == (launchpadId & ((1 << 128) - 1))) throw PrivaTestnetLaunchpadErrors.WrongLaunchpadAddress;

    val (recipientWorkchain, recipientAccountId) = recipient.getWorkchainAndHash();
    val recipientId = recipientAccountId as int;
    assert (recipientWorkchain == 0) throw PrivaTestnetLaunchpadErrors.WrongRecipientAddress;
    assert (inputs.get(12) == (recipientId >> 128)) throw PrivaTestnetLaunchpadErrors.WrongRecipientAddress;
    assert (inputs.get(13) == (recipientId & ((1 << 128) - 1))) throw PrivaTestnetLaunchpadErrors.WrongRecipientAddress;
}

fun checkFixedBuySignals(inputs: array<int>, recipient: address, policy: PrivaTestnetLaunchpadPolicy) {
    // Signal indexes are pinned by priva_purchase_auth/v2:
    // authorized=2, operation=11, expiryEpoch=15, circuitVersion=16.
    assert (inputs.get(2) == 1) throw PrivaTestnetLaunchpadErrors.Unauthorized;
    assert (inputs.get(11) == 1) throw PrivaTestnetLaunchpadErrors.WrongOperation;
    assert (inputs.get(16) == 1) throw PrivaTestnetLaunchpadErrors.WrongCircuitVersion;
    assert (inputs.get(15) >= blockchain.now()) throw PrivaTestnetLaunchpadErrors.ExpiredAuthorization;
    checkAddressBinding(inputs, recipient);

    // The zero/default policy is never valid. This makes an undeclared
    // StateInit fail closed rather than letting a first caller define policy.
    assert (policy.appDomainHash != 0 && policy.issuerKeyHash != 0 && policy.launchIdHash != 0) throw PrivaTestnetLaunchpadErrors.UnconfiguredLaunchPolicy;
    assert (policy.maxTokenAgeSec > 0 && policy.maxAuthorizationTtlSec > 0) throw PrivaTestnetLaunchpadErrors.UnconfiguredLaunchPolicy;
    assert (inputs.get(3) == (policy.appDomainHash as int)) throw PrivaTestnetLaunchpadErrors.WrongAppDomain;
    assert (inputs.get(7) == (policy.issuerKeyHash as int)) throw PrivaTestnetLaunchpadErrors.WrongIssuer;
    assert (inputs.get(8) == (policy.launchIdHash as int)) throw PrivaTestnetLaunchpadErrors.WrongLaunch;
    assert (inputs.get(5) == (policy.maxTokenAgeSec as int)) throw PrivaTestnetLaunchpadErrors.WrongCredentialPolicy;
    assert (inputs.get(6) == (policy.requirePremium ? 1 : 0)) throw PrivaTestnetLaunchpadErrors.WrongCredentialPolicy;
    assert (inputs.get(4) <= blockchain.now()) throw PrivaTestnetLaunchpadErrors.FutureAuthorization;
    assert (blockchain.now() - inputs.get(4) <= (policy.maxClockSkewSec as int)) throw PrivaTestnetLaunchpadErrors.FutureAuthorization;
    assert (inputs.get(15) - inputs.get(4) <= (policy.maxAuthorizationTtlSec as int)) throw PrivaTestnetLaunchpadErrors.AuthorizationTtlExceeded;
}

/// Build the exact TEP-74 internal_transfer cell consumed by the pinned
/// reference minter. The forward payload is inline and empty (`Either Cell`
/// selector = 0), matching the reference wrapper's mintMessage() encoding.
fun buildTep74InternalTransfer(
    queryId: uint64,
    rawJettonAmount: coins,
    from: address,
    responseAddress: address,
): cell {
    return beginCell()
        .storeUint(Tep74InternalTransferOpcode, 32)
        .storeUint(queryId, 64)
        .storeCoins(rawJettonAmount)
        .storeAddress(from)
        .storeAddress(responseAddress)
        .storeCoins(0)
        .storeBool(false)
        .endCell();
}

/// Build the privileged `mint#21` body accepted by the selected TEP-74
/// reference minter. `walletFundingNanoTon` is distinct from the buyer's
/// accepted price: it funds deploy/delivery of the recipient's jetton wallet.
/// This helper does not create or send an outgoing message.
fun buildTep74MintBody(
    queryId: uint64,
    recipient: address,
    walletFundingNanoTon: coins,
    rawJettonAmount: coins,
    launchpadAddress: address,
): cell {
    val internalTransfer = buildTep74InternalTransfer(
        queryId,
        rawJettonAmount,
        launchpadAddress,
        launchpadAddress,
    );
    return beginCell()
        .storeUint(Tep74MintOpcode, 32)
        .storeUint(queryId, 64)
        .storeAddress(recipient)
        .storeCoins(walletFundingNanoTon)
        .storeRef(internalTransfer)
        .endCell();
}

fun checkSaleTerms(terms: PrivaTestnetSaleTerms) {
    assert (terms.priceNanoTonPerSaleUnit > 0 && terms.totalSaleUnits > 0) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
    assert (terms.rawJettonPerSaleUnit > 0 && terms.identityCapNanoTon > 0) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
    assert (terms.walletFundingNanoTon > 0 && terms.mintMessageValueNanoTon >= terms.walletFundingNanoTon) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
}

fun emitTep74Mint(queryId: uint64, recipient: address, rawJettonAmount: coins, terms: PrivaTestnetSaleTerms) {
    val body = buildTep74MintBody(
        queryId,
        recipient,
        terms.walletFundingNanoTon,
        rawJettonAmount,
        contract.getAddress(),
    );
    createMessage({
        bounce: BounceMode.RichBounce,
        value: terms.mintMessageValueNanoTon,
        dest: terms.jettonMinter,
        body,
    }).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun startBuy(sender: address, valueCoins: coins, msg: PrivaTestnetBuy) {
    val verifierMessage = PrivaPurchaseAuthVerifierVerify {
        proof: msg.proof,
        pubInputs: msg.publicInputs,
    };
    assert (PrivaPurchaseAuthVerifier.create().verifyProof(verifierMessage)) throw PrivaTestnetLaunchpadErrors.WrongProof;
    val inputs = parsePrivaPublicInputs(msg.publicInputs);
    var storage = PrivaTestnetLaunchpadStorage.load();
    val policy = storage.policy.load();
    checkFixedBuySignals(inputs, msg.recipient, policy);
    val terms = policy.saleTerms.load();
    checkSaleTerms(terms);

    // maxValue is the exact requested gross purchase value. Attaching more
    // than this is allowed only as a recoverable refund; attaching less is
    // rejected before any proof-derived state is consumed.
    assert (msg.maxValue > 0 && valueCoins >= msg.maxValue) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;
    assert (msg.maxValue >= terms.mintMessageValueNanoTon) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;
    val requestedUnits = (msg.maxValue as int) / (terms.priceNanoTonPerSaleUnit as int);
    assert (requestedUnits > 0 && requestedUnits * (terms.priceNanoTonPerSaleUnit as int) == (msg.maxValue as int)) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;

    var accounting = storage.accounting.load();
    val identityNullifier = inputs.get(0) as uint256;
    val actionNullifier = inputs.get(1) as uint256;
    assert (!accounting.usedActionNullifiers.exists(actionNullifier)) throw PrivaTestnetLaunchpadErrors.ActionAlreadyUsed;
    assert (accounting.soldSaleUnits <= terms.totalSaleUnits && requestedUnits <= ((terms.totalSaleUnits as int) - (accounting.soldSaleUnits as int))) throw PrivaTestnetLaunchpadErrors.SoldOut;
    val identityPrevious = accounting.identityPurchaseTotals.get(identityNullifier);
    val identityTotal: coins = identityPrevious.isFound ? identityPrevious.loadValue() : 0;
    assert (identityTotal + msg.maxValue <= terms.identityCapNanoTon) throw PrivaTestnetLaunchpadErrors.IdentityCapExceeded;

    var settlement = accounting.settlement.load();
    assert (!settlement.pendingMints.exists(msg.queryId)) throw PrivaTestnetLaunchpadErrors.QueryAlreadyPending;
    val rawJettonAmount = (requestedUnits * (terms.rawJettonPerSaleUnit as int)) as coins;
    val excess = valueCoins - msg.maxValue;
    val pending = PrivaPendingMint {
        sender,
        recipient: msg.recipient,
        authorization: PrivaPendingMintAuthorization {
            identityNullifier,
            actionNullifier,
        }.toCell(),
        amounts: PrivaPendingMintAmounts {
            rawJettonAmount,
            acceptedNanoTon: msg.maxValue,
            excessNanoTon: excess,
            refundNanoTon: excess,
        }.toCell(),
        state: PendingMintState,
    };
    accounting.usedActionNullifiers.set(actionNullifier, true);
    accounting.identityPurchaseTotals.set(identityNullifier, identityTotal + msg.maxValue);
    accounting.soldSaleUnits = accounting.soldSaleUnits + (requestedUnits as uint64);
    accounting.acceptedNanoTon = accounting.acceptedNanoTon + msg.maxValue;
    settlement.pendingMints.set(msg.queryId, pending.toCell());
    if (excess > 0) { settlement.userRefunds.set(msg.queryId, pending.toCell()); }
    accounting.settlement = settlement.toCell();
    storage.accounting = accounting.toCell();
    storage.save();
    emitTep74Mint(msg.queryId, msg.recipient, rawJettonAmount, terms);
}

fun emitRefund(queryId: uint64, sender: address, refundNanoTon: coins) {
    createMessage({
        bounce: BounceMode.RichBounce,
        value: refundNanoTon,
        dest: sender,
        body: PrivaRefundTransfer { queryId, refundNanoTon },
    }).send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun claimRefund(sender: address, msg: PrivaRefundClaim) {
    var storage = PrivaTestnetLaunchpadStorage.load();
    var accounting = storage.accounting.load();
    var settlement = accounting.settlement.load();
    val found = settlement.userRefunds.get(msg.queryId);
    assert (found.isFound) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
    val pending = found.loadValue().load();
    assert (pending.sender == sender) throw PrivaTestnetLaunchpadErrors.UnauthorizedRefundClaim;
    val amounts = pending.amounts.load();
    assert (amounts.refundNanoTon > 0) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
    // Remove before sending. A rich bounce deterministically recreates it,
    // preventing both a double claim and a lost refund.
    settlement.userRefunds.delete(msg.queryId);
    accounting.settlement = settlement.toCell();
    storage.accounting = accounting.toCell();
    storage.save();
    emitRefund(msg.queryId, sender, amounts.refundNanoTon);
}

fun onInternalMessage(inMsg: InMessage) {
    if (inMsg.body.remainingBitsCount() < 32) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    if (inMsg.body.preloadUint(32) == PrivaTestnetBuyOpcode) {
        val msg = lazy PrivaTestnetBuy.fromSlice(inMsg.body);
        match (msg) {
            PrivaTestnetBuy => {
            val messageTail = msg.forceLoadLazyObject();
            if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
                startBuy(inMsg.senderAddress, inMsg.valueCoins, msg);
            }
            else => { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        }
        return;
    }
    if (inMsg.body.preloadUint(32) == PrivaRefundClaimOpcode) {
        val claim = lazy PrivaRefundClaim.fromSlice(inMsg.body);
        match (claim) {
            PrivaRefundClaim => {
                val messageTail = claim.forceLoadLazyObject();
                if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
                claimRefund(inMsg.senderAddress, claim);
            }
            else => { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        }
        return;
    }
    throw PrivaTestnetLaunchpadErrors.MalformedMessage;
}

fun onBouncedMessage(inMsg: InMessageBounced) {
    val rich = lazy RichBounceBody.fromSlice(inMsg.bouncedBody);
    var body = rich.originalBody.beginParse();
    if (body.remainingBitsCount() < 32) { return; }
    val opcode = body.loadUint(32);
    if (opcode == Tep74MintOpcode) {
        if (body.remainingBitsCount() < 64) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        val queryId = body.loadUint(64) as uint64;
        var storage = PrivaTestnetLaunchpadStorage.load();
        val policy = storage.policy.load();
        val terms = policy.saleTerms.load();
        assert (inMsg.senderAddress == terms.jettonMinter) throw PrivaTestnetLaunchpadErrors.UnauthorizedBounce;
        var accounting = storage.accounting.load();
        var settlement = accounting.settlement.load();
        val found = settlement.pendingMints.get(queryId);
        assert (found.isFound) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
        val pending = found.loadValue().load();
        val authorization = pending.authorization.load();
        val amounts = pending.amounts.load();
        assert (accounting.soldSaleUnits >= (amounts.rawJettonAmount / terms.rawJettonPerSaleUnit)) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
        assert (accounting.acceptedNanoTon >= amounts.acceptedNanoTon) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
        val identityTotal = accounting.identityPurchaseTotals.mustGet(authorization.identityNullifier);
        assert (identityTotal >= amounts.acceptedNanoTon) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
        // A failed mint never leaves a paid allocation. Keep the action
        // nullifier consumed, but restore sale/cap accounting and make the
        // full received value claimable by the original sender.
        accounting.soldSaleUnits = accounting.soldSaleUnits - ((amounts.rawJettonAmount / terms.rawJettonPerSaleUnit) as uint64);
        accounting.acceptedNanoTon = accounting.acceptedNanoTon - amounts.acceptedNanoTon;
        accounting.identityPurchaseTotals.set(authorization.identityNullifier, identityTotal - amounts.acceptedNanoTon);
        settlement.pendingMints.delete(queryId);
        settlement.userRefunds.set(queryId, PrivaPendingMint {
            sender: pending.sender,
            recipient: pending.recipient,
            authorization: pending.authorization,
            amounts: PrivaPendingMintAmounts {
                rawJettonAmount: 0,
                acceptedNanoTon: 0,
                excessNanoTon: 0,
                refundNanoTon: amounts.acceptedNanoTon + amounts.excessNanoTon,
            }.toCell(),
            state: RefundPendingState,
        }.toCell());
        accounting.settlement = settlement.toCell();
        storage.accounting = accounting.toCell();
        storage.save();
        return;
    }
    if (opcode == PrivaRefundTransferOpcode) {
        if (body.remainingBitsCount() < 64) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        val queryId = body.loadUint(64) as uint64;
        val refundNanoTon = body.loadCoins();
        if (refundNanoTon == 0) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        var storage = PrivaTestnetLaunchpadStorage.load();
        var accounting = storage.accounting.load();
        var settlement = accounting.settlement.load();
        // Sender of a bounced refund is its original destination. Recreate a
        // minimal claim record so that the original recipient may retry.
        settlement.userRefunds.set(queryId, PrivaPendingMint {
            sender: inMsg.senderAddress,
            recipient: inMsg.senderAddress,
            authorization: PrivaPendingMintAuthorization {
                identityNullifier: 0,
                actionNullifier: 0,
            }.toCell(),
            amounts: PrivaPendingMintAmounts {
                rawJettonAmount: 0,
                acceptedNanoTon: 0,
                excessNanoTon: 0,
                refundNanoTon,
            }.toCell(),
            state: RefundPendingState,
        }.toCell());
        accounting.settlement = settlement.toCell();
        storage.accounting = accounting.toCell();
        storage.save();
    }
}

get fun getPrivaTestnetLaunchpadVersion(): int {
    return PrivaTestnetLaunchpadVersion;
}

get fun getPrivaTestnetBuyOpcode(): int {
    return PrivaTestnetBuyOpcode;
}
