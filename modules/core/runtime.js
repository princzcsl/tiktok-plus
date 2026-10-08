export class ExtensionReloadedError extends Error {
  constructor() {
    super('extension_reloaded');
    this.code = 'extension_reloaded';
  }
}

export function isExtensionAlive() {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

export async function sendBackground(message) {
  if (!isExtensionAlive()) throw new ExtensionReloadedError();

  let response;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (/context invalidated|receiving end/i.test(error.message)) throw new ExtensionReloadedError();
    throw error;
  }

  if (response?.error) throw new Error(response.error);
  return response;
}
