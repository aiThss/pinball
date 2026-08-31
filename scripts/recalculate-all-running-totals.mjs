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
const canceledDepositStatus = depositStatuses[3];

function buildTotalText(cards, balls) {
  return `Thẻ: ${cards} | Bi: ${balls}`;
}

async function recalculateAll() {
  await mongoose.connect(uri, { bufferCommands: false });
  const collection = mongoose.connection.collection("customers_deposits");

  const phones = await collection.distinct("phone");
  console.log(`Found ${phones.length} unique customers to recalculate.`);

  let totalUpdated = 0;

  for (const phone of phones) {
    if (!phone) continue;

    const deposits = await collection
      .find({ phone })
      .sort({ depositDate: 1, depositTime: 1, createdAt: 1, _id: 1 })
      .toArray();

    if (deposits.length === 0) continue;

    let runningCards = 0;
    let runningBalls = 0;
    const bulkWrites = [];

    for (const deposit of deposits) {
      if (deposit.status !== canceledDepositStatus) {
        if (deposit.cardAction === withdrawCardAction) {
          runningCards = Math.max(0, runningCards - (deposit.cards || 0));
        } else {
          runningCards += deposit.cards || 0;
        }

        if (deposit.ballAction === withdrawBallAction) {
          runningBalls = Math.max(0, runningBalls - (deposit.balls || 0));
        } else {
          runningBalls += deposit.balls || 0;
        }
      }

      const expectedTotalText = buildTotalText(runningCards, runningBalls);

      if (deposit.totalText !== expectedTotalText) {
        bulkWrites.push({
          updateOne: {
            filter: { _id: deposit._id },
            update: { $set: { totalText: expectedTotalText } },
          },
        });
      }
    }

    if (bulkWrites.length > 0) {
      await collection.bulkWrite(bulkWrites);
      totalUpdated += bulkWrites.length;
    }
  }

  console.log(`Successfully recalculated running totals. Updated ${totalUpdated} records across ${phones.length} customers.`);
}

try {
  await recalculateAll();
} finally {
  await mongoose.disconnect();
}
