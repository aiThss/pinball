import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const { MONGODB_URI, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME } = process.env;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI.");
  process.exit(1);
}

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error("Missing ADMIN_USERNAME or ADMIN_PASSWORD.");
  process.exit(1);
}

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "staff"],
      default: "staff",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { timestamps: true },
);

const User = mongoose.models.User ?? mongoose.model("User", UserSchema);

await mongoose.connect(MONGODB_URI, { bufferCommands: false });

const username = ADMIN_USERNAME.toLowerCase();
const existing = await User.findOne({ username });

if (existing) {
  console.log(`Admin user "${username}" already exists. No changes made.`);
  await mongoose.disconnect();
  process.exit(0);
}

const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

await User.create({
  username,
  displayName: ADMIN_DISPLAY_NAME || "Admin",
  passwordHash,
  role: "admin",
  isActive: true,
});

console.log(`Created admin user "${username}".`);
await mongoose.disconnect();
