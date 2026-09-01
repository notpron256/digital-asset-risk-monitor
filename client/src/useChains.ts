import { useEffect, useState } from "react";
import { fetchChains, type ChainOption } from "./api";

export function useChains(): ChainOption[] {
  const [chains, setChains] = useState<ChainOption[]>([]);
  useEffect(() => {
    fetchChains()
      .then(setChains)
      .catch(() => {});
  }, []);
  return chains;
}
