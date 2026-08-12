# Test Strategy and Coverage Gates

**Current coverage:** Reference-model, emulator, transport, and selected
contract tests. Passing tests do not by themselves prove TVM execution,
TEP-74 interoperability, Groth16 production assurance, or DeDust behavior.

## Required layers

| Layer | Required evidence | Current status |
| --- | --- | --- |
| Settlement oracle | Integer quote, supply, excess, identity-cap boundaries | Present in `tests/settlement.test.cjs` |
| Tolk unit tests | Storage serialization, every opcode, role checks, malformed cells | Pending |
| Contract integration | Factory/launchpad/jetton/verifier/adapter message traces | Pending |
| ZK tests | Forgery, issuer, domain, launch, recipient, expiry, and replay rejection | Pending |
| Property/fuzz tests | Value/supply conservation and state-transition invariants | Pending |
| Testnet | Full lifecycle and bounce traces against pinned deployments | Pending |
| Independent audit | Findings, fixes, and rerun evidence | Release gate |

## Mandatory properties

1. `acceptedValue + excessValue == inboundValue` after documented gas reserve.
2. Issued supply never exceeds the immutable supply.
3. A buy quote is monotonic and cannot exceed the curve deposit or remaining supply.
4. The same identity cannot exceed its cumulative cap through new action nonces
   or wallet addresses.
5. A consumed action nullifier cannot alter state twice.
6. A failed mint/adapter action cannot leave the launchpad finalized or funds
   unaccounted for.
7. Only the configured launchpad can mint sale inventory; only the configured
   adapter can receive migration reserves.

## CI policy

`npm test` and `npm run build` are required for every change. Once Tolk message
handlers exist, `acton build` and native tests must be required in CI; a test
run containing zero contract tests is a release failure. Before mainnet, add
property/fuzz suites, reproducible testnet traces, and an independent audit.

## Regression rule

Every security finding receives a minimal regression test that demonstrates the
old failure and the fixed behavior. A test-only mock may never stand in for a
proof verifier, jetton transfer, wallet signature, or DeDust callback in a
mainnet release decision.
