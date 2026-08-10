import "@stdlib/gas-payments"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "PrivaLaunchpad.gen"

/// The current published launchpad must be impossible to activate. This is a
/// regression test for the fail-closed boundary, not lifecycle coverage.
get fun `test deployment remains fail closed`() {
    val deployer = testing.treasury("deployer");
    val contract = PrivaLaunchpad.fromStorage();
    val res = contract.deploy(deployer.address, { value: ton("1") });
    expect(res).toHaveFailedTx({
        from: deployer.address,
        to: contract.address,
        exitCode: 700,
        deploy: true,
    });
}

/// Initializes the test environment, creating a fresh instance of the contract.
/// Returns the contract wrapper and two treasury accounts (`deployer` and `notDeployer`).
fun setupTest(): (PrivaLaunchpad, Treasury, Treasury) {
    // Create a treasury account for deployment (typically the owner)
    val deployer = testing.treasury("deployer");
    // Create another treasury account for testing interactions from other users
    val notDeployer = testing.treasury("notDeployer");

    // Initialize and deploy the contract with default values
    val contract = PrivaLaunchpad.fromStorage();
    val res = contract.deploy(deployer.address, { value: ton("1") });
    expect(res).toHaveSuccessfulDeploy({ to: contract.address });

    return (contract, deployer, notDeployer);
}
