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
    AuthorizationTtlExceeded = 916
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
}

/// Persistent layout for the eventual settled-buy path. It is intentionally
/// separate from the currently closed handler: state must only be saved in the
/// same transaction that either mints the exact quoted amount or records a
/// recoverable pending operation/refund.
struct PrivaTestnetLaunchpadSettlementStorage {
    pendingMints: dict
    userRefunds: dict
}

struct PrivaTestnetLaunchpadAccountingStorage {
    soldSaleUnits: uint64
    acceptedNanoTon: coins
    usedActionNullifiers: dict
    identityPurchaseTotals: dict
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
struct PrivaPendingMint {
    sender: address
    recipient: address
    identityNullifier: uint256
    actionNullifier: uint256
    rawJettonAmount: coins
    acceptedNanoTon: coins
    excessNanoTon: coins
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
            }.toCell(),
            accounting: PrivaTestnetLaunchpadAccountingStorage {
                soldSaleUnits: 0,
                acceptedNanoTon: 0,
                usedActionNullifiers: createEmptyDict(),
                identityPurchaseTotals: createEmptyDict(),
                settlement: PrivaTestnetLaunchpadSettlementStorage {
                    pendingMints: createEmptyDict(),
                    userRefunds: createEmptyDict(),
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

fun onInternalMessage(inMsg: InMessage) {
    val msg = lazy PrivaTestnetBuy.fromSlice(inMsg.body);
    match (msg) {
        PrivaTestnetBuy => {
            val messageTail = msg.forceLoadLazyObject();
            if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
            // This is an in-process call to the pinned verifier core. The
            // state-machine gate remains closed until it checks every bound
            // public signal and persists nullifier/accounting state.
            val verifierMessage = PrivaPurchaseAuthVerifierVerify {
                proof: msg.proof,
                pubInputs: msg.publicInputs,
            };
            assert (PrivaPurchaseAuthVerifier.create().verifyProof(verifierMessage)) throw PrivaTestnetLaunchpadErrors.WrongProof;
            val storage = PrivaTestnetLaunchpadStorage.load();
            checkFixedBuySignals(parsePrivaPublicInputs(msg.publicInputs), msg.recipient, storage.policy.load());
            throw PrivaTestnetLaunchpadErrors.PolicyAndStateNotImplemented;
        }
        else => {
            assert (inMsg.body.isEmpty()) throw PrivaTestnetLaunchpadErrors.MalformedMessage;
            throw PrivaTestnetLaunchpadErrors.PolicyAndStateNotImplemented;
        }
    }
}

get fun getPrivaTestnetLaunchpadVersion(): int {
    return PrivaTestnetLaunchpadVersion;
}

get fun getPrivaTestnetBuyOpcode(): int {
    return PrivaTestnetBuyOpcode;
}
