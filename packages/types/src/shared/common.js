//* API response envelope
// Every API response follows one of these three shapes.
// The backend constructs them via sendSuccess/sendError.
// The frontend destructures them in fetch wrappers.
//*Type guard
export function isApiError(response) {
    return response.status === "error";
}
//# sourceMappingURL=common.js.map