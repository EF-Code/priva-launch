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

enum PrivaTestnetLaunchpadErrors {
    PolicyAndStateNotImplemented = 901,
    MalformedMessage = 902,
    WrongProof = 903,
    Unauthorized = 904,
    WrongOperation = 905,
    ExpiredAuthorization = 906,
    WrongCircuitVersion = 907
}

/// Persistent layout for the eventual settled-buy path. It is intentionally
/// separate from the currently closed handler: state must only be saved in the
/// same transaction that either mints the exact quoted amount or records a
/// recoverable pending operation/refund.
struct PrivaTestnetLaunchpadStorage {
    soldSaleUnits: uint64
    acceptedNanoTon: coins
    usedActionNullifiers: dict
    identityPurchaseTotals: dict
    pendingMints: dict
    userRefunds: dict
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
            soldSaleUnits: 0,
            acceptedNanoTon: 0,
            usedActionNullifiers: createEmptyDict(),
            identityPurchaseTotals: createEmptyDict(),
            pendingMints: createEmptyDict(),
            userRefunds: createEmptyDict(),
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

/// Decode the exact 15-element public-input envelope checked by the pinned
/// verifier core. Parsing the same canonical envelope avoids a policy check on
/// a differently serialized set of values.
fun parsePrivaPublicInputs(pubInputsCell: cell): array<int> {
    val (initialPayload, payloadIsExotic) = pubInputsCell.beginParseSpecial();
    if (payloadIsExotic || initialPayload.remainingBitsCount() < 8) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    var payload = initialPayload;
    if (payload.loadUint(8) != 15) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    PrivaPurchaseAuthVerifier.checkPublicInputsPayloadShape(payload);

    var out: array<int> = [];
    repeat (15) {
        out.push(PrivaPurchaseAuthVerifier.loadNextPubInput(mutate payload));
    }
    if (payload.remainingBitsCount() != 0 || payload.remainingRefsCount() != 0) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
    return out;
}

fun checkFixedBuySignals(inputs: array<int>) {
    // Signal indexes are pinned by priva_purchase_auth/v1:
    // authorized=2, operation=10, expiryEpoch=13, circuitVersion=14.
    assert (inputs.get(2) == 1) throw PrivaTestnetLaunchpadErrors.Unauthorized;
    assert (inputs.get(10) == 1) throw PrivaTestnetLaunchpadErrors.WrongOperation;
    assert (inputs.get(14) == 1) throw PrivaTestnetLaunchpadErrors.WrongCircuitVersion;
    assert (inputs.get(13) >= blockchain.now()) throw PrivaTestnetLaunchpadErrors.ExpiredAuthorization;
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
            checkFixedBuySignals(parsePrivaPublicInputs(msg.publicInputs));
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
