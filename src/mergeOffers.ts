import type { HotelOffer, SupplierHotel } from "./types";

export function mergeBestOffers(city: string, supplierA: SupplierHotel[], supplierB: SupplierHotel[]): HotelOffer[] {
  const bestByName = new Map<string, HotelOffer>();

  for (const [supplier, offers] of [["Supplier A", supplierA], ["Supplier B", supplierB]] as const) {
    for (const offer of offers) {
      const normalizedName = offer.name.trim().toLowerCase().replace(/\s+/g, " ");
      const current = bestByName.get(normalizedName);
      if (!current || offer.price < current.price) {
        bestByName.set(normalizedName, {
          ...offer,
          city: offer.city || city,
          supplier,
        });
      }
    }
  }

  return [...bestByName.values()];
}
