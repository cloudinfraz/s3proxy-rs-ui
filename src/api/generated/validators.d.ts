// Generated from contracts/admin-openapi.json. Do not edit.
export type ResponseValidator = ((value: unknown) => boolean) & { errors?: readonly unknown[] | null }
export const responseValidators: Partial<Record<string, Readonly<Record<number, ResponseValidator>>>>
