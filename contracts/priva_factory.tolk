// Priva factory contract boundary.
//
// This deliberately rejects every inbound message. A future implementation may
// create launchpads only after it validates immutable configuration commitments,
// approved code hashes, and deterministic deployment inputs from the protocol
// specification. It must not be deployed to receive user funds in this state.

const FactoryProtocolVersion: int = 1;

enum FactoryErrors {
    DisabledUntilAuditedImplementation = 600
}

fun onInternalMessage(_msgValue: int, _inMsgBody: slice) {
    throw FactoryErrors.DisabledUntilAuditedImplementation;
}

get fun getFactoryProtocolVersion(): int {
    return FactoryProtocolVersion;
}
