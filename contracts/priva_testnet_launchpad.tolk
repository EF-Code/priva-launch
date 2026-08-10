// Typed, testnet-candidate launchpad ABI.
//
// This is deliberately not registered as an active value-handling contract.
// It freezes the message shape and query identifiers that the eventual
// verifier-inlined implementation must support. Buy messages still fail before
// touching balances or nullifier state.

const PrivaTestnetLaunchpadVersion: int = 1;
const PrivaTestnetBuyOpcode: int = 0x50525642; // "PRVB"

enum PrivaTestnetLaunchpadErrors {
    VerifierNotInlined = 901,
    MalformedMessage = 902
}

struct (0x50525642) PrivaTestnetBuy {
    queryId: uint64
    maxValue: coins
    recipient: address
    proof: cell
    publicInputs: cell
}

fun onInternalMessage(inMsg: InMessage) {
    val msg = lazy PrivaTestnetBuy.fromSlice(inMsg.body);
    match (msg) {
        PrivaTestnetBuy => {
            val messageTail = msg.forceLoadLazyObject();
            if (!messageTail.isEmpty()) { throw PrivaTestnetLaunchpadErrors.MalformedMessage; }
            // Do not accept, account for, or forward value until this exact
            // message invokes the reviewed inlined verifier synchronously.
            throw PrivaTestnetLaunchpadErrors.VerifierNotInlined;
        }
        else => {
            assert (inMsg.body.isEmpty()) throw PrivaTestnetLaunchpadErrors.MalformedMessage;
            throw PrivaTestnetLaunchpadErrors.VerifierNotInlined;
        }
    }
}

get fun getPrivaTestnetLaunchpadVersion(): int {
    return PrivaTestnetLaunchpadVersion;
}

get fun getPrivaTestnetBuyOpcode(): int {
    return PrivaTestnetBuyOpcode;
}
