export type ChainKey = "ethereum" | "arbitrum" | "bsc";

export const CHAIN_KEYS: ChainKey[] = ["ethereum", "arbitrum", "bsc"];

export const CHAIN_LABELS: Record<ChainKey, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  bsc: "BNB Smart Chain",
};

export function isChainKey(value: unknown): value is ChainKey {
  return typeof value === "string" && (CHAIN_KEYS as string[]).includes(value);
}
