// Minimal JSONP for APIs that don't send CORS headers (Deezer). Rejects on
// network error or timeout so callers can tell "offline" from "no result".
let seq = 0;

export function jsonp(url, { param = 'callback', timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const name = `__jsonp${Date.now().toString(36)}${seq++}`;
    const script = document.createElement('script');
    let timer;

    const cleanup = () => {
      clearTimeout(timer);
      delete window[name];
      script.remove();
    };
    window[name] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('network'));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeout);

    script.src = `${url}${url.includes('?') ? '&' : '?'}${param}=${name}`;
    document.head.appendChild(script);
  });
}
