import { verifyCustomerToken } from "./verifyCustomerToken"
import { loadCustomerContext } from "./loadCustomerContext"

export { verifyCustomerToken, resolveOptionalCustomerToken } from "./verifyCustomerToken"
export { loadCustomerContext, attachCustomerContext } from "./loadCustomerContext"

/*
 * The REQUIRED customer chain — identity, then the account row.
 *
 *   router.use("/addresses", ...customerAuthChain, addressRouter)
 *
 * Use attachCustomerContext instead on anything a signed-out visitor should be
 * able to reach, which is most of this module — see the note on
 * MaybeCustomerRequest for why.
 */
export const customerAuthChain = [
  verifyCustomerToken,
  loadCustomerContext,
] as const
