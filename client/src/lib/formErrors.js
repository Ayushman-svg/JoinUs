// Turns an API error into { fieldName: message } when the server rejected specific fields.
// Returns null for errors that belong to the whole form (network, wrong password, ...).
export function fieldErrorsFromApi(err) {
  if (err?.code === 'VALIDATION_ERROR' && err.details?.length > 0) {
    const map = {};
    for (const detail of err.details) {
      if (detail.field && !map[detail.field]) map[detail.field] = detail.message;
    }
    return Object.keys(map).length > 0 ? map : null;
  }
  if (err?.code === 'EMAIL_TAKEN') return { email: err.message };
  return null;
}

export function focusField(id) {
  document.getElementById(id)?.focus();
}
