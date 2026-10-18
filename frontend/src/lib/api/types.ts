export type Availability = "available" | "busy" | "on_leave" | "offline";

export type Me = {
  user: { id: string; name: string; email: string };
  workspace: {
    id: string;
    name: string;
    slug?: string;
    timezone?: string;
    defaultCurrency?: string;
  };
  role: { id: string; name: string; baseLevel: "owner" | "admin" | "user" };
  permissions: string[];
  availability: Availability;
  telegramLinked: boolean;
  googleConnected?: boolean;
};

export type List<T> = { items: T[]; nextCursor?: string | null };

export type RealtimeEvent = {
  type: string;
  ids?: Record<string, string | null | undefined>;
};
