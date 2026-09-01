import { createPublicClient, getAddress, http, type Address, type Chain as ViemChain } from "viem";
import { mainnet, arbitrum, bsc } from "viem/chains";
import type { ChainKey } from "./chains.js";

export interface ChainalysisResult {
  mode: "live" | "stub";
  sanctionsHit: boolean;
  raw: unknown;
}

// Chainalysis's free, self-serve sanctions oracle: a public, verified smart
// contract deployed at the SAME address on Ethereum, Arbitrum, and BNB Smart
// Chain, each with an isSanctioned(address) view function. No API key or
// customer relationship required — anyone can call it. Verified directly
// against each chain before relying on it: identical bytecode length and
// matching isSanctioned() results across all three for the same test address
// (see spec.md). (The REST Address Screening API now requires a sales/
// contract relationship, so this on-chain oracle is the free tier this POC
// actually uses — see spec.md Areas of concern for known limitations.)
const ORACLE_ADDRESS: Address = "0x40C57923924B5c5c5455c48D93317139ADDaC8fb";
const ORACLE_ABI = [
  {
    inputs: [{ internalType: "address", name: "addr", type: "address" }],
    name: "isSanctioned",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const REQUEST_TIMEOUT_MS = 10_000;

interface ChainConfig {
  viemChain: ViemChain;
  // Primary RPC env var for this chain. `legacyEnvVar` is checked as a
  // fallback so an existing RPC_URL (Ethereum-only, from before multi-chain
  // support) keeps working without changes.
  envVar: string;
  legacyEnvVar?: string;
  // Hardcoded, verified-reachable free public RPCs used for the multi-provider
  // cross-check (see Technical approach in spec.md for why this exists).
  crossCheckRpcUrls: string[];
}

const CHAIN_CONFIG: Record<ChainKey, ChainConfig> = {
  ethereum: {
    viemChain: mainnet,
    envVar: "RPC_URL_ETHEREUM",
    legacyEnvVar: "RPC_URL",
    crossCheckRpcUrls: ["https://eth.drpc.org", "https://eth.merkle.io"],
  },
  arbitrum: {
    viemChain: arbitrum,
    envVar: "RPC_URL_ARBITRUM",
    crossCheckRpcUrls: ["https://arbitrum.drpc.org", "https://1rpc.io/arb"],
  },
  bsc: {
    viemChain: bsc,
    envVar: "RPC_URL_BSC",
    crossCheckRpcUrls: ["https://1rpc.io/bnb", "https://bsc-rpc.publicnode.com"],
  },
};

interface ProviderResult {
  origin: string;
  role: "primary" | "cross-check";
  ok: boolean;
  isSanctioned?: boolean;
  blockNumber?: string;
  error?: string;
}

// Only the origin is ever stored/displayed, never the full URL — a
// user-configured RPC env var (e.g. an Alchemy/Infura link) commonly embeds
// an API key in its path, which must never end up in the audit trail or UI.
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "invalid-url";
  }
}

function resolvePrimaryRpcUrl(chain: ChainKey): string | undefined {
  const config = CHAIN_CONFIG[chain];
  return process.env[config.envVar] || (config.legacyEnvVar ? process.env[config.legacyEnvVar] : undefined);
}

async function queryProvider(
  rpcUrl: string,
  role: ProviderResult["role"],
  viemChain: ViemChain,
  address: Address,
): Promise<ProviderResult> {
  const origin = originOf(rpcUrl);
  try {
    const client = createPublicClient({
      chain: viemChain,
      transport: http(rpcUrl, { timeout: REQUEST_TIMEOUT_MS }),
    });
    const [sanctioned, blockNumber] = await Promise.all([
      client.readContract({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "isSanctioned",
        args: [address],
      }),
      client.getBlockNumber(),
    ]);
    return { origin, role, ok: true, isSanctioned: sanctioned, blockNumber: blockNumber.toString() };
  } catch (err) {
    return { origin, role, ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}

async function callOracleWithCrossCheck(
  address: string,
  chain: ChainKey,
  primaryRpcUrl: string,
): Promise<ChainalysisResult> {
  const config = CHAIN_CONFIG[chain];
  const checksummed = getAddress(address);
  const primaryOrigin = originOf(primaryRpcUrl);

  const targets: { url: string; role: ProviderResult["role"] }[] = [{ url: primaryRpcUrl, role: "primary" }];
  for (const url of config.crossCheckRpcUrls) {
    if (originOf(url) !== primaryOrigin) targets.push({ url, role: "cross-check" });
  }

  const results = await Promise.all(targets.map((t) => queryProvider(t.url, t.role, config.viemChain, checksummed)));
  const successes = results.filter((r) => r.ok);

  if (successes.length === 0) {
    throw new Error(`All ${results.length} RPC providers failed for ${chain}`);
  }

  const trueCount = successes.filter((r) => r.isSanctioned === true).length;
  const falseCount = successes.length - trueCount;

  let consensus: "agreement" | "disagreement" | "insufficient";
  let sanctionsHit: boolean;
  if (successes.length < 2) {
    consensus = "insufficient"; // only one provider responded — nothing to cross-check against
    sanctionsHit = successes[0].isSanctioned === true;
  } else if (trueCount === 0 || falseCount === 0) {
    consensus = "agreement";
    sanctionsHit = trueCount > 0;
  } else {
    consensus = "disagreement";
    // Fail-safe: providers disagreeing is itself an anomaly worth a human
    // look, so route it to compliance review rather than silently clearing.
    sanctionsHit = true;
  }

  return {
    mode: "live",
    sanctionsHit,
    raw: {
      chain,
      oracleContract: ORACLE_ADDRESS,
      queriedAddress: checksummed,
      isSanctioned: sanctionsHit,
      consensus,
      providersQueried: results.length,
      providersSucceeded: successes.length,
      providers: results,
    },
  };
}

// forceSanctionsHit is a demo/testing override, same as forceTier — it always
// takes effect, live RPC configured or not, so a demo run can reliably show
// the sanctions-override path. It's tagged `mode: "stub"` even when a real
// RPC is available, since no oracle call is made in this case: forcing a
// result and then labeling it "LIVE" would misrepresent it as a genuine
// on-chain answer.
export async function checkAddress(
  address: string,
  chain: ChainKey,
  forceSanctionsHit?: boolean,
): Promise<ChainalysisResult> {
  if (forceSanctionsHit) {
    return {
      mode: "stub",
      sanctionsHit: true,
      raw: {
        note: "Sanctions hit forced for testing — no oracle call was made.",
        chain,
        address,
        forcedSanctionsHit: true,
      },
    };
  }

  const rpcUrl = resolvePrimaryRpcUrl(chain);
  if (!rpcUrl) {
    return {
      mode: "stub",
      sanctionsHit: false,
      raw: {
        note: `No RPC URL configured for ${chain} — stub mode, no on-chain oracle call performed.`,
        chain,
        address,
        forcedSanctionsHit: false,
      },
    };
  }

  try {
    return await callOracleWithCrossCheck(address, chain, rpcUrl);
  } catch (err) {
    console.error(`Chainalysis oracle call failed on all providers for ${chain}, falling back to stub mode:`, err);
    return {
      mode: "stub",
      sanctionsHit: false,
      raw: {
        note: `On-chain oracle call failed on all RPC providers for ${chain} — fell back to stub mode.`,
        error: String(err instanceof Error ? err.message : err),
        chain,
        address,
        forcedSanctionsHit: false,
      },
    };
  }
}
