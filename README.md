# tx-watch-web

Web dashboard for Stellar TxWatch - register contracts and manage real-time alert rules.

Part of the [Tx-wats](https://github.com/Tx-wats) GitHub org.

[![CI](https://github.com/Tx-wats/web/actions/workflows/ci.yml/badge.svg)](https://github.com/Tx-wats/web/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-green)](package.json)

## What it does

- **Register** Soroban contracts on Mainnet, Testnet, or Futurenet
- **Configure** alert rules: large transfers, function calls, admin actions, failed transactions
- **Receive** instant webhook payloads when rules fire
- **Monitor** delivery history and alert logs per contract

## Tech stack

|            |                                      |
| ---------- | ------------------------------------ |
| Framework  | Next.js 14 (App Router)              |
| Language   | TypeScript                           |
| Styling    | Tailwind CSS                         |
| Wallet     | Freighter (Stellar identity)         |
| Blockchain | `@stellar/stellar-sdk` + Horizon API |

## Getting started

```bash
git clone https://github.com/Tx-wats/web
cd web
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Browser & wallet requirements

- **Browsers**: Chrome, Firefox, Edge, Safari (latest versions)
- **Wallet**: [Freighter extension](https://www.freighter.app/) required for contract registration and transaction signing
  - Install from [freighter.app](https://www.freighter.app/)
  - Supported on Chrome, Firefox, and Edge
  - Must be connected to the same network (Mainnet, Testnet, or Futurenet) as the contract you're registering

## Project structure

```
app/
  page.tsx                  # Landing page
  dashboard/page.tsx        # Stats + contract grid
  contracts/
    page.tsx                # Contract list
    new/page.tsx            # Add contract form
    [id]/page.tsx           # Contract detail + alert history
components/
  ContractCard.tsx          # Contract summary card
  RuleBuilder.tsx           # Alert rule configuration UI
  WebhookLog.tsx            # Webhook delivery history table
  NetworkBadge.tsx          # Mainnet/Testnet/Futurenet badge
  AlertRuleBadge.tsx        # Rule type display badge
  FreighterConnect.tsx      # Wallet connection button
  CopyButton.tsx            # Clipboard copy utility
  MobileNav.tsx             # Mobile navigation drawer
  EmptyState.tsx            # Empty list placeholder
lib/
  stellar.ts                # Horizon + Soroban RPC helpers
  storage.ts                # localStorage contract registry
  api.ts                    # Fetch wrapper + test webhook
  useContracts.ts           # React hook for contract state
types/
  index.ts                  # Shared types (mirrors core Rust structs)
```

## Architecture overview

### Page flow

The dashboard follows a standard Next.js App Router structure:

1. **Landing page** (`app/page.tsx`) — unauthenticated entry point with feature overview
2. **Dashboard** (`app/dashboard/page.tsx`) — authenticated view showing contract stats and grid
3. **Contract list** (`app/contracts/page.tsx`) — all registered contracts
4. **Add contract** (`app/contracts/new/page.tsx`) — registration form with Freighter signing
5. **Contract detail** (`app/contracts/[id]/page.tsx`) — alert rules, webhook logs, and history

### Storage layer

- **localStorage** (`lib/storage.ts`) — persists registered contracts, alert history, and user preferences
- **Freighter wallet** — stores user identity and network selection
- **Backend API** (`lib/api.ts`) — optional txwatch-core integration for webhook delivery logs

### Stellar integration boundaries

The app integrates with Stellar at three points:

1. **Horizon REST API** — fetch account balances, transaction history, and network status
2. **Soroban RPC** — contract simulation, ledger entry reads, and address validation
3. **Freighter wallet** — user authentication, transaction signing, and network switching

See [Stellar integration](#stellar-integration) for implementation details.

## Environment variables

| Variable                                | Description                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`                   | Base URL of the txwatch-core API. When empty, the app uses local-only mode.    |
| `NEXT_PUBLIC_SOROBAN_RPC_URL`           | Optional Soroban RPC URL used for every network unless overridden per network. |
| `NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET`   | Optional Mainnet Soroban RPC URL.                                              |
| `NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET`   | Optional Testnet Soroban RPC URL.                                              |
| `NEXT_PUBLIC_SOROBAN_RPC_URL_FUTURENET` | Optional Futurenet Soroban RPC URL.                                            |
| `NEXT_PUBLIC_HORIZON_URL`               | Optional Horizon URL used for every network unless overridden per network.     |
| `NEXT_PUBLIC_HORIZON_URL_MAINNET`       | Optional Mainnet Horizon URL.                                                  |
| `NEXT_PUBLIC_HORIZON_URL_TESTNET`       | Optional Testnet Horizon URL.                                                  |
| `NEXT_PUBLIC_HORIZON_URL_FUTURENET`     | Optional Futurenet Horizon URL.                                                |

## Stellar integration

This section documents how the dashboard integrates with the Stellar network and where to extend each layer.

### Network endpoints

`lib/stellar.ts` exports the Horizon REST and Soroban RPC base URLs for all three networks:

```ts
import { HORIZON_URLS, SOROBAN_RPC_URLS } from '@/lib/stellar'

// Horizon REST - account balances, transaction history
HORIZON_URLS.mainnet // https://horizon.stellar.org
HORIZON_URLS.testnet // https://horizon-testnet.stellar.org
HORIZON_URLS.futurenet // https://horizon-futurenet.stellar.org

// Soroban JSON-RPC - contract simulation, ledger entries
SOROBAN_RPC_URLS.mainnet // https://soroban-rpc.mainnet.stellar.gateway.fm
SOROBAN_RPC_URLS.testnet // https://soroban-testnet.stellar.org
SOROBAN_RPC_URLS.futurenet // https://rpc-futurenet.stellar.org
```

Use `horizonUrl(network)` and `sorobanRpcUrl(network)` rather than the constants: they apply the overrides below.

#### Choosing a Soroban RPC provider

SDF runs public RPC for testnet and futurenet only. For mainnet the dashboard defaults to [Gateway.fm](https://gateway.fm)'s keyless public endpoint, so contract lookups work out of the box. Public endpoints are rate-limited and best-effort, so for production set your own:

| Provider | Mainnet endpoint | Key needed |
| --- | --- | --- |
| Gateway.fm (default) | `https://soroban-rpc.mainnet.stellar.gateway.fm` | No |
| Lightsail | `https://rpc.lightsail.network` | No |
| Ankr | `https://rpc.ankr.com/stellar_soroban` | No (public tier); yes for higher limits |
| Validation Cloud | `https://mainnet.stellar.validationcloud.io/v1/<API_KEY>/soroban/rpc` | Yes |
| QuickNode, Blockdaemon, … | provider-specific | Yes |

Configure endpoints in `.env.local`. Per-network variables win over the global one, and the Content-Security-Policy `connect-src` allow-list picks up whatever you set:

```bash
NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET=https://mainnet.stellar.validationcloud.io/v1/<API_KEY>/soroban/rpc
NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET=   # default: https://soroban-testnet.stellar.org
NEXT_PUBLIC_SOROBAN_RPC_URL=           # fallback for every network
```

The endpoint must allow cross-origin requests (CORS), because contract verification runs in the browser. Keys in `NEXT_PUBLIC_*` variables are visible to users, so use a key restricted to your domain or proxy the RPC.

### Querying Horizon

Use the `@stellar/stellar-sdk` `Horizon.Server` to fetch on-chain data. Add new queries to `lib/stellar.ts`:

```ts
import { Horizon } from '@stellar/stellar-sdk'
import { HORIZON_URLS } from '@/lib/stellar'
import { Network } from '@/types'

export function getHorizonServer(network: Network) {
  return new Horizon.Server(HORIZON_URLS[network])
}

// Fetch recent transactions for a contract account
export async function fetchContractTransactions(
  network: Network,
  contractId: string
) {
  const server = getHorizonServer(network)
  const { records } = await server
    .transactions()
    .forAccount(contractId)
    .order('desc')
    .limit(20)
    .call()
  return records
}
```

### Querying Soroban RPC

Use `SorobanRpc.Server` to read contract storage or simulate invocations:

```ts
import { SorobanRpc, Contract, xdr } from '@stellar/stellar-sdk'
import { SOROBAN_RPC_URLS } from '@/lib/stellar'
import { Network } from '@/types'

export function getSorobanServer(network: Network) {
  return new SorobanRpc.Server(SOROBAN_RPC_URLS[network])
}

// Read a contract ledger entry by key
export async function getContractData(
  network: Network,
  contractId: string,
  key: xdr.ScVal
) {
  const server = getSorobanServer(network)
  const contract = new Contract(contractId)
  return server.getContractData(contract, key, SorobanRpc.Durability.Persistent)
}
```

### Freighter wallet

`components/FreighterConnect.tsx` wraps the [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api) package, which talks to the browser extension for us. `lib/freighter.ts` is the only module that imports the package, and it is what the rest of the app uses to read the connected public key and network:

```ts
import { readFreighterConnection, getWalletNetwork } from '@/lib/freighter'

// Read the key after connection (passed by FreighterConnect via onConnect callback)
const connection = await readFreighterConnection()
const publicKey = connection?.publicKey ?? null
const network = await getWalletNetwork() // e.g. "TESTNET"
```

Wallet state is shared through a `txwatch:wallet` CustomEvent rather than per-component state, so connecting or disconnecting from one button updates every other wallet-aware component. Prefer the hook over reading the global directly:

```ts
import { useWalletState } from '@/hooks/useWalletState'

const { publicKey, initialized, publish } = useWalletState()
```

`publish(key)` connects and `publish(null)` disconnects; both update `localStorage` and `window.__freighterPublicKey` and notify every other subscriber.

To sign and submit a transaction:

```ts
import { Transaction, Networks } from '@stellar/stellar-sdk'
import { signWithFreighter } from '@/lib/freighter'

// Build your XDR transaction, then:
const signed = await signWithFreighter(txXdr, {
  networkPassphrase: Networks.TESTNET,
})
```

### Contract ID validation

All contract IDs are validated against the Soroban address format before saving:

```ts
import { isValidContractId } from '@/lib/stellar'

isValidContractId('CAAAA...') // true — starts with C, 56 base-32 chars
isValidContractId('GAAAA...') // false — that's a Stellar account address
```

### Stellar Expert links

Alert history rows link directly to Stellar Expert for transaction inspection:

```ts
import { explorerTxUrl, explorerContractUrl } from '@/lib/stellar'

explorerTxUrl('testnet', txHash) // https://stellar.expert/explorer/testnet/tx/<hash>
explorerContractUrl('mainnet', contractId) // https://stellar.expert/explorer/public/contract/<id>
```

### Extending alert rules

Alert rules are defined in `types/index.ts` and must stay in sync with the Rust structs in [`stellar-txwatch-core`](https://github.com/Tx-wats/stellar-txwatch-core). To add a new rule type:

1. Add the variant to `AlertRuleType` in `types/index.ts`
2. Add a label and colour to `AlertRuleBadge.tsx`
3. Add conditional input fields in `RuleBuilder.tsx`
4. Add the matching variant to the Rust `AlertRule` enum in the core engine

### Webhook payload shape

When a rule fires, the core engine POSTs this JSON to the registered webhook URL:

```json
{
  "label": "My DEX Contract",
  "contract_id": "CAAAA...",
  "network": "testnet",
  "rule_triggered": "LargeTransfer",
  "transaction_hash": "abc123...",
  "function_name": "transfer",
  "amount": 50000,
  "timestamp": 1718000000000,
  "horizon_link": "https://horizon-testnet.stellar.org/transactions/abc123"
}
```

The `Test` button on the Add Contract form sends a mock payload to your endpoint so you can verify delivery before going live.

### Verifying webhook signatures

Requests carry an `X-TxWatch-Signature` header of the form `t=<unix seconds>,v1=<hex>`, where `v1` is the HMAC-SHA256 of `<t>.<raw request body>`, keyed with your signing secret (generate one on the Add Contract form; it is shown once). Because the timestamp is signed, a captured delivery can't be replayed later: reject any signature older than your tolerance window (5 minutes is a good default). Verify against the raw body, not re-serialised JSON. During secret rotation the header may carry more than one `v1` entry; accept the request if any of them matches.

```js
import crypto from 'node:crypto'

const TOLERANCE_SECONDS = 300

function verify(rawBody, header, secret, now = Math.floor(Date.now() / 1000)) {
  const parts = (header ?? '').split(',').map((p) => p.trim().split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!Number.isInteger(t) || sigs.length === 0) return false
  if (Math.abs(now - t) > TOLERANCE_SECONDS) return false // stale: possible replay

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest()
  return sigs.some((sig) => {
    const b = Buffer.from(sig, 'hex')
    return b.length === expected.length && crypto.timingSafeEqual(b, expected)
  })
}
```

```python
import hmac, hashlib, time

TOLERANCE_SECONDS = 300

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = [p.strip().split("=", 1) for p in (header or "").split(",") if "=" in p]
    t = next((v for k, v in parts if k == "t"), None)
    sigs = [v for k, v in parts if k == "v1"]
    if t is None or not t.isdigit() or not sigs:
        return False
    if abs(time.time() - int(t)) > TOLERANCE_SECONDS:
        return False  # stale: possible replay
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)
```

The dashboard's own helper, `verifyWebhookSignature` in [`lib/webhookSignature.ts`](lib/webhookSignature.ts), implements the same check.

## CI

Every push and pull request to `main` runs these GitHub Actions checks:

- Lint (`npm run lint`)
- Formatting (`npm run format:check`)
- Type-check (`npm run typecheck`)
- Dependency audit (`npm audit --audit-level=high`; currently non-blocking)
- Tests (`npm test`)
- Production build (`npm run build`)

See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Roadmap

### Near-term

- [ ] Multi-signature contract support

### Medium-term

- [ ] Real-time WebSocket updates for alert delivery
- [ ] Custom alert rule templates
- [ ] Batch contract registration

### Future

- [ ] Mobile app (React Native)
- [ ] Alert aggregation across multiple contracts
- [ ] Integration with external notification services (Slack, Discord, email)

## Sister repos

- [stellar-txwatch-core](https://github.com/Tx-wats/stellar-txwatch-core) - Rust monitoring engine
- [stellar-txwatch-contracts](https://github.com/Tx-wats/stellar-txwatch-contracts) - Soroban smart contracts

## Data Persistence

The app stores a local cache of contracts, alert history, and preferences in **browser localStorage**. When `NEXT_PUBLIC_API_URL` is configured, contract records also sync with the core API; the browser cache remains in use. This means:

- The local cache and preferences are specific to each browser/device
- Contract records sync through the core API when it is configured
- Clearing browser storage removes the local cache and preferences
- Use export/import backups to move local alert history and settings between browsers

### Backup and restore

Settings → **Export contracts** / **Import contracts** can move your data between browsers. Both export and import let you choose what to include:

- **Contracts only** — just the registered contracts and their alert rules
- **Everything** — contracts plus alert history, retention days, notification preference, and view preferences

Exports are versioned JSON. The full-backup format is:

```json
{
  "version": 2,
  "contracts": [],
  "alerts": [],
  "settings": {}
}
```

The older contracts-only format (no `version` field, or `version: 1`) is still accepted on import, so backups made before the full-backup format existed can be restored. Importing a v2 backup restores alerts and settings as well as contracts.

## API Limitations

The dashboard currently operates in two modes:

### Mock/Local Mode (Default)

- Contract registration and alert rule configuration are stored locally
- Webhook testing uses mock payloads
- No real-time monitoring occurs without a backend

### API Mode (When `NEXT_PUBLIC_API_URL` is set)

- Contracts and rules sync with the txwatch-core backend
- Real webhook delivery and monitoring depend on the backend service
- Requires the [stellar-txwatch-core](https://github.com/Tx-wats/stellar-txwatch-core) API running

**Note:** The dashboard itself does not monitor transactions. Monitoring is performed by the core engine. The dashboard is a configuration and monitoring UI only.

## Screenshots

### Landing Page

The landing page introduces the dashboard and provides quick access to wallet connection and contract registration.

### Dashboard

The dashboard displays registered contracts in a grid layout with summary cards showing contract ID, network, and alert rule count.

### Contract Detail

The contract detail page shows:

- Contract metadata (ID, network, registration date)
- Configured alert rules with type badges
- Webhook delivery history with transaction links to Stellar Expert

### Add Contract Form

The form allows users to:

- Enter a contract ID (validated against Soroban address format)
- Select the network (Mainnet, Testnet, Futurenet)
- Configure alert rules (large transfers, function calls, admin actions, failed transactions)
- Test webhook delivery before going live

### Settings

The settings page lets users:

- Export contracts only, or everything (contracts, alert history, and settings) as versioned JSON
- Import a contracts-only (v1) or full (v2) backup, choosing whether to restore contracts only or everything
- Configure alert retention days, notification preference, and view preferences

## Bug Reports & Feature Requests

When reporting issues or requesting features, please include:

### For Bug Reports

- Steps to reproduce the issue
- Expected vs. actual behavior
- Browser and OS information
- Screenshots or error messages if applicable
- Whether the issue occurs in mock mode or with a backend API

### For Feature Requests

- Clear description of the desired functionality
- Use case or problem it solves
- Suggested implementation approach (if any)
- Whether it's a UI/UX enhancement or backend integration

Please check existing issues before opening a new one to avoid duplicates.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](./LICENSE) for the full text.

## Security

Please report vulnerabilities using the private process in [SECURITY.md](./SECURITY.md).
