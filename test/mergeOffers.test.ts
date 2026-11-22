import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeBestOffers } from "../src/mergeOffers";
import type { SupplierHotel } from "../src/types";

function hotel(name: string, price: number, hotelId: string, city = "delhi"): SupplierHotel {
  return { hotelId, name, price, city, commissionPct: 10 };
}

test("selects the cheaper offer for a hotel listed by both suppliers", () => {
  const supplierA = hotel("Holtin", 6000, "a-holtin");
  const supplierB = hotel("Holtin", 5340, "b-holtin");

  assert.deepStrictEqual(mergeBestOffers("delhi", [supplierA], [supplierB]), [
    { ...supplierB, supplier: "Supplier B" },
  ]);
});

test("keeps hotels returned by only one supplier", () => {
  const supplierA = hotel("Taj Palace", 9100, "a-taj");
  const supplierB = hotel("Leela Palace", 9800, "b-leela");

  assert.deepStrictEqual(mergeBestOffers("delhi", [supplierA], [supplierB]), [
    { ...supplierA, supplier: "Supplier A" },
    { ...supplierB, supplier: "Supplier B" },
  ]);
});

test("normalizes case and whitespace before deduplicating names", () => {
  const supplierA = hotel("The Imperial", 11500, "a-imperial");
  const supplierBDuplicate = hotel(" the   imperial ", 11800, "b-imperial-duplicate");
  const supplierBCheaper = hotel("THE IMPERIAL", 11300, "b-imperial");

  const result = mergeBestOffers("delhi", [supplierA], [supplierBDuplicate, supplierBCheaper]);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.price, 11300);
  assert.equal(result[0]?.supplier, "Supplier B");
});

test("uses the requested city when a supplier omits the city", () => {
  const supplierA = hotel("Rambagh Palace", 14500, "a-rambagh", "");

  assert.deepStrictEqual(mergeBestOffers("jaipur", [supplierA], []), [
    { ...supplierA, city: "jaipur", supplier: "Supplier A" },
  ]);
});

test("keeps Supplier A when duplicate offers have equal prices", () => {
  const supplierA = hotel("Radison", 5900, "a-radison");
  const supplierB = hotel("Radison", 5900, "b-radison");

  assert.deepStrictEqual(mergeBestOffers("delhi", [supplierA], [supplierB]), [
    { ...supplierA, supplier: "Supplier A" },
  ]);
});
