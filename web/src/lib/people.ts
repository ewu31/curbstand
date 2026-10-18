import { demoUsers } from "./demo-accounts";

export type ProducerKind = "at_home" | "local_farmer" | "large_scale_farmer";

export type Person = {
  id: string;
  name: string;
  photoUrl: string;
  role: "customer" | "producer";
  farmName?: string;
  producerType?: ProducerKind;
};

const maya = demoUsers[0];
const jordan = demoUsers[1];
const elena = demoUsers[2];

export const customers: Person[] = [
  { id: maya.id, name: maya.name, photoUrl: maya.photoUrl, role: "customer" },
  { id: jordan.id, name: jordan.name, photoUrl: jordan.photoUrl, role: "customer" },
];

export const growers: Person[] = [
  { id: elena.id, name: elena.name, farmName: "Ortiz Family Farm", photoUrl: elena.photoUrl, producerType: "local_farmer", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222201", name: "Noah Blake", farmName: "Blake Backyard", photoUrl: "/avatars/noah.svg", producerType: "at_home", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222202", name: "Priya Shah", farmName: "Shah Garden", photoUrl: "/avatars/priya.svg", producerType: "at_home", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222203", name: "Owen Park", farmName: "Park Hollow Farm", photoUrl: "/avatars/owen.svg", producerType: "local_farmer", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222204", name: "Ruth Abebe", farmName: "Abebe Greens", photoUrl: "/avatars/ruth.svg", producerType: "local_farmer", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222205", name: "Lila Nguyen", farmName: "Nguyen Orchards", photoUrl: "/avatars/lila.svg", producerType: "large_scale_farmer", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222206", name: "Chris Dalton", farmName: "Dalton Fields", photoUrl: "/avatars/chris.svg", producerType: "large_scale_farmer", role: "producer" },
  { id: "8f0b1c2a-6d3e-4f11-9a77-222222222207", name: "Hana Ito", farmName: "Ito Homestead", photoUrl: "/avatars/hana.svg", producerType: "at_home", role: "producer" },
];

export const roster: Person[] = [...customers, ...growers];

export function findPerson(id: string): Person | null {
  return roster.find((person) => person.id === id) ?? null;
}
