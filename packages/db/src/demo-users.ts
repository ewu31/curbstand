// Keep these ids aligned with web/src/lib/demo-accounts.ts.
  {
    id: "8f0b1c2a-6d3e-4f11-9a77-111111111101",
    name: "Maya Chen",
    email: "maya@curbstand.test",
    role: "customer" as const,
    organizationType: "individual" as const,
  },
  {
    id: "8f0b1c2a-6d3e-4f11-9a77-111111111102",
    name: "Jordan Hale",
    email: "jordan@curbstand.test",
    role: "customer" as const,
    organizationType: "individual" as const,
  },
  {
    id: "8f0b1c2a-6d3e-4f11-9a77-111111111103",
    name: "Elena Ortiz",
    email: "elena@curbstand.test",
    role: "producer" as const,
    organizationType: null,
    farmName: "Ortiz Family Farm",
  },
];

export function matchDemoAccount(email: string) {
  const normalized = email.trim().toLowerCase();
  return demoUsers.find((user) => user.email === normalized) ?? null;
}
