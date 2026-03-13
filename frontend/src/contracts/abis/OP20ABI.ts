/**
 * OP20ABI — Re-export from the OPNet SDK.
 *
 * The SDK's OP_20_ABI is the canonical OP-20 standard:
 * - Uses increaseAllowance / decreaseAllowance (NOT approve)
 * - Allowance output property is "remaining" (NOT "allowance")
 * - Includes transfer, transferFrom, safeTransfer, burn, metadata, etc.
 *
 * We alias OP_20_ABI → OP20_ABI for consistency with our naming convention.
 */

export { OP_20_ABI as OP20_ABI } from 'opnet';
export type { IOP20Contract } from 'opnet';
