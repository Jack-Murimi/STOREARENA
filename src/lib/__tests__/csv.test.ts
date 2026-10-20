import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, isoDate } from "../reports/csv";

describe("CSV export", () => {
  it("doubles quotes so a name cannot break the columns", () => {
    expect(csvCell('Mama "Njeri" Stores')).toBe('"Mama ""Njeri"" Stores"');
  });

  it.each(["=HYPERLINK(\"http://evil\")", "+255700000000", "-1+2", "@SUM(A1:A9)"])(
    "neutralises the formula %s",
    (value) => {
      expect(csvCell(value).startsWith("\"'")).toBe(true);
    },
  );

  it("leaves ordinary text and numbers alone", () => {
    expect(csvCell("Walk-in")).toBe('"Walk-in"');
    expect(csvCell(3000)).toBe('"3000"');
    expect(csvCell(null)).toBe('""');
  });

  it("writes a header row from the declared fields, not the object keys", () => {
    const document = csvDocument(["Receipt", "Total"], ["receipt", "total"], [
      { total: 100, receipt: "GR-1", ignored: "x" },
    ]);
    expect(document).toBe('"Receipt","Total"\r\n"GR-1","100"');
  });

  it("refuses a heading that does not match its fields", () => {
    expect(() => csvDocument(["A", "B"], ["a"], [])).toThrow(/columns/);
  });

  it("accepts real dates and replaces everything else", () => {
    expect(isoDate("2026-02-28", "fallback")).toBe("2026-02-28");
    expect(isoDate("2026-02-30", "fallback")).toBe("fallback");
    expect(isoDate("2026-13-45", "fallback")).toBe("fallback");
    expect(isoDate("yesterday", "fallback")).toBe("fallback");
    expect(isoDate(null, "fallback")).toBe("fallback");
  });
});
