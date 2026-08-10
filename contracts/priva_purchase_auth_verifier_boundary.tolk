// Priva purchase-authorization verifier integration boundary.
//
// The Groth16 implementation is generated in the sibling zk-tele-auth
// repository as `contracts/priva_purchase_auth_verifier.tolk`. It has a
// standalone `onInternalMessage` entrypoint, so importing it into a launchpad
// would either fail composition or tempt an unsafe asynchronous callback
// design. TON internal calls cannot synchronously return proof validity.
//
// This contract therefore records the exact ABI that a future *inlined*,
// independently reviewed verifier must implement. It is deliberately not a
// verifier and rejects all messages. No launchpad may treat this boundary, a
// gateway response, or a successful call to another contract as authorization.

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

enum PrivaPurchaseAuthVerifierBoundaryErrors {
    DisabledUntilInlinedAuditedVerifier = 850
}

// Deliberately rejects proof envelopes. The eventual launchpad must invoke an
// inlined pure verifier before changing nullifier or sale state; it must not
// forward this message to a separately deployed verifier contract.
fun onInternalMessage(_msgValue: int, _inMsgBody: slice) {
    throw PrivaPurchaseAuthVerifierBoundaryErrors.DisabledUntilInlinedAuditedVerifier;
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
