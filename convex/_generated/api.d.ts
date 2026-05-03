/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as authz from "../authz.js";
import type * as batching from "../batching.js";
import type * as bootstrap from "../bootstrap.js";
import type * as dispatchSettings from "../dispatchSettings.js";
import type * as earnings from "../earnings.js";
import type * as inventoryActions from "../inventoryActions.js";
import type * as messages from "../messages.js";
import type * as offers from "../offers.js";
import type * as orders from "../orders.js";
import type * as ratings from "../ratings.js";
import type * as riderActions from "../riderActions.js";
import type * as riders from "../riders.js";
import type * as staff from "../staff.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  authz: typeof authz;
  batching: typeof batching;
  bootstrap: typeof bootstrap;
  dispatchSettings: typeof dispatchSettings;
  earnings: typeof earnings;
  inventoryActions: typeof inventoryActions;
  messages: typeof messages;
  offers: typeof offers;
  orders: typeof orders;
  ratings: typeof ratings;
  riderActions: typeof riderActions;
  riders: typeof riders;
  staff: typeof staff;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
