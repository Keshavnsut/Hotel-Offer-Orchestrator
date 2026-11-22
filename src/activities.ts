import { redis } from "./redis";
import { config } from "./config";
import { logger } from "./logger";
import type { HotelOffer, StoredOfferRequest, SupplierHotel, SupplierId } from "./types";

const CACHE_TTL_SECONDS = 60 * 60;

function cityCachePrefix(city: string): string {
  return `hotel-offers:${city.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
}

async function filterFromRedis(
  priceIndexKey: string,
  recordsKey: string,
  minPrice: number | null,
  maxPrice: number | null,
): Promise<HotelOffer[]> {
  const matchingNames = await redis.zRangeByScore(
    priceIndexKey,
    minPrice ?? "-inf",
    maxPrice ?? "+inf",
  );
  if (matchingNames.length === 0) return [];

  const records = await redis.hmGet(recordsKey, matchingNames);
  return records.flatMap((record) => (record ? [JSON.parse(record) as HotelOffer] : []));
}

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

export async function getCachedOffers(input: {
  city: string;
  minPrice: number | null;
  maxPrice: number | null;
}): Promise<HotelOffer[] | null> {
  const prefix = cityCachePrefix(input.city);
  const cachedMarkerKey = `${prefix}:cached`;
  if ((await redis.exists(cachedMarkerKey)) === 0) return null;
  return filterFromRedis(`${prefix}:prices`, `${prefix}:records`, input.minPrice, input.maxPrice);
}

export async function replaceAndFilterOffers(input: StoredOfferRequest): Promise<HotelOffer[]> {
  const prefix = cityCachePrefix(input.city);
  const priceIndexKey = `${prefix}:prices`;
  const recordsKey = `${prefix}:records`;
  const cachedMarkerKey = `${prefix}:cached`;
  const uniqueOffers = new Map<string, HotelOffer>();

  for (const hotel of input.hotels) {
    uniqueOffers.set(hotel.name.trim().toLowerCase().replace(/\s+/g, " "), hotel);
  }

  const hotels = [...uniqueOffers.entries()];
  const transaction = redis.multi();
  transaction.del([priceIndexKey, recordsKey, cachedMarkerKey]);

  if (hotels.length > 0) {
    transaction.hSet(recordsKey, Object.fromEntries(hotels.map(([key, hotel]) => [key, JSON.stringify(hotel)])));
    transaction.zAdd(priceIndexKey, hotels.map(([key, hotel]) => ({ score: hotel.price, value: key })));
    transaction.expire(recordsKey, CACHE_TTL_SECONDS);
    transaction.expire(priceIndexKey, CACHE_TTL_SECONDS);
  }
  if (input.cacheable) transaction.set(cachedMarkerKey, "complete", { EX: CACHE_TTL_SECONDS });

  await transaction.exec();

  // The sorted set is the price index; range filtering is performed by Redis.
  const results = await filterFromRedis(priceIndexKey, recordsKey, input.minPrice, input.maxPrice);
  logger.info(
    { city: input.city, requestId: input.requestId, total: hotels.length, returned: results.length, cacheable: input.cacheable },
    "Stored and filtered hotel offers in Redis",
  );
  return results;
}
