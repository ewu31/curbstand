import { useEffect, useState } from "react";
import { isFollowing, toggleFollow } from "../lib/follows";

export default function FollowButton({ producerId, viewerId }: { producerId: string; viewerId?: string | null }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(viewerId && isFollowing(viewerId, producerId)));
    sync();
    window.addEventListener("curbstand-follows", sync);
    return () => window.removeEventListener("curbstand-follows", sync);
  }, [producerId, viewerId]);

  if (viewerId && viewerId === producerId) return null;
  if (!viewerId) {
    const next = typeof window === "undefined" ? "/following" : window.location.pathname;
    return <a className="text-button" href={`/login?next=${encodeURIComponent(next)}`}>Follow</a>;
  }
  return (
    <button className="text-button" type="button" aria-pressed={on} onClick={() => toggleFollow(viewerId, producerId)}>
      {on ? "Following" : "Follow"}
    </button>
  );
}
