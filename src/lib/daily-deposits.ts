import { Types, type AnyBulkWriteOperation } from "mongoose";
import { buildTotalText } from "@/lib/time";
import { ballActions, cardActions, depositStatuses, normalizePhone } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit, type IWithdrawalAllocation } from "@/models/CustomerDeposit";
import { CustomerDailyDeposit } from "@/models/CustomerDailyDeposit";

const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];
const activeDepositStatus = depositStatuses[0];
const returnedDepositStatus = depositStatuses[1];
const exchangedDepositStatus = depositStatuses[2];
const canceledDepositStatus = depositStatuses[3];

type DailyAggregate = {
  _id: {
    date: string;
    phone: string;
  };
  fullName: string;
  records: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
};

function normalizeDates(dates: Iterable<string | undefined>) {
  return [...new Set([...dates].filter((date): date is string => /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")))];
}

export async function rebuildCustomerDailyTotalsForDates(dates: Iterable<string | undefined>) {
  const normalizedDates = normalizeDates(dates);

  if (normalizedDates.length === 0) {
    return;
  }

  const summaries = await CustomerDeposit.aggregate<DailyAggregate>([
    {
      $match: {
        depositDate: { $in: normalizedDates },
        status: { $ne: canceledDepositStatus },
      },
    },
    { $sort: { updatedAt: -1, createdAt: -1 } },
    {
      $group: {
        _id: {
          date: "$depositDate",
          phone: "$phone",
        },
        fullName: { $first: "$fullName" },
        records: { $sum: 1 },
        cardsDeposited: {
          $sum: { $cond: [{ $eq: ["$cardAction", depositCardAction] }, "$cards", 0] },
        },
        ballsDeposited: {
          $sum: { $cond: [{ $eq: ["$ballAction", depositBallAction] }, "$balls", 0] },
        },
        cardsWithdrawn: {
          $sum: { $cond: [{ $eq: ["$cardAction", withdrawCardAction] }, "$cards", 0] },
        },
        ballsWithdrawn: {
          $sum: { $cond: [{ $eq: ["$ballAction", withdrawBallAction] }, "$balls", 0] },
        },
      },
    },
  ]);

  const phonesByDate = new Map<string, Set<string>>();
  const writes = summaries.map((summary) => {
    const date = summary._id.date;
    const phone = summary._id.phone;
    const phones = phonesByDate.get(date) ?? new Set<string>();

    phones.add(phone);
    phonesByDate.set(date, phones);

    return {
      updateOne: {
        filter: { date, phone },
        update: {
          $set: {
            date,
            phone,
            fullName: summary.fullName,
            records: summary.records,
            cardsDeposited: summary.cardsDeposited,
            ballsDeposited: summary.ballsDeposited,
            cardsWithdrawn: summary.cardsWithdrawn,
            ballsWithdrawn: summary.ballsWithdrawn,
          },
        },
        upsert: true,
      },
    };
  });

  if (writes.length > 0) {
    await CustomerDailyDeposit.bulkWrite(writes);
  }

  await Promise.all(
    normalizedDates.map((date) => {
      const phones = [...(phonesByDate.get(date) ?? [])];

      if (phones.length === 0) {
        return CustomerDailyDeposit.deleteMany({ date });
      }

      return CustomerDailyDeposit.deleteMany({
        date,
        phone: { $nin: phones },
      });
    }),
  );
}

function normalizePhones(phones: Iterable<string | undefined>) {
  return [
    ...new Set(
      [...phones]
        .filter((phone): phone is string => typeof phone === "string" && phone.trim().length > 0)
        .map((phone) => normalizePhone(phone)),
    ),
  ];
}

export async function recalculateCustomerDepositTotals(phonesInput: string | Iterable<string | undefined>) {
  const phones = typeof phonesInput === "string"
    ? normalizePhones([phonesInput])
    : normalizePhones(phonesInput);

  if (phones.length === 0) {
    return;
  }

  const affectedDates = new Set<string>();

  for (const phone of phones) {
    const deposits = await CustomerDeposit.find({ phone }).sort({
      depositDate: 1,
      depositTime: 1,
      createdAt: 1,
      _id: 1,
    });

    if (deposits.length === 0) {
      continue;
    }

    let runningCards = 0;
    let runningBalls = 0;

    // Track open deposits available for FIFO deductions
    const openCardDeposits: Array<{ id: string; remainingCards: number }> = [];
    const openBallDeposits: Array<{ id: string; remainingBalls: number }> = [];

    type DepositPlan = {
      deposit: ICustomerDeposit;
      remainingCards: number;
      remainingBalls: number;
      status: (typeof depositStatuses)[number];
      totalText: string;
      allocations: IWithdrawalAllocation[];
    };
    const plans = new Map<string, DepositPlan>();

    for (const deposit of deposits) {
      affectedDates.add(deposit.depositDate);
      const idStr = deposit._id.toString();

      if (deposit.status === canceledDepositStatus) {
        plans.set(idStr, {
          deposit,
          remainingCards: 0,
          remainingBalls: 0,
          status: canceledDepositStatus,
          totalText: buildTotalText(runningCards, runningBalls),
          allocations: [],
        });
        continue;
      }

      let docRemainingCards = 0;
      let docRemainingBalls = 0;
      const allocations: IWithdrawalAllocation[] = [];

      // 1. Process Cards
      if (deposit.cardAction === withdrawCardAction) {
        const cardsToTake = deposit.cards || 0;
        runningCards = Math.max(0, runningCards - cardsToTake);
        let needed = cardsToTake;

        for (const openDep of openCardDeposits) {
          if (needed <= 0) break;
          const take = Math.min(openDep.remainingCards, needed);
          openDep.remainingCards -= take;
          needed -= take;

          const sourcePlan = plans.get(openDep.id);
          if (sourcePlan) {
            sourcePlan.remainingCards = openDep.remainingCards;
          }

          allocations.push({
            sourceId: new Types.ObjectId(openDep.id),
            cards: take,
            balls: 0,
          });
        }
        for (let i = openCardDeposits.length - 1; i >= 0; i--) {
          if (openCardDeposits[i].remainingCards <= 0) {
            openCardDeposits.splice(i, 1);
          }
        }
        docRemainingCards = 0;
      } else {
        // Gửi thẻ
        const cardsToAdd = deposit.cards || 0;
        runningCards += cardsToAdd;
        if (cardsToAdd > 0) {
          openCardDeposits.push({ id: idStr, remainingCards: cardsToAdd });
          docRemainingCards = cardsToAdd;
        } else {
          docRemainingCards = 0;
        }
      }

      // 2. Process Balls
      if (deposit.ballAction === withdrawBallAction) {
        const ballsToTake = deposit.balls || 0;
        runningBalls = Math.max(0, runningBalls - ballsToTake);
        let needed = ballsToTake;

        for (const openDep of openBallDeposits) {
          if (needed <= 0) break;
          const take = Math.min(openDep.remainingBalls, needed);
          openDep.remainingBalls -= take;
          needed -= take;

          const sourcePlan = plans.get(openDep.id);
          if (sourcePlan) {
            sourcePlan.remainingBalls = openDep.remainingBalls;
          }

          const existingAlloc = allocations.find(
            (a) => a.sourceId.toString() === openDep.id,
          );
          if (existingAlloc) {
            existingAlloc.balls += take;
          } else {
            allocations.push({
              sourceId: new Types.ObjectId(openDep.id),
              cards: 0,
              balls: take,
            });
          }
        }
        for (let i = openBallDeposits.length - 1; i >= 0; i--) {
          if (openBallDeposits[i].remainingBalls <= 0) {
            openBallDeposits.splice(i, 1);
          }
        }
        docRemainingBalls = 0;
      } else {
        // Gửi bi
        const ballsToAdd = deposit.balls || 0;
        runningBalls += ballsToAdd;
        if (ballsToAdd > 0) {
          openBallDeposits.push({ id: idStr, remainingBalls: ballsToAdd });
          docRemainingBalls = ballsToAdd;
        } else {
          docRemainingBalls = 0;
        }
      }

      const totalText = buildTotalText(runningCards, runningBalls);

      plans.set(idStr, {
        deposit,
        remainingCards: docRemainingCards,
        remainingBalls: docRemainingBalls,
        status: deposit.status,
        totalText,
        allocations,
      });
    }

    // Pass 2: Finalize statuses and prepare bulk writes
    const bulkWrites: AnyBulkWriteOperation<ICustomerDeposit>[] = [];

    for (const [, plan] of plans) {
      const { deposit, remainingCards, remainingBalls, totalText, allocations } = plan;

      let finalStatus = deposit.status;
      if (deposit.status === canceledDepositStatus) {
        finalStatus = canceledDepositStatus;
      } else if (deposit.status === exchangedDepositStatus) {
        finalStatus = exchangedDepositStatus;
      } else if (remainingCards > 0 || remainingBalls > 0) {
        finalStatus = activeDepositStatus;
      } else {
        finalStatus = returnedDepositStatus;
      }

      const allocationsChanged =
        JSON.stringify(
          (deposit.withdrawalAllocations ?? []).map((a) => ({
            sourceId: a.sourceId.toString(),
            cards: a.cards,
            balls: a.balls,
          })),
        ) !==
        JSON.stringify(
          allocations.map((a) => ({
            sourceId: a.sourceId.toString(),
            cards: a.cards,
            balls: a.balls,
          })),
        );

      const needsUpdate =
        deposit.totalText !== totalText ||
        deposit.remainingCards !== remainingCards ||
        deposit.remainingBalls !== remainingBalls ||
        deposit.status !== finalStatus ||
        allocationsChanged;

      if (needsUpdate) {
        deposit.totalText = totalText;
        deposit.remainingCards = remainingCards;
        deposit.remainingBalls = remainingBalls;
        deposit.status = finalStatus;
        deposit.withdrawalAllocations = allocations;

        bulkWrites.push({
          updateOne: {
            filter: { _id: deposit._id },
            update: {
              $set: {
                totalText,
                remainingCards,
                remainingBalls,
                status: finalStatus,
                withdrawalAllocations: allocations,
              },
            },
          },
        });
      }
    }

    if (bulkWrites.length > 0) {
      await CustomerDeposit.bulkWrite(bulkWrites);
    }
  }

  if (affectedDates.size > 0) {
    await rebuildCustomerDailyTotalsForDates(affectedDates);
  }
}
