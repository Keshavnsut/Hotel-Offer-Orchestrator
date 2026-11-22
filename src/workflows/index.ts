import { log, proxyActivities, workflowInfo } from "@temporalio/workflow";
import type * as activities from "../activities";
import type { CompareHotelsInput, HotelOffer, SupplierHotel } from "../types";

const supplierActivities = proxyActivities<Pick<typeof activities, "fetchSupplierA" | "fetchSupplierB">>({
  startToCloseTimeout: "10 seconds",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "5 seconds",
    maximumAttempts: 2,
  },
});

const persistenceActivities = proxyActivities<Pick<typeof activities, "replaceAndFilterOffers">>({
  startToCloseTimeout: "10 seconds",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "5 seconds",
    maximumAttempts: 3,
  },
});

function mergeBestOffers(city: string, supplierA: SupplierHotel[], supplierB: SupplierHotel[]): HotelOffer[] {
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

export async function compareHotelsWorkflow(input: CompareHotelsInput): Promise<HotelOffer[]> {
  log.info("Starting supplier comparison", { city: input.city });

  const [supplierA, supplierB] = await Promise.all([
    supplierActivities.fetchSupplierA(input.city),
    supplierActivities.fetchSupplierB(input.city),
  ]);

  const deduplicated = mergeBestOffers(input.city, supplierA, supplierB);
  const result = await persistenceActivities.replaceAndFilterOffers({
    ...input,
    requestId: workflowInfo().workflowId,
    hotels: deduplicated,
  });

  log.info("Supplier comparison completed", {
    city: input.city,
    suppliers: { A: supplierA.length, B: supplierB.length },
    offers: result.length,
  });
  return result;
}
