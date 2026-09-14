import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const cardActions = ["Gửi thẻ", "Lấy thẻ"];
const ballActions = ["Gửi bi", "Lấy bi"];
const depositStatuses = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];

const withdrawCardAction = cardActions[1];
const withdrawBallAction = ballActions[1];
const activeDepositStatus = depositStatuses[0];
const returnedDepositStatus = depositStatuses[1];
const exchangedDepositStatus = depositStatuses[2];
const canceledDepositStatus = depositStatuses[3];

function buildTotalText(cards, balls) {
  return `Thẻ: ${cards} | Bi: ${balls}`;
}

function normalizePhone(phone) {
  let cleaned = String(phone || "").trim().replace(/[\s().-]/g, "");
  if (cleaned.startsWith("+84")) {
    cleaned = "0" + cleaned.slice(3);
  } else if (cleaned.startsWith("84") && cleaned.length > 9) {
    cleaned = "0" + cleaned.slice(2);
  }
  return cleaned;
}

async function recalculateAll() {
  await mongoose.connect(uri, { bufferCommands: false });
  const collection = mongoose.connection.collection("customers_deposits");

  const rawPhones = await collection.distinct("phone");
  const phones = [...new Set(rawPhones.filter(Boolean).map(normalizePhone))];
  console.log(`Found ${phones.length} unique customers to recalculate.`);

  let totalUpdated = 0;

  for (const phone of phones) {
    if (!phone) continue;

    // Match phone or legacy formats for this customer
    const deposits = await collection
      .find({
        $or: [
          { phone },
          { phone: `+84${phone.slice(1)}` },
          { phone: `84${phone.slice(1)}` },
        ],
      })
      .sort({ depositDate: 1, depositTime: 1, createdAt: 1, _id: 1 })
      .toArray();

    if (deposits.length === 0) continue;

    let runningCards = 0;
    let runningBalls = 0;

    const openCardDeposits = [];
    const openBallDeposits = [];
    const plans = new Map();

    for (const deposit of deposits) {
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
      const allocations = [];

      // Process Cards
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
            sourceId: new mongoose.Types.ObjectId(openDep.id),
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
        const cardsToAdd = deposit.cards || 0;
        runningCards += cardsToAdd;
        if (cardsToAdd > 0) {
          openCardDeposits.push({ id: idStr, remainingCards: cardsToAdd });
          docRemainingCards = cardsToAdd;
        } else {
          docRemainingCards = 0;
        }
      }

      // Process Balls
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
              sourceId: new mongoose.Types.ObjectId(openDep.id),
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

    const bulkWrites = [];

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
        deposit.phone !== phone ||
        deposit.totalText !== totalText ||
        deposit.remainingCards !== remainingCards ||
        deposit.remainingBalls !== remainingBalls ||
        deposit.status !== finalStatus ||
        allocationsChanged;

      if (needsUpdate) {
        bulkWrites.push({
          updateOne: {
            filter: { _id: deposit._id },
            update: {
              $set: {
                phone,
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
      await collection.bulkWrite(bulkWrites);
      totalUpdated += bulkWrites.length;
    }
  }

  console.log(`Successfully recalculated and reconciled running totals. Updated ${totalUpdated} records across ${phones.length} customers.`);
}

try {
  await recalculateAll();
} finally {
  await mongoose.disconnect();
}
