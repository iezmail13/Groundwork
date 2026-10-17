import { describe, expect, it } from "vitest";
import { fromTokens, mentionAt, mentionedIds, splitMentions, toTokens } from "@/lib/chat-text";

const SAM = "a0000000-0000-0000-0000-00000000000e";
const SAM_LEE = "a0000000-0000-0000-0000-00000000000f";

describe("chat mentions", () => {
  it("splits stored text into runs and mentions", () => {
    expect(splitMentions(`Thanks <@${SAM}>, see you`)).toEqual([
      { kind: "text", text: "Thanks " },
      { kind: "mention", userId: SAM },
      { kind: "text", text: ", see you" },
    ]);
    expect(splitMentions("No one here")).toEqual([{ kind: "text", text: "No one here" }]);
  });

  it("lists who a text mentions, once each", () => {
    expect(mentionedIds(`<@${SAM}> and <@${SAM}> and <@${SAM_LEE}>`)).toEqual([SAM, SAM_LEE]);
    expect(mentionedIds("<@not-an-id>")).toEqual([]);
  });

  it("turns picked names into tokens, longest first, and only whole names", () => {
    const picked = [
      { userId: SAM, name: "Sam" },
      { userId: SAM_LEE, name: "Sam Lee" },
    ];
    expect(toTokens("@Sam Lee and @Sam, not @Samantha", picked)).toBe(`<@${SAM_LEE}> and <@${SAM}>, not @Samantha`);
    // a name with regex characters is matched literally
    expect(toTokens("hi @J.R. Smith", [{ userId: SAM, name: "J.R. Smith" }])).toBe(`hi <@${SAM}>`);
  });

  it("turns tokens back into names for editing, and round-trips", () => {
    const names: Record<string, string> = { [SAM]: "Sam" };
    const { text, picked } = fromTokens(`Thanks <@${SAM}> and <@${SAM_LEE}>`, (id) => names[id]);
    expect(text).toBe("Thanks @Sam and @someone");
    expect(picked).toEqual([
      { userId: SAM, name: "Sam" },
      { userId: SAM_LEE, name: "someone" },
    ]);
    expect(toTokens(text, picked)).toBe(`Thanks <@${SAM}> and <@${SAM_LEE}>`);
  });

  it("finds the mention being typed at the caret", () => {
    expect(mentionAt("Hello @Pr", 9)).toEqual({ start: 6, query: "Pr" });
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("Hello @Priya Sh", 15)).toEqual({ start: 6, query: "Priya Sh" });
    expect(mentionAt("mail me@example.org", 19)).toBeNull();
    expect(mentionAt("Hello @Priya Shah and", 21)).toBeNull();
  });
});
