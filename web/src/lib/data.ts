import * as live from "./api";
import * as fixtures from "./fixture-store";
import { ApiError } from "./api-error";
export const isDemo = import.meta.env.PUBLIC_DATA_SOURCE === "fixtures";

function source() {
  return import.meta.env.PUBLIC_DATA_SOURCE === "fixtures" ? fixtures : live;
}

export const getCatalog: typeof live.getCatalog = (...args) => source().getCatalog(...args);
export const listGroupBuys: typeof live.listGroupBuys = (...args) => source().listGroupBuys(...args);
export const getGroupBuy: typeof live.getGroupBuy = (...args) => source().getGroupBuy(...args);
export const createGroupBuy: typeof live.createGroupBuy = (...args) => source().createGroupBuy(...args);
export const joinGroupBuy: typeof live.joinGroupBuy = (...args) => source().joinGroupBuy(...args);
export const updateStatus: typeof live.updateStatus = (...args) => source().updateStatus(...args);
export const listMine: typeof live.listMine = (...args) => source().listMine(...args);
export const updateDeposit: typeof fixtures.updateDeposit = (...args) => {
  if (!isDemo) return Promise.reject(new ApiError(501, "UNAVAILABLE", "Deposit updates are awaiting backend support."));
  return fixtures.updateDeposit(...args);
};
export const completePickup: typeof fixtures.completePickup = (...args) => {
  if (!isDemo) return Promise.reject(new ApiError(501, "UNAVAILABLE", "Pickup check-in is awaiting backend support."));
  return fixtures.completePickup(...args);
};
