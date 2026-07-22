import { Types } from "mongoose";
import { buildTotalText } from "@/lib/time";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import {
  CustomerDeposit,
  type ICustomerDeposit,
  type IWithdrawalAllocation,
} from "@/models/CustomerDeposit";

const activeDepositStatus = depositStatuses[0];
const returnedDepositStatus = depositStatuses[1];
const exchangedDepositStatus = depositStatuses[2];
const canceledDepositStatus = depositStatuses[3];
const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];

type RestoredAmounts = {
  cards: number;
  balls: number;
};

function addAllocation(
  allocations: Map<string, IWithdrawalAllocation>,
  sourceId: Types.ObjectId,
  cards: number,
  balls: number,
) {
  if (cards <= 0 && balls <= 0) {
    return;
  }

  const key = sourceId.toString();
  const existing = allocations.get(key);

  if (existing) {
    existing.cards += cards;
    existing.balls += balls;
    return;
  }

  allocations.set(key, { sourceId, cards, balls });
}

function requiredWithdrawalAmounts(deposit: ICustomerDeposit): RestoredAmounts {
  return {
    cards: deposit.cardAction === withdrawCardAction ? deposit.cards : 0,
    balls: deposit.ballAction === withdrawBallAction ? deposit.balls : 0,
  };
}

function storedAllocationsCoverWithdrawal(
  allocations: IWithdrawalAllocation[],
  required: RestoredAmounts,
) {
  const allocated = allocations.reduce<RestoredAmounts>(
    (totals, allocation) => ({
      cards: totals.cards + allocation.cards,
      balls: totals.balls + allocation.balls,
    }),
    { cards: 0, balls: 0 },
  );

  return allocated.cards === required.cards && allocated.balls === required.balls;
}

function parseAutomaticDeduction(content: string) {
  const cards = content.match(/^T\u1ef1 tr\u1eeb (\d+) th\u1ebb do t\u1ea1o b\u1ea3n ghi l\u1ea5y th\u1ebb\./u);
  const balls = content.match(/^T\u1ef1 tr\u1eeb (\d+) bi do t\u1ea1o b\u1ea3n ghi l\u1ea5y bi\./u);

  return {
    cards: cards ? Number(cards[1]) : 0,
    balls: balls ? Number(balls[1]) : 0,
  };
}

async function findLegacyAllocations(deleted: ICustomerDeposit, required: RestoredAmounts) {
  if (required.cards === 0 && required.balls === 0) {
    return [];
  }

  const records = await CustomerDeposit.find({
    phone: deleted.phone,
    _id: { $ne: deleted._id },
  });
  const hasLaterRecord = records.some((record) => record.createdAt > deleted.createdAt);

  if (hasLaterRecord) {
    throw new Error("Ch\u1ec9 c\u00f3 th\u1ec3 xo\u00e1 b\u1ea3n ghi l\u1ea5y c\u0169 khi b\u1ea3n ghi c\u00f3 ngu\u1ed3n ho\u00e0n r\u00f5 r\u00e0ng.");
  }

  const events: Array<{
    sourceId: Types.ObjectId;
    at: Date;
    cards: number;
    balls: number;
  }> = [];

  for (const record of records) {
    for (const entry of record.history) {
      if (entry.action !== "UPDATE" || entry.at < deleted.createdAt) {
        continue;
      }

      const deducted = parseAutomaticDeduction(entry.content);

      if (deducted.cards > 0 || deducted.balls > 0) {
        events.push({
          sourceId: record._id,
          at: entry.at,
          cards: deducted.cards,
          balls: deducted.balls,
        });
      }
    }
  }

  events.sort((left, right) => left.at.getTime() - right.at.getTime());

  let remainingCards = required.cards;
  let remainingBalls = required.balls;
  const allocations = new Map<string, IWithdrawalAllocation>();

  for (const event of events) {
    const cards = Math.min(event.cards, remainingCards);
    const balls = Math.min(event.balls, remainingBalls);

    addAllocation(allocations, event.sourceId, cards, balls);
    remainingCards -= cards;
    remainingBalls -= balls;

    if (remainingCards === 0 && remainingBalls === 0) {
      break;
    }
  }

  if (remainingCards > 0 || remainingBalls > 0) {
    throw new Error("Kh\u00f4ng x\u00e1c \u0111\u1ecbnh \u0111\u01b0\u1ee3c ngu\u1ed3n bi/th\u1ebb \u0111\u1ec3 ho\u00e0n khi xo\u00e1 b\u1ea3n ghi n\u00e0y.");
  }

  return [...allocations.values()];
}

async function resolveAllocations(deleted: ICustomerDeposit, required: RestoredAmounts) {
  const stored = deleted.withdrawalAllocations ?? [];

  if (storedAllocationsCoverWithdrawal(stored, required)) {
    return stored;
  }

  return findLegacyAllocations(deleted, required);
}

