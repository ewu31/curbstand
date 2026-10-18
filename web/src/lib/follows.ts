import { customers, growers } from "./people";

const KEY = "curbstand.follows";

export type FollowGraph = Record<string, string[]>;

function starter(): FollowGraph {
  const [maya, jordan] = customers;
  const [elena, noah, priya, , ruth] = growers;
  return {
    [maya.id]: [elena.id, noah.id, priya.id],
    [jordan.id]: [elena.id, ruth.id],
  };
}

export function readFollows(): FollowGraph {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return starter();
    const parsed = JSON.parse(raw) as FollowGraph;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return starter();
    return parsed;
  } catch {
    return starter();
  }
}

export function writeFollows(graph: FollowGraph) {
  localStorage.setItem(KEY, JSON.stringify(graph));
  window.dispatchEvent(new Event("curbstand-follows"));
}

export function isFollowing(viewerId: string, producerId: string) {
  return (readFollows()[viewerId] ?? []).includes(producerId);
}

export function toggleFollow(viewerId: string, producerId: string) {
  const graph = readFollows();
  const current = new Set(graph[viewerId] ?? []);
  if (current.has(producerId)) current.delete(producerId);
  else current.add(producerId);
  graph[viewerId] = [...current];
  writeFollows(graph);
}

export function followingIds(userId: string) {
  return readFollows()[userId] ?? [];
}

export function followerIds(userId: string) {
  return Object.entries(readFollows())
    .filter(([, ids]) => Array.isArray(ids) && ids.includes(userId))
    .map(([id]) => id);
}
