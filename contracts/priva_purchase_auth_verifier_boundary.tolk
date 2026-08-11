// Priva purchase-authorization verifier integration boundary.
//
// The Groth16 implementation is generated in the sibling zk-tele-auth
// repository as `contracts/priva_purchase_auth_verifier.tolk`. This contract
// is a stateless, testnet-only proof-checking candidate that composes that
// generated core and checks a complete proof envelope synchronously.
//
// It is *not* a purchase authorizer. It does not bind a proof to a launchpad,
// recipient, sale terms, gateway policy, nullifier, or state transition. The
// real launchpad must import the pure verifier core directly and perform all of
// those checks before mutating state. A separately deployed verifier must never
// be used as an asynchronous authorization callback.

import "@zk_tele_auth/priva_purchase_auth_verifier"

contract PrivaPurchaseAuthVerifierBoundary {
    description: "Testnet-only stateless Groth16 proof-checking candidate; not a purchase authorizer"
    storage: PrivaPurchaseAuthVerifierStorage
    incomingMessages: PrivaPurchaseAuthVerifierVerify
}

const PrivaPurchaseAuthCircuitVersion: int = 1;
const PrivaPurchaseAuthPublicInputCount: int = 17;
const PrivaPurchaseAuthBuyOperation: int = 1;

enum PrivaPurchaseAuthPublicInputIndex {
    IdentityNullifier = 0,
    ActionNullifier = 1,
    IsAuthorized = 2,
    AppDomainHash = 3,
    CurrentTimestamp = 4,
    MaxTokenAgeSec = 5,
    IsPremiumRequired = 6,
    IssuerKeyHash = 7,
    LaunchIdHash = 8,
    LaunchpadAddressHi = 9,
    LaunchpadAddressLo = 10,
    Operation = 11,
    RecipientAddressHi = 12,
    RecipientAddressLo = 13,
    ClientNonce = 14,
    ExpiryEpoch = 15,
    CircuitVersion = 16
}

// This handler only answers the cryptographic question "is this proof
// envelope valid under the generated v1 verification key?" It deliberately
// has no persistent writes and no privileged sender check. Any caller that
// needs authorization must perform the launchpad-local policy and replay
// checks itself, before accepting value or consuming a nullifier.
fun onInternalMessage(inMsg: InMessage) {
    val msg = lazy PrivaPurchaseAuthVerifierVerify.fromSlice(inMsg.body);

    match (msg) {
        PrivaPurchaseAuthVerifierVerify => {
            assert (inMsg.valueCoins >= PRIVA_PURCHASE_AUTH_VERIFIER_MIN_VERIFY_VALUE) throw PrivaPurchaseAuthVerifierErrors.NotEnoughValue;
            val messageTail = msg.forceLoadLazyObject();
            if (!messageTail.isEmpty()) { throw PrivaPurchaseAuthVerifierErrors.InvalidInputs; }
            assert (PrivaPurchaseAuthVerifier.create().verifyProof(msg)) throw PrivaPurchaseAuthVerifierErrors.WrongProof;
        }
        else => {
            // An empty body is the standard StateInit deployment/top-up path.
            // Any non-empty unknown body is malformed and cannot be treated as
            // a successful verification.
            assert (inMsg.body.isEmpty()) throw PrivaPurchaseAuthVerifierErrors.InvalidInputs;
        }
    }
}

get fun getPrivaPurchaseAuthCircuitVersion(): int {
    return PrivaPurchaseAuthCircuitVersion;
}

get fun getPrivaPurchaseAuthPublicInputCount(): int {
    return PrivaPurchaseAuthPublicInputCount;
}

get fun getPrivaPurchaseAuthBuyOperation(): int {
    return PrivaPurchaseAuthBuyOperation;
}
