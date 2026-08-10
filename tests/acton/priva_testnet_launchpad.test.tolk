import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/build"
import "@stdlib/tvm-dicts"
import "PrivaTestnetLaunchpad.gen"

/// Builds StateInit data using the exact nested reference layout required by
/// the candidate. Values are intentionally non-production test values.
fun configuredCandidate(): PrivaTestnetLaunchpad {
    val saleTerms = beginCell()
        .storeAddress(address("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"))
        .storeCoins(1000000)
        .storeUint(1000, 64)
        .storeCoins(1000000000)
        .storeCoins(100000000)
        .storeCoins(50000000)
        .storeCoins(50000000)
        .endCell();
    val policy = beginCell()
        .storeUint(1, 256)
        .storeUint(2, 256)
        .storeUint(3, 256)
        .storeUint(86400, 32)
        .storeUint(300, 32)
        .storeUint(600, 32)
        .storeBool(false)
        .storeRef(saleTerms)
        .endCell();
    val settlement = beginCell().storeDict(createEmptyDict()).storeDict(createEmptyDict()).endCell();
    val accounting = beginCell()
        .storeUint(0, 64)
        .storeCoins(0)
        .storeDict(createEmptyDict())
        .storeDict(createEmptyDict())
        .storeRef(settlement)
        .endCell();
    val stateInit = ContractState {
        code: build("priva_testnet_launchpad"),
        data: beginCell().storeRef(policy).storeRef(accounting).endCell(),
    };
    val address = AutoDeployAddress { stateInit }.calculateAddress();
    return PrivaTestnetLaunchpad { address, stateInit };
}

get fun `test configured candidate deploys and rejects unknown ABI`() {
    val deployer = testing.treasury("candidate-deployer");
    val contract = configuredCandidate();
    val deployed = contract.deploy(deployer.address, { value: ton("1") });
    expect(deployed).toHaveSuccessfulDeploy({ to: contract.address });
    val malformed = contract.sendAny(deployer.address, beginCell().storeUint(0x12345678, 32).endCell(), { value: ton("0.1") });
    expect(malformed).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: 902,
    });
}
