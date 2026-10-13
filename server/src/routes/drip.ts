/**
 * POST /api/drip — gas for a brand-new passkey account.
 *
 * A passkey mints an address with zero MON, so the user's first prediction would fail on gas. This
 * is what lets the app say "you are ready to predict" instead of sending someone to a faucet.
 */
import { Router } from "express";
import { formatEther, isAddress } from "viem";
import { balanceOf, DRIP_WEI, faucetAccount, sendDrip } from "../chain.js";
import { HAS_FAUCET } from "../env.js";
import { log } from "../log.js";
import { recordDrip, wasDrippedToday } from "../store.js";

/** Already funded enough to transact: nothing to do. */
const ENOUGH_WEI = 100_000_000_000_000_000n; // 0.1 MON

export const dripRouter: Router = Router();

dripRouter.post("/api/drip", async (req, res) => {
  const body = req.body as { address?: unknown } | undefined;
  const address = typeof body?.address === "string" ? body.address : "";
  if (!isAddress(address)) {
    res.status(422).json({ error: "Send a valid address." });
    return;
  }
  if (!HAS_FAUCET || !faucetAccount) {
    res.status(503).json({ error: "This server has no faucet configured. Top up at faucet.monad.xyz." });
    return;
  }

  const target = address.toLowerCase() as `0x${string}`;

  const balance = await balanceOf(target);
  if (balance >= ENOUGH_WEI) {
    res.json({ skipped: "Balance is already above 0.1 MON." });
    return;
  }

  const ip = req.ip ?? "unknown";
  if (await wasDrippedToday([`addr:${target}`, `ip:${ip}`])) {
    res.status(429).json({ error: "Already dripped today. Try again tomorrow." });
    return;
  }

  const funds = await balanceOf(faucetAccount.address);
  if (funds < DRIP_WEI * 2n) {
    log.error(`Faucet is nearly empty: ${formatEther(funds)} MON left.`);
    res.status(503).json({ error: "Faucet is empty. Ask the team to top it up." });
    return;
  }

  try {
    const hash = await sendDrip(target);
    await recordDrip([`addr:${target}`, `ip:${ip}`]);
    log.info(`Dripped ${formatEther(DRIP_WEI)} MON to ${target}.`, hash);
    res.json({ hash });
  } catch (error) {
    log.error("Drip failed.", error instanceof Error ? error.message : error);
    res.status(503).json({ error: "Could not send gas right now. Try again in a minute." });
  }
});
