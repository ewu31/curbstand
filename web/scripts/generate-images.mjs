import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../public");
mkdirSync(join(root, "avatars"), { recursive: true });
mkdirSync(join(root, "produce"), { recursive: true });

const people = [
  ["maya", "Maya", "#315d40"],
  ["jordan", "Jordan", "#3f6b4e"],
  ["elena", "Elena", "#244930"],
  ["noah", "Noah", "#4d7a57"],
  ["priya", "Priya", "#2f6a4a"],
  ["owen", "Owen", "#3b5e45"],
  ["ruth", "Ruth", "#567a52"],
  ["lila", "Lila", "#1f4d34"],
  ["chris", "Chris", "#40664c"],
  ["hana", "Hana", "#2c5a40"],
  ["alice", "Alice", "#315d40"],
  ["bob", "Bob", "#3d6b4c"],
  ["bistro", "Bistro", "#4a6741"],
  ["operator", "Operator", "#234233"],
  ["joe", "Joe", "#356348"],
  ["maria", "Maria", "#2e5c3e"],
  ["okafor", "Okafor", "#4e7354"],
  ["guest", "Guest", "#6e756e"],
];

for (const [file, name, color] of people) {
  const initials = name.slice(0, 2).toUpperCase();
  writeFileSync(
    join(root, "avatars", `${file}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="${color}"/><text x="40" y="48" text-anchor="middle" font-family="Trebuchet MS, sans-serif" font-size="28" fill="#f4f7ef">${initials}</text></svg>`,
  );
}

writeFileSync(
  join(root, "avatar.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="40" fill="#315d40"/><circle cx="40" cy="32" r="12" fill="#f4f7ef"/><path d="M18 70c3-14 12-22 22-22s19 8 22 22" fill="#f4f7ef"/></svg>`,
);

const produce = [
  ["carrots", "#e07a2f"],
  ["potatoes", "#c4a36a"],
  ["onions", "#d4b483"],
  ["strawberries", "#c7354a"],
  ["kale", "#2f6b45"],
  ["pears", "#c7b15a"],
  ["cherries", "#9b2335"],
  ["lettuce", "#7dae6a"],
  ["blueberries", "#3d4c8a"],
  ["corn", "#e2b33a"],
  ["peppers", "#c0392b"],
  ["cucumbers", "#4f8f4a"],
  ["zucchini", "#6a8f3a"],
  ["peaches", "#e7a07a"],
  ["broccoli", "#3e7a45"],
  ["cabbage", "#8faf72"],
  ["plums", "#6a3a6a"],
  ["produce", "#315d40"],
];

for (const [slug, color] of produce) {
  writeFileSync(
    join(root, "produce", `${slug}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#e7f0e4"/><circle cx="320" cy="220" r="120" fill="${color}"/><ellipse cx="280" cy="180" rx="36" ry="18" fill="#ffffff" opacity="0.35"/></svg>`,
  );
}
