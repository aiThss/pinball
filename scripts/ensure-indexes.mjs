import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("Missing MONGODB_URI environment variable.");
}

const indexes = [
  {
    key: { status: 1, createdAt: -1 },
    options: { name: "status_1_createdAt_-1" },
  },
  {
    key: { depositDate: 1, createdAt: -1 },
    options: { name: "depositDate_1_createdAt_-1" },
  },
];

try {
  await mongoose.connect(uri, { bufferCommands: false });
  const collection = mongoose.connection.collection("customers_deposits");

  for (const index of indexes) {
    await collection.createIndex(index.key, index.options);
    console.log(`Ensured index: ${index.options.name}`);
  }
} finally {
  await mongoose.disconnect();
}
