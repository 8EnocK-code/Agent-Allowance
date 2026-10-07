export const BOT_CHAIN = {
  chainId: 677,
  hex: "0x2a5",
  params: {
    chainId: "0x2a5",
    chainName: "BOT Chain",
    rpcUrls: ["https://rpc.botchain.ai"],
    blockExplorerUrls: ["https://scan.botchain.ai"],
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  },
};

export async function ensureBotChain(eth) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BOT_CHAIN.hex }] });
  } catch (e) {
    if (e.code === 4902 || e?.error?.code === 4902) {
      await eth.request({ method: "wallet_addEthereumChain", params: [BOT_CHAIN.params] });
    } else throw e;
  }
}

// Turn contract custom errors into something a human can act on.
const ERR = {
  ZeroAmount: "Amount must be greater than zero.",
  InsufficientBalance: "Not enough vault balance.",
  InvalidPolicy: "Invalid policy: limits must be > 0, per-tx ≤ daily, expiry in the future.",
  ZeroAddress: "An address field is empty or zero.",
  NativeNotSupported: "Native BOT isn't supported for this action.",
};
export function niceError(e) {
  const name = e?.revert?.name || e?.errorName;
  if (name && ERR[name]) return ERR[name];
  if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "Rejected in wallet.";
  return e?.shortMessage || e?.reason || e?.message || String(e);
}
