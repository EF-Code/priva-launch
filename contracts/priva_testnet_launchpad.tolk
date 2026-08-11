import "@zk_tele_auth/priva_purchase_auth_verifier"
import "@stdlib/exotic-cells"

contract PrivaTestnetLaunchpad {
    description: "Fixed-price testnet launchpad with proof-bound allocation and bounce-safe refunds"
    storage: PrivaTestnetLaunchpadStorage
    incomingMessages: PrivaTestnetBuy | PrivaRefundClaim | PrivaJettonExcesses | PrivaMintFailure | PrivaClaimMinterAdmin
}

// Typed, testnet-candidate launchpad ABI.
//
// This candidate is testnet-only. Its immutable policy, sale terms, proof
// verifier, mint request and refund transitions must be validated together
// before any corresponding mainnet deployment is considered.

const PRIVA_TESTNET_LAUNCHPAD_VERSION: int = 1;
const PRIVA_TESTNET_BUY_OPCODE: int = 0x50525642; // "PRVB"

// Values pinned to ton-blockchain/jetton-contract revision d55f228edb0eb477.
const TEP74_MINT_OPCODE: int = 0x642b7d07;
const TEP74_INTERNAL_TRANSFER_OPCODE: int = 0x178d4519;
const TEP74_CLAIM_ADMIN_OPCODE: int = 0xfb88e119;
const TEP74_EXCESSES_OPCODE: int = 0xd53276db;
const PRIVA_MINT_FAILURE_OPCODE: int = 0x50525646; // "PRVF"

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
    UnauthorizedRefundClaim = 926,
    RefundSolvency = 927
}

const PRIVA_REFUND_CLAIM_OPCODE: int = 0x50525652; // "PRVR"
const PRIVA_REFUND_TRANSFER_OPCODE: int = 0x50524644; // "PRFD"
const PRIVA_CLAIM_MINTER_ADMIN_OPCODE: int = 0x50525641; // "PRVA"

/// Immutable economic and settlement values. This is a StateInit reference,
/// never a mutable administrator-managed configuration message.
struct PrivaTestnetSettlementTerms {
    jettonWalletCode: cell
    walletFundingNanoTon: coins
    mintMessageValueNanoTon: coins
    refundGasReserveNanoTon: coins
}

struct PrivaTestnetSaleTerms {
    jettonMinter: address
    priceNanoTonPerSaleUnit: coins
    totalSaleUnits: uint64
    rawJettonPerSaleUnit: coins
    identityCapNanoTon: coins
    settlement: Cell<PrivaTestnetSettlementTerms>
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
    pendingSaleUnits: uint64
    acceptedNanoTon: coins
    pendingAcceptedNanoTon: coins
    usedActionNullifiers: map<uint256, bool>
    usedQueryIds: map<uint64, bool>
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
    expectedJettonWallet: address
    saleUnits: uint64
    authorization: Cell<PrivaPendingMintAuthorization>
    amounts: Cell<PrivaPendingMintAmounts>
    state: uint8
}

const PENDING_MINT_STATE: uint8 = 1;
const REFUND_PENDING_STATE: uint8 = 2;
const REFUND_SENT_STATE: uint8 = 3;

