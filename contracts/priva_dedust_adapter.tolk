// Priva DeDust migration boundary.
//
// This is intentionally fail-closed. A real adapter may be enabled only after
// its exact DeDust factory/pool message layout, allowed code hashes, LP policy,
// callbacks, and bounce handling are tested on testnet and audited.

const DeDustAdapterProtocolVersion: int = 1;

enum DeDustAdapterErrors {
    DisabledUntilAuditedImplementation = 800
}

fun onInternalMessage(_msgValue: int, _inMsgBody: slice) {
    throw DeDustAdapterErrors.DisabledUntilAuditedImplementation;
}

get fun getDeDustAdapterProtocolVersion(): int {
    return DeDustAdapterProtocolVersion;
}
