import { buildTotalText } from "@/lib/time";
import { ballActions, cardActions, depositStatuses } from "@/lib/validation";
import { CustomerDeposit } from "@/models/CustomerDeposit";

const activeDepositStatus = depositStatuses[0];
const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];

export type HeldTotal = {
  cards: number;
  balls: number;
};

type HeldTotalAggregate = {
  _id: string;
  cards: number;
  balls: number;
};

/**
 * Returns the live balance still held for each customer. This is the only
 * source used for customer-facing totals; `totalText` on a record remains an
 * audit snapshot and must not be used as a balance source.
 */
export async function getHeldTotalsByPhone(phonesInput: Iterable<string | null | undefined>) {
  const phones = [
    ...new Set(
      [...phonesInput]
        .filter((phone): phone is string => typeof phone === "string" && phone.trim().length > 0)
        .map((phone) => phone.trim()),
    ),
  ];

  if (phones.length === 0) {
    return new Map<string, HeldTotal>();
  }

  const totals = await CustomerDeposit.aggregate<HeldTotalAggregate>([
    { $match: { phone: { $in: phones }, status: activeDepositStatus } },
    {
      $group: {
        _id: "$phone",
        cards: {
          $sum: {
            $cond: [
              { $ne: ["$cardAction", withdrawCardAction] },
              { $ifNull: ["$remainingCards", "$cards"] },
              0,
            ],
          },
        },
        balls: {
          $sum: {
            $cond: [
              { $ne: ["$ballAction", withdrawBallAction] },
              { $ifNull: ["$remainingBalls", "$balls"] },
              0,
            ],
          },
        },
      },
    },
  ]);

  return new Map(totals.map((total) => [total._id, { cards: total.cards, balls: total.balls }]));
}

export async function getHeldTotalByPhone(phone: string): Promise<HeldTotal> {
  const totals = await getHeldTotalsByPhone([phone]);

  return totals.get(phone.trim()) ?? { cards: 0, balls: 0 };
}

export async function getHeldTotalTextByPhone(phone: string) {
  const total = await getHeldTotalByPhone(phone);

  return buildTotalText(total.cards, total.balls);
}
