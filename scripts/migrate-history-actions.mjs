import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const automaticActionByContent = [
  [/^Tự trừ \d+ (thẻ|bi) do tạo bản ghi lấy (thẻ|bi)\./u, "AUTO_DEDUCT"],
  [/^Hoàn \d+ thẻ, \d+ bi do xoá bản ghi lấy\./u, "AUTO_RESTORE"],
];

function getAutomaticAction(entry) {
  if (entry?.action !== "UPDATE" || typeof entry.content !== "string") {
    return null;
  }

  return automaticActionByContent.find(([pattern]) => pattern.test(entry.content))?.[1] ?? null;
}

async function migrate() {
  await mongoose.connect(uri, { bufferCommands: false });
  const collection = mongoose.connection.collection("customers_deposits");
  const cursor = collection.find(
    { "history.action": "UPDATE" },
    { projection: { history: 1 } },
  );
  const operations = [];
  let migratedEntries = 0;

  for await (const deposit of cursor) {
    const history = Array.isArray(deposit.history) ? deposit.history : [];
    let changed = false;
    const nextHistory = history.map((entry) => {
      const action = getAutomaticAction(entry);

      if (!action) {
        return entry;
      }

      changed = true;
      migratedEntries += 1;
      return { ...entry, action };
    });

    if (changed) {
      operations.push({
        updateOne: {
          filter: { _id: deposit._id },
          update: { $set: { history: nextHistory } },
        },
      });
    }
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }

  console.log(`Migrated ${migratedEntries} automatic history entries in ${operations.length} records.`);
}

try {
  await migrate();
} finally {
  await mongoose.disconnect();
}
