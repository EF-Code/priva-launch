import "@zk_tele_auth/priva_purchase_auth_verifier"

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
    WrongProof = 903
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
            // This is an in-process call to the pinned verifier core. The
            // state-machine gate remains closed until it checks every bound
            // public signal and persists nullifier/accounting state.
            val verifierMessage = PrivaPurchaseAuthVerifierVerify {
                proof: msg.proof,
                pubInputs: msg.publicInputs,
            };
            assert (PrivaPurchaseAuthVerifier.create().verifyProof(verifierMessage)) throw PrivaTestnetLaunchpadErrors.WrongProof;
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
