import { redis } from "./redis";
import { config } from "./config";
import { logger } from "./logger";
import type { HotelOffer, StoredOfferRequest, SupplierHotel, SupplierId } from "./types";

const CACHE_TTL_SECONDS = 60 * 60;

async function fetchSupplierHotels(supplier: SupplierId, city: string): Promise<SupplierHotel[]> {
  const baseUrl = supplier === "A" ? config.supplierAUrl : config.supplierBUrl;
  const url = new URL(`/supplier${supplier}/hotels`, baseUrl);
  url.searchParams.set("city", city);

  logger.info({ supplier, city }, "Requesting mock supplier offers");
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Supplier ${supplier} returned HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error(`Supplier ${supplier} returned an invalid response`);
  }

  return payload as SupplierHotel[];
}

export async function fetchSupplierA(city: string): Promise<SupplierHotel[]> {
  return fetchSupplierHotels("A", city);
}

export async function fetchSupplierB(city: string): Promise<SupplierHotel[]> {
  return fetchSupplierHotels("B", city);
}

export async function replaceAndFilterOffers(input: StoredOfferRequest): Promise<HotelOffer[]> {
  const cityKey = input.city.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const requestKey = input.requestId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const prefix = `hotel-offers:${cityKey}:${requestKey}`;
  const priceIndexKey = `${prefix}:prices`;
  const recordsKey = `${prefix}:records`;
  const uniqueOffers = new Map<string, HotelOffer>();

  for (const hotel of input.hotels) {
    uniqueOffers.set(hotel.name.trim().toLowerCase().replace(/\s+/g, " "), hotel);
  }

  const hotels = [...uniqueOffers.entries()];
  const transaction = redis.multi();
  transaction.del([priceIndexKey, recordsKey]);

  if (hotels.length > 0) {
    transaction.hSet(recordsKey, Object.fromEntries(hotels.map(([key, hotel]) => [key, JSON.stringify(hotel)])));
    transaction.zAdd(priceIndexKey, hotels.map(([key, hotel]) => ({ score: hotel.price, value: key })));
    transaction.expire(recordsKey, CACHE_TTL_SECONDS);
    transaction.expire(priceIndexKey, CACHE_TTL_SECONDS);
  }

  await transaction.exec();

  // The sorted set is the price index; range filtering is performed by Redis.
  const matchingNames = await redis.zRangeByScore(
    priceIndexKey,
    input.minPrice ?? "-inf",
    input.maxPrice ?? "+inf",
  );
  if (matchingNames.length === 0) return [];

  const records = await redis.hmGet(recordsKey, matchingNames);
  const results = records.flatMap((record) => (record ? [JSON.parse(record) as HotelOffer] : []));
  logger.info(
    { city: input.city, requestId: input.requestId, total: hotels.length, returned: results.length },
    "Stored and filtered hotel offers in Redis",
  );
  return results;
}