struct PrivaTestnetAccountingView {
    soldSaleUnits: uint64
    pendingSaleUnits: uint64
    acceptedNanoTon: coins
    pendingAcceptedNanoTon: coins
}

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
                    settlement: PrivaTestnetSettlementTerms {
                        jettonWalletCode: createEmptyCell(),
                        walletFundingNanoTon: 0,
                        mintMessageValueNanoTon: 0,
                        refundGasReserveNanoTon: 0,
                    }.toCell(),
                }.toCell(),
            }.toCell(),
            accounting: PrivaTestnetLaunchpadAccountingStorage {
                soldSaleUnits: 0,
                pendingSaleUnits: 0,
                acceptedNanoTon: 0,
                pendingAcceptedNanoTon: 0,
                usedActionNullifiers: [],
                usedQueryIds: [],
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

/// Permissionless trigger for the reference minter's second-stage admin
/// transfer. The minter accepts the emitted claim only after its current admin
/// has nominated this launchpad as `next_admin_address`.
struct (0x50525641) PrivaClaimMinterAdmin {
    queryId: uint64
}

/// TEP-74 delivery acknowledgement emitted by the expected recipient wallet.
/// It is exported in the ABI now, but remains fail-closed until the settled
/// mint state machine authenticates the sender, query ID, and pending record.
struct (0xd53276db) PrivaJettonExcesses {
    queryId: uint64
}

/// Terminal failure callback emitted by the reviewed settlement minter
/// extension after its downstream wallet transfer has bounced.
struct (0x50525646) PrivaMintFailure {
    queryId: uint64
    jettonAmount: coins
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

/// Derive the canonical TEP-74 wallet address from the exact wallet code and
/// immutable owner/master inputs. The code cell is pinned in StateInit so an
/// attacker cannot nominate a different wallet implementation in a callback.
fun calculateExpectedJettonWallet(owner: address, minter: address, walletCode: cell): address {
    val walletData = beginCell()
        .storeUint(0, 4) // status
        .storeCoins(0)
        .storeAddress(owner)
        .storeAddress(minter)
        .endCell();
    val stateInit = beginCell()
        .storeUint(0, 2) // no split depth, no special
        .storeMaybeRef(walletCode)
        .storeMaybeRef(walletData)
        .storeUint(0, 1) // empty library
        .endCell();
    return address.fromWorkchainAndHash(0, stateInit.hash());
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
        .storeUint(TEP74_INTERNAL_TRANSFER_OPCODE, 32)
        .storeUint(queryId, 64)
        .storeCoins(rawJettonAmount)
        .storeAddress(from)
        .storeAddress(responseAddress)
        .storeCoins(0)
        .storeBool(false)
        .endCell();
}

/// Build the privileged `mint#642b7d07` body accepted by the selected TEP-74
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
        .storeUint(TEP74_MINT_OPCODE, 32)
        .storeUint(queryId, 64)
        .storeAddress(recipient)
        .storeCoins(walletFundingNanoTon)
        .storeRef(internalTransfer)
        .endCell();
}

fun checkSaleTerms(terms: PrivaTestnetSaleTerms) {
    val settlement = terms.settlement.load();
    assert (terms.priceNanoTonPerSaleUnit > 0 && terms.totalSaleUnits > 0) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
    assert (terms.rawJettonPerSaleUnit > 0 && terms.identityCapNanoTon > 0) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
    assert (settlement.walletFundingNanoTon > 0 && settlement.mintMessageValueNanoTon >= settlement.walletFundingNanoTon) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
    assert (settlement.refundGasReserveNanoTon > 0) throw PrivaTestnetLaunchpadErrors.InvalidSaleTerms;
}

fun emitTep74Mint(queryId: uint64, recipient: address, rawJettonAmount: coins, terms: PrivaTestnetSaleTerms) {
    val settlement = terms.settlement.load();
    val body = buildTep74MintBody(
        queryId,
        recipient,
        settlement.walletFundingNanoTon,
        rawJettonAmount,
        contract.getAddress(),
    );
    val mintMessage = createMessage({
        bounce: BounceMode.RichBounce,
        value: settlement.mintMessageValueNanoTon,
        dest: terms.jettonMinter,
        body,
    });
    mintMessage.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
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
    val settlementTerms = terms.settlement.load();
    checkSaleTerms(terms);

    // maxValue is the exact requested sale value. The immutable gas reserve
    // remains in the launchpad; only value above price + reserve is refundable.
    assert (msg.maxValue > 0 && valueCoins >= msg.maxValue + settlementTerms.refundGasReserveNanoTon) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;
    assert (msg.maxValue >= settlementTerms.mintMessageValueNanoTon) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;
    val pricePerUnit = terms.priceNanoTonPerSaleUnit as int;
    assert ((msg.maxValue as int) % pricePerUnit == 0) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;
    val requestedUnits = (msg.maxValue as int) / pricePerUnit;
    assert (requestedUnits > 0) throw PrivaTestnetLaunchpadErrors.InvalidPurchaseValue;

    var accounting = storage.accounting.load();
    val identityNullifier = inputs.get(0) as uint256;
    val actionNullifier = inputs.get(1) as uint256;
    assert (!accounting.usedActionNullifiers.exists(actionNullifier)) throw PrivaTestnetLaunchpadErrors.ActionAlreadyUsed;
    assert (!accounting.usedQueryIds.exists(msg.queryId)) throw PrivaTestnetLaunchpadErrors.QueryAlreadyPending;
    val committedUnits = (accounting.soldSaleUnits as int) + (accounting.pendingSaleUnits as int);
    assert (committedUnits <= (terms.totalSaleUnits as int) && requestedUnits <= ((terms.totalSaleUnits as int) - committedUnits)) throw PrivaTestnetLaunchpadErrors.SoldOut;
    val identityPrevious = accounting.identityPurchaseTotals.get(identityNullifier);
    val identityTotal: coins = identityPrevious.isFound ? identityPrevious.loadValue() : 0;
    assert (identityTotal + msg.maxValue <= terms.identityCapNanoTon) throw PrivaTestnetLaunchpadErrors.IdentityCapExceeded;

    var settlement = accounting.settlement.load();
    assert (!settlement.pendingMints.exists(msg.queryId)) throw PrivaTestnetLaunchpadErrors.QueryAlreadyPending;
    val rawJettonAmount = (((msg.maxValue as int) * (terms.rawJettonPerSaleUnit as int)) / pricePerUnit) as coins;
    val excess = valueCoins - msg.maxValue - settlementTerms.refundGasReserveNanoTon;
    val pending = PrivaPendingMint {
        sender,
        recipient: msg.recipient,
        expectedJettonWallet: calculateExpectedJettonWallet(msg.recipient, terms.jettonMinter, settlementTerms.jettonWalletCode),
        saleUnits: requestedUnits as uint64,
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
        state: PENDING_MINT_STATE,
    };
    accounting.usedActionNullifiers.set(actionNullifier, true);
    accounting.usedQueryIds.set(msg.queryId, true);
    accounting.identityPurchaseTotals.set(identityNullifier, identityTotal + msg.maxValue);
    accounting.pendingSaleUnits = accounting.pendingSaleUnits + (requestedUnits as uint64);
    accounting.pendingAcceptedNanoTon = accounting.pendingAcceptedNanoTon + msg.maxValue;
    settlement.pendingMints.set(msg.queryId, pending.toCell());
    accounting.settlement = settlement.toCell();
    storage.accounting = accounting.toCell();
    storage.save();
    emitTep74Mint(msg.queryId, msg.recipient, rawJettonAmount, terms);
}

fun makeRefundRecord(pending: PrivaPendingMint, refundNanoTon: coins, state: uint8): PrivaPendingMint {
    return PrivaPendingMint {
        sender: pending.sender,
        recipient: pending.recipient,
        expectedJettonWallet: pending.expectedJettonWallet,
        saleUnits: 0,
        authorization: pending.authorization,
        amounts: PrivaPendingMintAmounts {
            rawJettonAmount: 0,
            acceptedNanoTon: 0,
            excessNanoTon: 0,
            refundNanoTon,
        }.toCell(),
        state,
    };
}

/// Release a pending reservation after a terminal mint failure. The action
/// nullifier and query ID remain consumed, preventing proof or message replay.
fun settleMintFailure(queryId: uint64, sender: address, returnedValue: coins, callbackJettonAmount: coins) {
    var storage = PrivaTestnetLaunchpadStorage.load();
    val terms = storage.policy.load().saleTerms.load();
    assert (sender == terms.jettonMinter) throw PrivaTestnetLaunchpadErrors.UnauthorizedBounce;
    var accounting = storage.accounting.load();
    var settlement = accounting.settlement.load();
    val found = settlement.pendingMints.get(queryId);
    assert (found.isFound) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    val pending = found.loadValue().load();
    assert (pending.state == PENDING_MINT_STATE) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    val authorization = pending.authorization.load();
    val amounts = pending.amounts.load();
    assert (callbackJettonAmount == amounts.rawJettonAmount) throw PrivaTestnetLaunchpadErrors.UnauthorizedBounce;
    val identityTotal = accounting.identityPurchaseTotals.mustGet(authorization.identityNullifier);
    assert (accounting.pendingSaleUnits >= pending.saleUnits) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    assert (accounting.pendingAcceptedNanoTon >= amounts.acceptedNanoTon) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    assert (identityTotal >= amounts.acceptedNanoTon) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;

    accounting.pendingSaleUnits = accounting.pendingSaleUnits - pending.saleUnits;
    accounting.pendingAcceptedNanoTon = accounting.pendingAcceptedNanoTon - amounts.acceptedNanoTon;
    if (identityTotal == amounts.acceptedNanoTon) {
        accounting.identityPurchaseTotals.delete(authorization.identityNullifier);
    } else {
        accounting.identityPurchaseTotals.set(authorization.identityNullifier, identityTotal - amounts.acceptedNanoTon);
    }
    settlement.pendingMints.delete(queryId);
    val refundNanoTon = amounts.acceptedNanoTon + amounts.excessNanoTon + returnedValue;
    if (refundNanoTon > 0) {
        settlement.userRefunds.set(queryId, makeRefundRecord(pending, refundNanoTon, REFUND_PENDING_STATE).toCell());
    }
    accounting.settlement = settlement.toCell();
    storage.accounting = accounting.toCell();
    storage.save();
}

/// Finalize only after an authenticated excesses message from the exact
/// recipient wallet derived from immutable TEP-74 code/data.
fun settleMintSuccess(queryId: uint64, sender: address, returnedValue: coins) {
    var storage = PrivaTestnetLaunchpadStorage.load();
    var accounting = storage.accounting.load();
    var settlement = accounting.settlement.load();
    val found = settlement.pendingMints.get(queryId);
    assert (found.isFound) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    val pending = found.loadValue().load();
    assert (pending.state == PENDING_MINT_STATE) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    assert (pending.expectedJettonWallet == sender) throw PrivaTestnetLaunchpadErrors.UnauthorizedBounce;
    val amounts = pending.amounts.load();
    assert (accounting.pendingSaleUnits >= pending.saleUnits) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;
    assert (accounting.pendingAcceptedNanoTon >= amounts.acceptedNanoTon) throw PrivaTestnetLaunchpadErrors.UnknownPendingMint;

    accounting.pendingSaleUnits = accounting.pendingSaleUnits - pending.saleUnits;
    accounting.pendingAcceptedNanoTon = accounting.pendingAcceptedNanoTon - amounts.acceptedNanoTon;
    accounting.soldSaleUnits = accounting.soldSaleUnits + pending.saleUnits;
    accounting.acceptedNanoTon = accounting.acceptedNanoTon + amounts.acceptedNanoTon;
    settlement.pendingMints.delete(queryId);
    val refundNanoTon = amounts.excessNanoTon + returnedValue;
    if (refundNanoTon > 0) {
        settlement.userRefunds.set(queryId, makeRefundRecord(pending, refundNanoTon, REFUND_PENDING_STATE).toCell());
    }
    accounting.settlement = settlement.toCell();
    storage.accounting = accounting.toCell();
    storage.save();
}

fun emitRefund(queryId: uint64, sender: address, refundNanoTon: coins, gasReserveNanoTon: coins) {
    reserveToncoinsOnBalance(gasReserveNanoTon, RESERVE_MODE_EXACT_AMOUNT | RESERVE_MODE_BOUNCE_ON_ACTION_FAIL);
    val refundMessage = createMessage({
        bounce: BounceMode.RichBounce,
        value: refundNanoTon,
        dest: sender,
        body: PrivaRefundTransfer { queryId, refundNanoTon },
    });
    refundMessage.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun claimMinterAdmin(msg: PrivaClaimMinterAdmin) {
    val terms = PrivaTestnetLaunchpadStorage.load().policy.load().saleTerms.load();
    val settlement = terms.settlement.load();
    checkSaleTerms(terms);
    val claimBody = beginCell()
        .storeUint(TEP74_CLAIM_ADMIN_OPCODE, 32)
        .storeUint(msg.queryId, 64)
        .endCell();
    val claimMessage = createMessage({
        bounce: BounceMode.RichBounce,
        value: settlement.mintMessageValueNanoTon,
        dest: terms.jettonMinter,
        body: claimBody,
    });
    claimMessage.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

fun claimRefund(sender: address, msg: PrivaRefundClaim) {
    var storage = PrivaTestnetLaunchpadStorage.load();
    var accounting = storage.accounting.load();
    var settlement = accounting.settlement.load();
    val found = settlement.userRefunds.get(msg.queryId);
    assert (found.isFound) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
    var pending = found.loadValue().load();
    assert (pending.sender == sender) throw PrivaTestnetLaunchpadErrors.UnauthorizedRefundClaim;
    assert (pending.state == REFUND_PENDING_STATE) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
    val amounts = pending.amounts.load();
    assert (amounts.refundNanoTon > 0) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
    val terms = storage.policy.load().saleTerms.load();
    val settlementTerms = terms.settlement.load();
    checkSaleTerms(terms);
    assert (contract.getOriginalBalance() >= amounts.refundNanoTon + settlementTerms.refundGasReserveNanoTon) throw PrivaTestnetLaunchpadErrors.RefundSolvency;
    // Keep a sent marker so a second claim cannot race this outbound transfer.
    // A rich bounce changes it back to REFUND_PENDING after authenticating the
    // original recipient and exact amount.
    pending.state = REFUND_SENT_STATE;
    settlement.userRefunds.set(msg.queryId, pending.toCell());
    accounting.settlement = settlement.toCell();
    storage.accounting = accounting.toCell();
    storage.save();
    emitRefund(msg.queryId, sender, amounts.refundNanoTon, settlementTerms.refundGasReserveNanoTon);
}

fun onInternalMessage(inMsg: InMessage) {
    // Standard StateInit deployment and explicit operator top-ups have an
    // empty body. They cannot change policy or accounting.
    if (inMsg.body.isEmpty()) { return; }
    if (inMsg.body.remainingBitsCount() < 32) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    if (inMsg.body.preloadUint(32) == PRIVA_TESTNET_BUY_OPCODE) {
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
    if (inMsg.body.preloadUint(32) == TEP74_EXCESSES_OPCODE) {
        val excesses = lazy PrivaJettonExcesses.fromSlice(inMsg.body);
        match (excesses) {
            PrivaJettonExcesses => {
                val messageTail = excesses.forceLoadLazyObject();
                if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
                settleMintSuccess(excesses.queryId, inMsg.senderAddress, inMsg.valueCoins);
            }
            else => { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        }
        return;
    }
    if (inMsg.body.preloadUint(32) == PRIVA_MINT_FAILURE_OPCODE) {
        val failure = lazy PrivaMintFailure.fromSlice(inMsg.body);
        match (failure) {
            PrivaMintFailure => {
                val messageTail = failure.forceLoadLazyObject();
                if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
                settleMintFailure(failure.queryId, inMsg.senderAddress, inMsg.valueCoins, failure.jettonAmount);
            }
            else => { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        }
        return;
    }
    if (inMsg.body.preloadUint(32) == PRIVA_REFUND_CLAIM_OPCODE) {
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
    if (inMsg.body.preloadUint(32) == PRIVA_CLAIM_MINTER_ADMIN_OPCODE) {
        val claim = lazy PrivaClaimMinterAdmin.fromSlice(inMsg.body);
        match (claim) {
            PrivaClaimMinterAdmin => {
                val messageTail = claim.forceLoadLazyObject();
                if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
                claimMinterAdmin(claim);
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
    if (opcode == TEP74_MINT_OPCODE) {
        if (body.remainingBitsCount() < 64) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        val queryId = body.loadUint(64) as uint64;
        body.loadAddress();
        body.loadCoins();
        if (body.remainingRefsCount() != 1) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        val internalTransfer = body.loadRef();
        var transfer = internalTransfer.beginParse();
        if (transfer.remainingBitsCount() < 32 + 64) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        if (transfer.loadUint(32) != TEP74_INTERNAL_TRANSFER_OPCODE) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        transfer.loadUint(64);
        val callbackJettonAmount = transfer.loadCoins();
        if (transfer.remainingBitsCount() < 1) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        settleMintFailure(queryId, inMsg.senderAddress, inMsg.valueCoins, callbackJettonAmount);
        return;
    }
    if (opcode == PRIVA_REFUND_TRANSFER_OPCODE) {
        if (body.remainingBitsCount() < 64) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        val queryId = body.loadUint(64) as uint64;
        val refundNanoTon = body.loadCoins();
        if (refundNanoTon == 0) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        if (body.remainingBitsCount() != 0 || body.remainingRefsCount() != 0) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
        var storage = PrivaTestnetLaunchpadStorage.load();
        var accounting = storage.accounting.load();
        var settlement = accounting.settlement.load();
        val found = settlement.userRefunds.get(queryId);
        assert (found.isFound) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
        var pending = found.loadValue().load();
        val amounts = pending.amounts.load();
        assert (pending.state == REFUND_SENT_STATE) throw PrivaTestnetLaunchpadErrors.UnknownRefund;
        assert (pending.sender == inMsg.senderAddress) throw PrivaTestnetLaunchpadErrors.UnauthorizedBounce;
        assert (amounts.refundNanoTon == refundNanoTon) throw PrivaTestnetLaunchpadErrors.UnauthorizedBounce;
        pending.state = REFUND_PENDING_STATE;
        settlement.userRefunds.set(queryId, pending.toCell());
        accounting.settlement = settlement.toCell();
        storage.accounting = accounting.toCell();
        storage.save();
    }
}

get fun getPrivaTestnetLaunchpadVersion(): int {
    return PRIVA_TESTNET_LAUNCHPAD_VERSION;
}

get fun getPrivaTestnetBuyOpcode(): int {
    return PRIVA_TESTNET_BUY_OPCODE;
}

get fun getPrivaTestnetAccounting(): PrivaTestnetAccountingView {
    val accounting = PrivaTestnetLaunchpadStorage.load().accounting.load();
    return PrivaTestnetAccountingView {
        soldSaleUnits: accounting.soldSaleUnits,
        pendingSaleUnits: accounting.pendingSaleUnits,
        acceptedNanoTon: accounting.acceptedNanoTon,
        pendingAcceptedNanoTon: accounting.pendingAcceptedNanoTon,
    };
}

/// Returns 0 for an unused query, 1 for a pending mint, 2 for a refundable
/// claim, and 3 for a successfully sent refund awaiting bounce finality.
get fun getPrivaTestnetQueryState(queryId: uint64): int {
    val accounting = PrivaTestnetLaunchpadStorage.load().accounting.load();
    val settlement = accounting.settlement.load();
    val pending = settlement.pendingMints.get(queryId);
    if (pending.isFound) {
        return pending.loadValue().load().state;
    }
    val refund = settlement.userRefunds.get(queryId);
    if (refund.isFound) {
        return refund.loadValue().load().state;
    }
    return 0;
}

get fun getPrivaTestnetIdentityTotal(identityNullifier: uint256): coins {
    val accounting = PrivaTestnetLaunchpadStorage.load().accounting.load();
    val total = accounting.identityPurchaseTotals.get(identityNullifier);
    return total.isFound ? total.loadValue() : 0;
}

get fun getPrivaTestnetQueryUsed(queryId: uint64): bool {
    return PrivaTestnetLaunchpadStorage.load().accounting.load().usedQueryIds.exists(queryId);
}
