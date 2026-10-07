# Live ParaSpell test: AssetHubPaseo → PeoplePaseo

This kit creates a **new account you control**, checks a one PAS transfer, then lets you sign and submit it. Both chains are on the Paseo testnet. It runs in PowerShell on Windows 10 with Node.js 20.19 or newer. The existing Alice demo only built and simulated an unsigned transfer; **Alice never sent a transaction in that demo**.

## 1. Install and unpack

Install Node.js from <https://nodejs.org/en/download>. Check `node --version` and `npm.cmd --version` in a new PowerShell window. Extract this ZIP to a local folder, open PowerShell there, and run:

```powershell
npm.cmd ci
```

`npm ci` installs the exact dependencies in `package-lock.json`. Internet access is needed for installation and the live RPC queries.

## 2. Create your dedicated testnet account

```powershell
node new-wallet.mjs
```

Copy its address to a private note and keep the 12 word mnemonic privately. This command generates the account on **your computer**; no account is uploaded or funded automatically. Do not share the mnemonic, use a real funds wallet, or put the mnemonic in the thesis or screenshots.

Optional: import this mnemonic into a Substrate wallet using the standard Sr25519 account with no derivation path. The script itself can sign without a browser wallet.

## 3. Fund the source chain

Open <https://faucet.polkadot.io/> and request PAS to **your address on Paseo Asset Hub**. A few test PAS gives room for the one PAS transfer, source fees, and the account deposit. The exact current fee comes from the next step. Wait for faucet funding to appear; funding Paseo relay chain or People Chain alone will not fund this source account.

In the commands below, replace `YOUR_ADDRESS` with the complete address printed in step 2. Quoting is harmless:

```powershell
$address = 'YOUR_ADDRESS'
node transfer-paseo.mjs prepare $address
```

`prepare` reads balances on both chains, estimates source and destination costs, checks the destination account deposit, simulates the transfer, and builds an **unsigned** call. It records the responses in `paseo-transfer-result.json`. If a check fails, inspect that file, confirm Asset Hub funding, and retry after the network settles. **No transfer occurs in this step.**

## 4. Sign and send

In the same PowerShell window, enter the dedicated testnet mnemonic without making it part of the command history:

```powershell
$secret = Read-Host 'Dedicated testnet mnemonic' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:PASEO_TEST_MNEMONIC = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node transfer-paseo.mjs send $address
} finally {
  Remove-Item Env:\PASEO_TEST_MNEMONIC -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable secret, pointer -ErrorAction SilentlyContinue
}
```

The script derives the signer and checks that its account ID matches `$address`. It repeats the live preflight, asks you to type `SEND`, signs and broadcasts the extrinsic, waits for source finalization, and polls PeoplePaseo for a higher balance. It saves the transaction hash, finalization result, and observed balances to `paseo-transfer-result.json`. The mnemonic is never written to that file. The transaction spends **test PAS**, including network fees.

If `SOURCE_FINALIZED` appears without destination confirmation, or the script times out after submission, **do not rerun `send` immediately**: check the saved hash and balances first. XCM arrival can take longer than source finalization. A failure before `SUBMISSION_STARTED` means no submission was attempted; a network error after that point leaves the broadcast state uncertain.

## Evidence to show

- `prepare` output: Asset Hub balance, fee estimate, dry run, and deposit check.
- `send` output: source transaction hash and source finalization (`ok: true`).
- `paseo-transfer-result.json`: exact UTC timestamp, chain names, test PAS amount, before and after balances, and destination balance increase.

The one PAS amount is fixed as `10_000_000_000` base units (10 decimals). The recipient is your **own** address on PeoplePaseo. A destination balance increase after source finalization is the script's practical arrival check; it is strongest with a fresh account and no simultaneous transfers. Do not report a successful transfer until the signed run and destination evidence exist.

Versions: `@paraspell/sdk@14.4.0`, `@paraspell/descriptors@14.4.0`, `polkadot-api@3.2.1`, `@polkadot-labs/hdkd@0.0.32`, `@polkadot-labs/hdkd-helpers@0.0.34`. The public Polkadot tutorial uses an older `tx.signAndSubmit(signer)` API. This kit uses PAPI 3's `tx.createAndSubmit(getTxCreator(...))` from the installed package.
