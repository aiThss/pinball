import type { AnyBulkWriteOperation } from "mongoose";
import { buildTotalText } from "@/lib/time";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import { CustomerDeposit, type ICustomerDeposit } from "@/models/CustomerDeposit";
import { CustomerDailyDeposit } from "@/models/CustomerDailyDeposit";

const depositCardAction = cardActions[0];
const withdrawCardAction = cardActions[1];
const depositBallAction = ballActions[0];
const withdrawBallAction = ballActions[1];
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
        .map((phone) => phone.trim()),
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

  for (const phone of phones) {
    const deposits = await CustomerDeposit.find({ phone }).sort({ depositDate: 1, depositTime: 1, createdAt: 1, _id: 1 });

    if (deposits.length === 0) {
      continue;
    }

    let runningCards = 0;
    let runningBalls = 0;
    const bulkWrites: AnyBulkWriteOperation<ICustomerDeposit>[] = [];

    for (const deposit of deposits) {
      const isCompletedStatus =
        deposit.status === returnedDepositStatus || deposit.status === exchangedDepositStatus;
      const shouldApplyCards =
        deposit.status !== canceledDepositStatus &&
        (!isCompletedStatus || deposit.cardAction === withdrawCardAction);
      const shouldApplyBalls =
        deposit.status !== canceledDepositStatus &&
        (!isCompletedStatus || deposit.ballAction === withdrawBallAction);

      if (shouldApplyCards) {
        if (deposit.cardAction === withdrawCardAction) {
          runningCards = Math.max(0, runningCards - (deposit.cards || 0));
        } else {
          runningCards += deposit.cards || 0;
        }
      }

      if (shouldApplyBalls) {
        if (deposit.ballAction === withdrawBallAction) {
          runningBalls = Math.max(0, runningBalls - (deposit.balls || 0));
        } else {
          runningBalls += deposit.balls || 0;
        }
      }

      const expectedTotalText = buildTotalText(runningCards, runningBalls);

      if (deposit.totalText !== expectedTotalText) {
        deposit.totalText = expectedTotalText;
        bulkWrites.push({
          updateOne: {
            filter: { _id: deposit._id },
            update: { $set: { totalText: expectedTotalText } },
          },
        });
      }
    }

    if (bulkWrites.length > 0) {
      await CustomerDeposit.bulkWrite(bulkWrites);
    }
  }
}
