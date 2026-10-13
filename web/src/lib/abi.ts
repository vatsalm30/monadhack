/**
 * Hand-written ABI for `Pairwise.sol`, transcribed from the contract spec in CLAUDE.md so the web
 * app could be built before the contract was deployed.
 *
 * Branch A's `shared/abi/Pairwise.json` (copied out of `contracts/out`) is authoritative. The
 * `Duel` tuple below follows the struct field order declared in CLAUDE.md:
 * creator, createdAt, commitEnd, revealEnd, outcome, room, hashA, hashB, poolA, poolB,
 * votesA, votesB, uriA, uriB, title.
 */
export const pairwiseAbi = [
  // ---- writes ----
  {
    type: "function",
    name: "createDuel",
    stateMutability: "nonpayable",
    inputs: [
      { name: "room", type: "bytes32" },
      { name: "title", type: "string" },
      { name: "uriA", type: "string" },
      { name: "uriB", type: "string" },
      { name: "hashA", type: "bytes32" },
      { name: "hashB", type: "bytes32" },
      { name: "commitDuration", type: "uint64" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "predict",
    stateMutability: "payable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "side", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "commitVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revealVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
  },
  { type: "function", name: "settle", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimVoterReward", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimCreator", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },

  // ---- views ----
  {
    type: "function",
    name: "getDuel",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "duel",
        type: "tuple",
        components: [
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "commitEnd", type: "uint64" },
          { name: "revealEnd", type: "uint64" },
          { name: "outcome", type: "uint8" },
          { name: "room", type: "bytes32" },
          { name: "hashA", type: "bytes32" },
          { name: "hashB", type: "bytes32" },
          { name: "poolA", type: "uint128" },
          { name: "poolB", type: "uint128" },
          { name: "votesA", type: "uint32" },
          { name: "votesB", type: "uint32" },
          { name: "uriA", type: "string" },
          { name: "uriB", type: "string" },
          { name: "title", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "side", type: "uint8" },
      { name: "stake", type: "uint128" },
      { name: "firstAt", type: "uint64" },
      { name: "claimed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "ballots",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "commitment", type: "bytes32" },
      { name: "revealed", type: "uint8" },
      { name: "rewardClaimed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "commitmentFor",
    stateMutability: "pure",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "side", type: "uint8" },
      { name: "salt", type: "bytes32" },
      { name: "voter", type: "address" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  { type: "function", name: "tasteRep", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "duelCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "revealWindow", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "minReveals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint32" }] },

  // ---- events ----
  {
    type: "event",
    name: "DuelCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "room", type: "bytes32", indexed: true },
      { name: "title", type: "string", indexed: false },
      { name: "uriA", type: "string", indexed: false },
      { name: "uriB", type: "string", indexed: false },
      { name: "hashA", type: "bytes32", indexed: false },
      { name: "hashB", type: "bytes32", indexed: false },
      { name: "commitEnd", type: "uint64", indexed: false },
      { name: "revealEnd", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Predicted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "side", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "poolA", type: "uint128", indexed: false },
      { name: "poolB", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoteCommitted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "VoteRevealed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
      { name: "side", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DuelSettled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "outcome", type: "uint8", indexed: false },
      { name: "votesA", type: "uint32", indexed: false },
      { name: "votesB", type: "uint32", indexed: false },
      { name: "poolA", type: "uint128", indexed: false },
      { name: "poolB", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "repGained", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VoterRewardClaimed",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "voter", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreatorPaid",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },

  // ---- custom errors ----
  { type: "error", name: "BadPhase", inputs: [] },
  { type: "error", name: "BadInput", inputs: [] },
  { type: "error", name: "Conflict", inputs: [] },
  { type: "error", name: "AlreadyDone", inputs: [] },
  { type: "error", name: "NothingOwed", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const;

/** Onchain `Side` enum. */
export const SIDE = { None: 0, A: 1, B: 2 } as const;
/** Onchain `Outcome` enum. */
export const OUTCOME = { Open: 0, A: 1, B: 2, Refund: 3 } as const;
