import "../wrappers/PrivaLaunchpad.gen.tolk"

@test
fun testDeployAndGetDetails() {
    val launchpad = PrivaLaunchpad.fromStorage();
    val sender = net.createAccount();

    launchpad.deploy(sender, { value: 1000000000 });

    val (nullifierHash, raised, isGraduated) = launchpad.getLaunchpadDetails();
    assert(raised == 0) throw 101;
    assert(!isGraduated) throw 102;
}
