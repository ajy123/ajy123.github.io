// Puts the essay modal in the URL. Without this the modal is the one thing on
// the site you can't link to: no share, no deep link, and Back leaves the page
// instead of closing the dialog it looks like it should close.
//
// Shape is `#essay/<id>`, deliberately hash-based — both entries are static
// HTML with no server rewrite, so a real path would 404 on refresh.
//
// Consumed by the landing cards and by /deeli/'s in-page essay link, so the
// two surfaces can't drift on what "open" means.
import { useCallback, useEffect, useState } from "react";

const HASH_PREFIX = "#essay/";
// Stamped onto the history entry we create, rather than tracked in a ref: the
// marker travels with the entry, so Back and Forward keep telling the truth
// about whether this entry is ours. A ref only knows about the push that
// happened in this component's lifetime, and goes stale the moment Forward
// re-reveals an entry it already forgot.
const PUSH_MARKER = { essayHashPush: true } as const;

function isOurHistoryEntry() {
  const state: unknown = window.history.state;
  return Boolean(
    state && typeof state === "object" && "essayHashPush" in state,
  );
}

export function essayHash(id: string) {
  return `${HASH_PREFIX}${encodeURIComponent(id)}`;
}

function readEssayHash(): string | null {
  if (typeof window === "undefined") return null;
  const { hash } = window.location;
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const id = hash.slice(HASH_PREFIX.length);
  return id ? decodeURIComponent(id) : null;
}

export function useEssayHashRoute() {
  const [essayId, setEssayId] = useState<string | null>(readEssayHash);

  useEffect(() => {
    const sync = () => {
      setEssayId(readEssayHash());
    };

    // popstate covers Back/Forward; hashchange covers a hash edited in the
    // address bar or an anchor click elsewhere on the page moving us off the
    // essay hash. Both landing on the same setState is harmless.
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const openEssay = useCallback((id: string) => {
    if (readEssayHash() === id) return;
    // pushState fires neither popstate nor hashchange, so the state update is
    // ours to make.
    window.history.pushState(PUSH_MARKER, "", essayHash(id));
    setEssayId(id);
  }, []);

  const closeEssay = useCallback(() => {
    if (isOurHistoryEntry()) {
      // Unwind our own entry so an open/close cycle leaves no history litter;
      // the popstate listener above clears the state. Deliberately no
      // setEssayId here — letting popstate do it keeps `open` in step with the
      // URL, so the dialog's scroll lock and focus trap never lift early.
      window.history.back();
      return;
    }

    if (readEssayHash() !== null) {
      // Strip the hash without adding an entry — keeps Back pointing at
      // wherever the visitor came from.
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    setEssayId(null);
  }, []);

  return { essayId, openEssay, closeEssay };
}
