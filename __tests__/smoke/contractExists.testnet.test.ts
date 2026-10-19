// @vitest-environment node
/**
 * Live smoke test: asks the real testnet Soroban RPC whether contracts exist.
 * Skipped unless TESTNET_SMOKE=1, so the regular suite never touches the
 * network. Run locally with `TESTNET_SMOKE=1 npm run test:smoke`; the nightly
 * `testnet-smoke` workflow runs it too.
 */
import crypto from 'crypto'
import { Asset, Networks, StrKey } from '@stellar/stellar-sdk'
import { contractExists } from '@/lib/contractExists'

// The native XLM asset contract. Its ID is derived from the network
// passphrase, so it survives testnet resets.
const NATIVE_SAC_TESTNET = Asset.native().contractId(Networks.TESTNET)

describe.skipIf(process.env.TESTNET_SMOKE !== '1')(
  'contractExists against testnet',
  () => {
    it('reports found for the native asset contract', async () => {
      const result = await contractExists('testnet', NATIVE_SAC_TESTNET, {
        timeoutMs: 20_000,
      })
      expect(result).toEqual({ status: 'found' })
    }, 30_000)

    it('reports not_found for a random, never-deployed contract ID', async () => {
      const randomId = StrKey.encodeContract(crypto.randomBytes(32))
      const result = await contractExists('testnet', randomId, {
        timeoutMs: 20_000,
      })
      expect(result).toEqual({ status: 'not_found' })
    }, 30_000)
  }
)
