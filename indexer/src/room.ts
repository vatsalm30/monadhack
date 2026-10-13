/** bytes32 room → slug. The web encodes it with viem `stringToHex(slug, { size: 32 })` (right-padded). */
export function decodeRoom(hex: string): string {
  return Buffer.from(hex.replace(/^0x/, ""), "hex").toString("utf8").replace(/\0+$/, "");
}
