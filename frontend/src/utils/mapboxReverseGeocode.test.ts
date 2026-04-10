import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compactUsMapboxPlaceName,
  formatMapboxPlaceNameForDisplay,
  mapboxReversePlaceName,
  shortenMapboxPlaceName,
} from "./mapboxReverseGeocode";

describe("shortenMapboxPlaceName", () => {
  it("drops leading highway when four or more comma-separated segments", () => {
    expect(
      shortenMapboxPlaceName(
        "Grand Army of the Republic Highway, Frisco, Colorado 80443, United States",
      ),
    ).toBe("Frisco, Colorado 80443, United States");
  });

  it("drops leading street when four or more segments", () => {
    expect(shortenMapboxPlaceName("123 Main St, Austin, Texas 78701, United States")).toBe(
      "Austin, Texas 78701, United States",
    );
  });

  it("keeps three-segment city, region, country lines", () => {
    expect(shortenMapboxPlaceName("Austin, Texas, United States")).toBe("Austin, Texas, United States");
  });

  it("drops first segment for three-part lines when first looks like a street", () => {
    expect(shortenMapboxPlaceName("Oak Street, Boulder, Colorado")).toBe("Boulder, Colorado");
  });
});

describe("compactUsMapboxPlaceName", () => {
  it("maps city + state + zip + United States to state + zip + US", () => {
    expect(compactUsMapboxPlaceName("Moapa, Nevada 89025, United States")).toBe("Nevada 89025, US");
  });

  it("handles Frisco-style line", () => {
    expect(compactUsMapboxPlaceName("Frisco, Colorado 80443, United States")).toBe("Colorado 80443, US");
  });

  it("leaves non-US lines unchanged", () => {
    expect(compactUsMapboxPlaceName("Paris, Île-de-France, France")).toBe("Paris, Île-de-France, France");
  });
});

describe("formatMapboxPlaceNameForDisplay", () => {
  it("chains shorten + US compact", () => {
    expect(
      formatMapboxPlaceNameForDisplay(
        "Grand Army of the Republic Highway, Moapa, Nevada 89025, United States",
      ),
    ).toBe("Nevada 89025, US");
  });
});

describe("mapboxReversePlaceName", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns formatted place_name from first feature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{ place_name: "123 Main St, Austin, Texas 78701, United States" }],
        }),
      }),
    );

    const name = await mapboxReversePlaceName(-97.74, 30.27, "test-token");
    expect(name).toBe("Texas 78701, US");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns empty string when request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    const name = await mapboxReversePlaceName(-98.0, 29.5, "bad-token");
    expect(name).toBe("");
  });
});
