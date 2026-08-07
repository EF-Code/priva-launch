// Priva per-launch contract boundary.
//
// This deliberately rejects every inbound message. It is a compileable safety
// scaffold, not a deployable launchpad. The previous sketch accepted TON while
// ignoring its proof, allocation, minting, and migration obligations.

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
