export const api = (path: string, init?: RequestInit) =>
  fetch('https://my-ai-publishing-editor.onrender.com/api/' + path.replace(/^\/+/, ''), init)
