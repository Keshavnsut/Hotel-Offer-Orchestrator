import { Router } from "express";
import { getSupplierHotels, isSupplierEnabled } from "./catalog";
import type { SupplierId } from "../types";
import { logger } from "../logger";

export const supplierRouter = Router();

function registerSupplierRoute(path: string, supplier: SupplierId): void {
  supplierRouter.get(path, (request, response) => {
    if (!isSupplierEnabled(supplier)) {
      logger.warn({ supplier }, "Mock supplier is configured as unavailable");
      response.status(503).json({ error: `Supplier ${supplier} is unavailable` });
      return;
    }

    const city = request.query.city;
    if (typeof city !== "string" || city.trim().length === 0) {
      response.status(400).json({ error: "Query parameter 'city' is required" });
      return;
    }

    response.json(getSupplierHotels(supplier, city));
  });
}

registerSupplierRoute("/supplierA/hotels", "A");
registerSupplierRoute("/supplierB/hotels", "B");
