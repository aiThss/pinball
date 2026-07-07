import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  process.exit(0);
}

const copies = [
  {
    from: path.join(root, "public"),
    to: path.join(standaloneDir, "public"),
  },
  {
    from: path.join(root, ".next", "static"),
    to: path.join(standaloneDir, ".next", "static"),
  },
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    continue;
  }

  await rm(to, { force: true, recursive: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}
