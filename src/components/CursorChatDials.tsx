import { useDialKit } from "dialkit";
import {
  CursorChat,
  DEFAULT_CURSOR_CHAT_DIALS,
  type CursorChatDials,
} from "../CursorChat";

export function CursorChatWithDials({
  suspended = false,
}: {
  suspended?: boolean;
}) {
  const params = useDialKit(
    "Cursor Chat",
    {
      chipStaggerMs: [DEFAULT_CURSOR_CHAT_DIALS.chipStaggerMs, 0, 140, 5],
      radiusTight: [DEFAULT_CURSOR_CHAT_DIALS.radiusTight, 0, 10, 1],
      radiusRoomy: [DEFAULT_CURSOR_CHAT_DIALS.radiusRoomy, 8, 22, 1],
    },
    {
      id: "cursor-chat",
      persist: {
        key: "joanna-cursor-chat-dials",
      },
    },
  );

  const dials: CursorChatDials = {
    ...DEFAULT_CURSOR_CHAT_DIALS,
    chipStaggerMs: params.chipStaggerMs,
    radiusTight: params.radiusTight,
    radiusRoomy: params.radiusRoomy,
  };

  return <CursorChat dials={dials} suspended={suspended} />;
}
