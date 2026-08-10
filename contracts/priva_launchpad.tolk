// Priva per-launch contract boundary.
//
// This deliberately rejects every inbound message. It is a compileable safety
// scaffold, not a deployable launchpad. The previous sketch accepted TON while
// ignoring its proof, allocation, minting, and migration obligations.
//
// `priva_purchase_auth` has an explicit ABI boundary in
// priva_purchase_auth_verifier_boundary.tolk. It is not imported here because
// its generated Groth16 verifier currently has a standalone entrypoint and
// TON calls cannot synchronously return proof validity. This launchpad remains
// unable to accept buys until an audited verifier is inlined and exercised
// before any sale-state mutation.

const LaunchpadProtocolVersion: int = 1;

enum LaunchpadErrors {
    DisabledUntilAuditedImplementation = 700
}

fun onInternalMessage(_msgValue: int, _inMsgBody: slice) {
    throw LaunchpadErrors.DisabledUntilAuditedImplementation;
}

get fun getLaunchpadProtocolVersion(): int {
    return LaunchpadProtocolVersion;
}
