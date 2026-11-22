import { ApplicationFailure, log, proxyActivities, workflowInfo } from "@temporalio/workflow";
import type * as activities from "../activities";
import { mergeBestOffers } from "../mergeOffers";
import type { CompareHotelsInput, HotelOffer } from "../types";

const supplierActivities = proxyActivities<Pick<typeof activities, "fetchSupplierA" | "fetchSupplierB">>({
  startToCloseTimeout: "10 seconds",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "5 seconds",
    maximumAttempts: 2,
  },
});

const cacheActivities = proxyActivities<Pick<typeof activities, "getCachedOffers">>({
  startToCloseTimeout: "5 seconds",
  retry: { initialInterval: "1 second", maximumInterval: "3 seconds", maximumAttempts: 2 },
});

const persistenceActivities = proxyActivities<Pick<typeof activities, "replaceAndFilterOffers">>({
  startToCloseTimeout: "10 seconds",
  retry: {
    initialInterval: "1 second",
    maximumInterval: "5 seconds",
    maximumAttempts: 3,
  },
});

export async function compareHotelsWorkflow(input: CompareHotelsInput): Promise<HotelOffer[]> {
  log.info("Starting supplier comparison", { city: input.city });

  if (!input.refresh) {
    const cached = await cacheActivities.getCachedOffers(input);
    if (cached !== null) {
      log.info("Returning offers from the Redis city cache", { city: input.city, offers: cached.length });
      return cached;
    }
  }

  const [supplierAResult, supplierBResult] = await Promise.allSettled([
    supplierActivities.fetchSupplierA(input.city),
    supplierActivities.fetchSupplierB(input.city),
  ]);

  const supplierA = supplierAResult.status === "fulfilled" ? supplierAResult.value : [];
  const supplierB = supplierBResult.status === "fulfilled" ? supplierBResult.value : [];
  if (supplierAResult.status === "rejected" && supplierBResult.status === "rejected") {
    throw ApplicationFailure.nonRetryable("Both suppliers are unavailable");
  }

  const deduplicated = mergeBestOffers(input.city, supplierA, supplierB);
  const result = await persistenceActivities.replaceAndFilterOffers({
    ...input,
    requestId: workflowInfo().workflowId,
    hotels: deduplicated,
    cacheable: supplierAResult.status === "fulfilled" && supplierBResult.status === "fulfilled",
  });

  if (supplierAResult.status === "rejected" || supplierBResult.status === "rejected") {
    log.warn("Returning partial offers because a supplier is unavailable", {
      city: input.city,
      supplierA: supplierAResult.status,
      supplierB: supplierBResult.status,
    });
  }

  log.info("Supplier comparison completed", {
    city: input.city,
    suppliers: { A: supplierA.length, B: supplierB.length },
    offers: result.length,
  });
  return result;
}