function getRemainingCards(deposit: ICustomerDeposit) {
  return deposit.remainingCards ?? deposit.cards;
}

function getRemainingBalls(deposit: ICustomerDeposit) {
  return deposit.remainingBalls ?? deposit.balls;
}

function getRestoredActorName(deleted: ICustomerDeposit) {
  return deleted.updatedByName || deleted.createdByName || "H\u1ec7 th\u1ed1ng";
}

function parseSnapshotTotal(deposit: ICustomerDeposit) {
  const match = deposit.totalText.match(/:\s*(-?\d+)\s*\|\s*[^:|]+:\s*(-?\d+)/u);

  if (!match) {
    return { cards: 0, balls: 0 };
  }

  return { cards: Number(match[1]), balls: Number(match[2]) };
}

async function restoreLaterSnapshotTotals(deleted: ICustomerDeposit, restored: RestoredAmounts) {
  if (restored.cards === 0 && restored.balls === 0) {
    return;
  }

  const laterRecords = await CustomerDeposit.find({
    phone: deleted.phone,
    _id: { $ne: deleted._id },
    createdAt: { $gt: deleted.createdAt },
  });

  await Promise.all(
    laterRecords.map(async (record) => {
      const total = parseSnapshotTotal(record);
      record.totalText = buildTotalText(total.cards + restored.cards, total.balls + restored.balls);
      await record.save({ timestamps: false });
    }),
  );
}

export async function restoreDeletedWithdrawal(deleted: ICustomerDeposit): Promise<RestoredAmounts> {
  const required = requiredWithdrawalAmounts(deleted);
  const allocations = await resolveAllocations(deleted, required);

  if (allocations.length === 0) {
    return { cards: 0, balls: 0 };
  }

  const sourceIds = allocations.map((allocation) => allocation.sourceId);
  const sources = await CustomerDeposit.find({ _id: { $in: sourceIds } });
  const sourcesById = new Map(sources.map((source) => [source._id.toString(), source]));

  for (const allocation of allocations) {
    const source = sourcesById.get(allocation.sourceId.toString());

    if (!source) {
      throw new Error("Kh\u00f4ng t\u00ecm th\u1ea5y b\u1ea3n ghi ngu\u1ed3n \u0111\u1ec3 ho\u00e0n s\u1ed1 l\u01b0\u1ee3ng \u0111ang gi\u1eef.");
    }

    if (source.status === exchangedDepositStatus || source.status === canceledDepositStatus) {
      throw new Error("B\u1ea3n ghi ngu\u1ed3n \u0111\u00e3 \u0111\u1ed5i qu\u00e0 ho\u1eb7c b\u1ecb hu\u1ef7, kh\u00f4ng th\u1ec3 ho\u00e0n l\u1ea1i t\u1ef1 \u0111\u1ed9ng.");
    }

    if (allocation.cards > 0 && source.cardAction !== depositCardAction) {
      throw new Error("Ngu\u1ed3n ho\u00e0n th\u1ebb kh\u00f4ng h\u1ee3p l\u1ec7.");
    }

    if (allocation.balls > 0 && source.ballAction !== depositBallAction) {
      throw new Error("Ngu\u1ed3n ho\u00e0n bi kh\u00f4ng h\u1ee3p l\u1ec7.");
    }

    if (allocation.cards > source.cards - getRemainingCards(source)) {
      throw new Error("S\u1ed1 th\u1ebb c\u1ea7n ho\u00e0n kh\u00f4ng c\u00f2n kh\u1edbp v\u1edbi b\u1ea3n ghi ngu\u1ed3n.");
    }

    if (allocation.balls > source.balls - getRemainingBalls(source)) {
      throw new Error("S\u1ed1 bi c\u1ea7n ho\u00e0n kh\u00f4ng c\u00f2n kh\u1edbp v\u1edbi b\u1ea3n ghi ngu\u1ed3n.");
    }
  }

  const actorName = getRestoredActorName(deleted);

  for (const allocation of allocations) {
    const source = sourcesById.get(allocation.sourceId.toString());

    if (!source) {
      continue;
    }

    if (allocation.cards > 0) {
      source.remainingCards = getRemainingCards(source) + allocation.cards;
    }

    if (allocation.balls > 0) {
      source.remainingBalls = getRemainingBalls(source) + allocation.balls;
    }

    if (
      source.status === returnedDepositStatus &&
      (getRemainingCards(source) > 0 || getRemainingBalls(source) > 0)
    ) {
      source.status = activeDepositStatus;
    }

    source.history.push({
      at: new Date(),
      actorName,
      action: "AUTO_RESTORE",
      content: `Ho\u00e0n ${allocation.cards} th\u1ebb, ${allocation.balls} bi do xo\u00e1 b\u1ea3n ghi l\u1ea5y.`,
    });
    await source.save();
  }

  // Restore the balance snapshot displayed on records created after this withdrawal.
  await restoreLaterSnapshotTotals(deleted, required);

  return required;
}
